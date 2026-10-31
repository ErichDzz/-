import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
const sql = readFileSync(
  new URL("../supabase/migrations/202610310001_game.sql", import.meta.url),
  "utf8",
);
const pg = new PGlite();
const a = "10000000-0000-4000-8000-000000000001",
  b = "10000000-0000-4000-8000-000000000002",
  c = "10000000-0000-4000-8000-000000000003";
async function call(
  user: string,
  action: string,
  code = "",
  args: Record<string, unknown> = {},
) {
  await pg.query("select set_config('test.uid',$1,false)", [user]);
  return (
    await pg.query<{ r: any }>(
      "select public.game_command($1,$2,$3::jsonb) r",
      [action, code, JSON.stringify(args)],
    )
  ).rows[0].r;
}
beforeAll(async () => {
  await pg.exec(
    `create role anon; create role authenticated; create schema auth; create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$; create publication supabase_realtime;`,
  );
  await pg.exec(sql);
}, 30000);
afterAll(() => pg.close());
describe("authoritative database game", () => {
  it("keeps answers private, locks submissions, reveals once and rejects stale rounds", async () => {
    const r = await call(a, "create", "", { name: "甲", mode: "challenge" }),
      code = r.code;
    await call(b, "join", code, { name: "乙" });
    await call(c, "join", code, { name: "丙" });
    await expect(call(b, "start", code)).rejects.toThrow("房主");
    await call(a, "start", code);
    const first = await call(a, "submit", code, {
      word: "　海浪\u00a0",
      round: 1,
      game: 1,
    });
    expect(first.mine).toBe("海浪");
    expect(first.phase).toBe("writing");
    const other = await call(b, "state", code);
    expect(JSON.stringify(other)).not.toContain("海浪");
    expect(other.history).toEqual([]);
    await expect(
      call(a, "submit", code, { word: "山", round: 1, game: 1 }),
    ).rejects.toThrow("锁定");
    expect(
      (await call(a, "submit", code, { word: "海浪", round: 1, game: 1 }))
        .history,
    ).toHaveLength(0);
    await call(b, "submit", code, { word: "海浪", round: 1, game: 1 });
    const final = await call(c, "submit", code, {
      word: "夏天",
      round: 1,
      game: 1,
    });
    expect(final.phase).toBe("revealed");
    expect(final.history[0].score).toBe(67);
    expect(final.history).toHaveLength(1);
    await call(a, "next", code);
    await expect(
      call(c, "submit", code, { word: "海浪", round: 1, game: 1 }),
    ).rejects.toThrow("本轮");
    for (const id of [a, b, c])
      await call(id, "submit", code, { word: "夏天", round: 2, game: 1 });
    expect((await call(a, "state", code)).phase).toBe("won");
    const next = await call(a, "restart", code);
    expect(next.game).toBe(2);
    expect(next.history).toEqual([]);
    expect(next.mine).toBeNull();
  });
  it("retracts exiting answers and never wins with only one remaining player", async () => {
    const r = await call(a, "create", "", { name: "甲", mode: "classic" }),
      code = r.code;
    await call(b, "join", code, { name: "乙" });
    await call(a, "start", code);
    await call(a, "submit", code, { word: "星星", round: 1, game: 1 });
    const left = await call(b, "leave", code);
    expect(left.phase).toBe("writing");
    expect(left.history).toEqual([]);
    await call(c, "join", code, { name: "丙" });
    const win = await call(c, "submit", code, {
      word: "星星",
      round: 1,
      game: 1,
    });
    expect(win.phase).toBe("won");
    expect(win.history[0].words).toHaveLength(2);
  });
  it("requires explicit removal, supports host takeover, and preserves locked words on refresh", async () => {
    const r = await call(a, "create", "", { name: "甲", mode: "classic" }),
      code = r.code;
    await call(b, "join", code, { name: "乙" });
    await call(c, "join", code, { name: "丙" });
    await call(a, "start", code);
    await call(b, "submit", code, { word: "月亮", round: 1, game: 1 });
    await call(c, "submit", code, { word: "月亮", round: 1, game: 1 });
    await expect(call(b, "claim", code)).rejects.toThrow("在线");
    await pg.query(
      `update game_private.games set body=jsonb_set(body,'{players,0,seen}','0') where code=$1`,
      [code],
    );
    const waiting = await call(b, "state", code);
    expect(waiting.phase).toBe("writing");
    expect(waiting.mine).toBe("月亮");
    expect(waiting.players[0].online).toBe(false);
    await call(b, "claim", code);
    const win = await call(b, "remove", code, { player: a });
    expect(win.phase).toBe("won");
    expect(win.host).toBe(b);
    await expect(call(a, "state", code)).rejects.toThrow("不在房间");
  });
  it("denies direct tables, anonymous RPC and outsider state", async () => {
    const r = await call(a, "create", "", { name: "甲", mode: "classic" });
    await expect(call(b, "state", r.code)).rejects.toThrow("不在房间");
    await pg.query("select set_config('test.uid',$1,false)", [
      "10000000-0000-4000-8000-000000000099",
    ]);
    await pg.exec("set role authenticated");
    await expect(pg.query("select * from game_private.games")).rejects.toThrow(
      "permission denied",
    );
    expect(
      (await pg.query("select * from public.game_rooms")).rows,
    ).toHaveLength(0);
    await expect(
      pg.query("update public.game_rooms set revision=900"),
    ).rejects.toThrow("permission denied");
    await pg.exec("reset role;set role anon");
    await expect(
      pg.query("select public.game_command('state','123456','{}')"),
    ).rejects.toThrow("permission denied");
    await pg.exec("reset role");
  });
  it("enforces player bounds, Chinese words, and closes an empty room", async () => {
    const r = await call(a, "create", "", { name: "甲", mode: "classic" });
    await expect(call(a, "start", r.code)).rejects.toThrow("2");
    await call(b, "join", r.code, { name: "乙" });
    await call(a, "start", r.code);
    await expect(
      call(a, "submit", r.code, { word: "hello", round: 1, game: 1 }),
    ).rejects.toThrow("汉字");
    await call(a, "leave", r.code);
    expect((await call(b, "state", r.code)).host).toBe(b);
    expect((await call(b, "leave", r.code)).phase).toBe("closed");
    await expect(call(c, "join", r.code, { name: "丙" })).rejects.toThrow(
      "开始",
    );
  });
});
it("enforces maximum of ten seats", async () => {
  const r = await call(a, "create", "", { name: "房主", mode: "classic" });
  for (let i = 10; i < 19; i++)
    await call(
      `20000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      "join",
      r.code,
      { name: "伙伴" + i },
    );
  await expect(call(c, "join", r.code, { name: "多一人" })).rejects.toThrow(
    "已满",
  );
  expect((await call(a, "state", r.code)).players).toHaveLength(10);
});

it("allows replenishing a single seat after reveal without changing history", async () => {
  const r = await call(a, "create", "", { name: "甲", mode: "classic" });
  await call(b, "join", r.code, { name: "乙" });
  await call(a, "start", r.code);
  await call(a, "submit", r.code, { word: "大海", round: 1, game: 1 });
  await call(b, "submit", r.code, { word: "高山", round: 1, game: 1 });
  await call(b, "leave", r.code);
  const restored = await call(c, "join", r.code, { name: "丙" });
  expect(restored.history[0].words.map((w: any) => w.name)).toEqual([
    "甲",
    "乙",
  ]);
  expect((await call(a, "next", r.code)).phase).toBe("writing");
});
