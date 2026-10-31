create schema if not exists game_private;
revoke all on schema game_private from public, anon, authenticated;
-- ECMAScript trim whitespace, mirrored by String.trim() in the browser.
create function game_private.trim_input(value text) returns text language sql immutable set search_path='' as $$
 select btrim(coalesce(value,''), E' \t\n\r\f' || chr(11) || chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279));
$$;
revoke all on function game_private.trim_input(text) from public,anon,authenticated;
create table game_private.games(code text primary key check(code ~ '^[0-9]{6}$'), body jsonb not null, created_at timestamptz not null default now());
create table public.game_rooms(code text primary key references game_private.games(code) on delete cascade, revision bigint not null default 0);
alter table game_private.games enable row level security;
alter table public.game_rooms enable row level security;
revoke all on game_private.games from public,anon,authenticated;
revoke all on public.game_rooms from public,anon,authenticated;
grant select on public.game_rooms to authenticated;
create function public.is_game_member(room_code text) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from game_private.games g, jsonb_array_elements(g.body->'players') p where g.code=room_code and p->>'id'=auth.uid()::text);
$$;
revoke all on function public.is_game_member(text) from public,anon;
grant execute on function public.is_game_member(text) to authenticated;
create policy member_revision on public.game_rooms for select to authenticated using(public.is_game_member(code));
-- Realtime carries only revisions, never answers or full private state.
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='game_rooms') then
 alter publication supabase_realtime add table public.game_rooms;
 end if;
end $$;
create function public.game_command(action text, code text default '', args jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 who text := auth.uid()::text; room_code text := code;
 b jsonb; players jsonb; p jsonb; mine jsonb; out_players jsonb := '[]';
 clean text; nick text; host_player jsonb;
 total integer; submitted integer; highest integer; score integer; entry jsonb;
 changed boolean := false; stamp numeric := extract(epoch from now()); attempt integer;
begin
 if who is null then raise exception '请先连接匿名身份'; end if;
 if action='create' then
   nick:=game_private.trim_input(args->>'name');
   if char_length(nick) not between 1 and 16 then raise exception '昵称需要 1–16 个字符'; end if;
   if coalesce(args->>'mode','') not in ('classic','challenge') then raise exception '无效的游戏模式'; end if;
   if (select count(*) from game_private.games g where g.body->>'host'=who and g.created_at>now()-interval '1 hour')>=10 then raise exception '创建太频繁，请稍后再试'; end if;
   for attempt in 1..20 loop
     room_code:=(floor(random()*900000)+100000)::integer::text;
     b:=jsonb_build_object('code',room_code,'host',who,'mode',args->>'mode','phase','lobby','round',0,'game',1,'history','[]'::jsonb,'players',jsonb_build_array(jsonb_build_object('id',who,'name',nick,'seen',stamp,'word',null)));
     begin
       insert into game_private.games(code,body) values(room_code,b);
       insert into public.game_rooms(code) values(room_code);
       exit;
     exception when unique_violation then
       if attempt=20 then raise exception '房间繁忙，请重试'; end if;
     end;
   end loop;
 else
   -- A room row lock serializes concurrent submissions, starts, joins and exits.
   select g.body into b from game_private.games g where g.code=room_code for update;
   if not found then raise exception '房间不存在，请检查房间号'; end if;
   players:=b->'players';
   select value into mine from jsonb_array_elements(players) where value->>'id'=who;
   if action='join' and mine is null then
     if b->>'phase'<>'lobby' and not(b->>'phase' in ('writing','revealed','won') and jsonb_array_length(players)<2) then raise exception '游戏已开始，等待本局结束'; end if;
     if jsonb_array_length(players)>=10 then raise exception '房间已满'; end if;
     nick:=game_private.trim_input(args->>'name');
     if char_length(nick) not between 1 and 16 then raise exception '昵称需要 1–16 个字符'; end if;
     players:=players||jsonb_build_array(jsonb_build_object('id',who,'name',nick,'seen',stamp,'word',null));changed:=true;
   elsif mine is null then raise exception '你已不在房间中，请重新加入'; end if;
   select coalesce(jsonb_agg(case when value->>'id'=who then value||jsonb_build_object('seen',stamp) else value end order by ord),'[]'::jsonb) into players from jsonb_array_elements(players) with ordinality as x(value,ord);
   b:=jsonb_set(b,'{players}',players);
   if action in ('start','next','restart') then
     if b->>'host'<>who then raise exception '只有房主可以操作'; end if;
     if jsonb_array_length(players)<2 then raise exception '至少需要 2 位玩家'; end if;
     if action='start' and b->>'phase'<>'lobby' or action='next' and b->>'phase'<>'revealed' or action='restart' and b->>'phase'<>'won' then raise exception '状态已变化，请刷新'; end if;
     if action='restart' then b:=b||jsonb_build_object('history','[]'::jsonb,'round',0,'game',(b->>'game')::int+1); end if;
     select jsonb_agg(value||jsonb_build_object('word',null) order by ord) into players from jsonb_array_elements(players) with ordinality as x(value,ord);
     b:=b||jsonb_build_object('phase','writing','round',(b->>'round')::int+1);changed:=true;
   elsif action='submit' then
     if b->>'phase'<>'writing' or (args->>'round')::int is distinct from (b->>'round')::int or (args->>'game')::int is distinct from (b->>'game')::int then raise exception '本轮已结束，请刷新'; end if;
     clean:=game_private.trim_input(args->>'word');
     if char_length(clean) not between 1 and 20 or clean !~ '^[一-鿿㐀-䶿]+$' then raise exception '请输入 1–20 个汉字，不含标点和内部空格'; end if;
     if mine->>'word' is not null then
       if mine->>'word'<>clean then raise exception '答案已锁定，不能修改'; end if;
     else
       select jsonb_agg(case when value->>'id'=who then value||jsonb_build_object('word',clean) else value end order by ord) into players from jsonb_array_elements(players) with ordinality as x(value,ord);changed:=true;
     end if;
   elsif action in ('leave','remove') then
     if action='remove' then
       if b->>'host'<>who or args->>'player'=who then raise exception '仅房主可移除其他离线玩家'; end if;
       select value into p from jsonb_array_elements(players) where value->>'id'=args->>'player';
       if p is null or (p->>'seen')::numeric>stamp-45 then raise exception '该玩家尚未离线 45 秒'; end if;
     end if;
     select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into players from jsonb_array_elements(players) with ordinality as x(value,ord) where value->>'id'<>case when action='leave' then who else args->>'player' end;
     if b->>'host'=who and action='leave' then b:=jsonb_set(b,'{host}',coalesce(players->0->'id','null'::jsonb)); end if;
     if jsonb_array_length(players)=0 then b:=jsonb_set(b,'{phase}','"closed"'); end if;changed:=true;
   elsif action='claim' then
     select value into host_player from jsonb_array_elements(players) where value->>'id'=b->>'host';
     if (host_player->>'seen')::numeric>stamp-45 then raise exception '房主仍在线'; end if;
     b:=jsonb_set(b,'{host}',to_jsonb(who));changed:=true;
   elsif action not in ('state','join') then raise exception '未知操作'; end if;
   b:=jsonb_set(b,'{players}',players);
   -- A departed player's unrevealed answer is retracted; history stays immutable.
   if b->>'phase'='writing' then
     total:=jsonb_array_length(players);
     select count(*) into submitted from jsonb_array_elements(players) where value->>'word' is not null;
     if total>=2 and total=submitted then
       select max(n) into highest from (select count(*) n from jsonb_array_elements(players) group by value->>'word') grouped;
       score:=round(highest::numeric/total*100);
       select jsonb_build_object('n',(b->>'round')::int,'score',score,'words',jsonb_agg(jsonb_build_object('name',value->>'name','word',value->>'word') order by ord)) into entry from jsonb_array_elements(players) with ordinality as x(value,ord);
       b:=b||jsonb_build_object('phase',case when highest=total then 'won' else 'revealed' end,'history',(b->'history')||jsonb_build_array(entry));changed:=true;
     end if;
   end if;
   update game_private.games g set body=b where g.code=room_code;
   if changed then update public.game_rooms r set revision=revision+1 where r.code=room_code; end if;
 end if;
 -- Explicit projection is the ONLY response path: no other player's private word.
 for p in select value from jsonb_array_elements(b->'players') loop
   out_players:=out_players||jsonb_build_array(jsonb_build_object('id',p->>'id','name',p->>'name','online',(p->>'seen')::numeric>stamp-45,'submitted',p->>'word' is not null));
 end loop;
 select value into mine from jsonb_array_elements(b->'players') where value->>'id'=who;
 return (b-'players')||jsonb_build_object('players',out_players,'mine',mine->>'word');
end;
$$;
revoke all on function public.game_command(text,text,jsonb) from public,anon;
grant execute on function public.game_command(text,text,jsonb) to authenticated;
