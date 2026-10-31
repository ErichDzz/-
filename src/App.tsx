import { useEffect, useState } from "react";
import { command, configured, db, identify } from "./api";
import type { Room } from "./domain";
export default function App() {
  const [room, setRoom] = useState<Room | null>(null),
    [uid, setUid] = useState(""),
    [name, setName] = useState(localStorage.getItem("nickname") ?? ""),
    [code, setCode] = useState(
      new URLSearchParams(location.search).get("room") ??
        localStorage.getItem("room") ??
        "",
    ),
    [mode, setMode] = useState("classic"),
    [word, setWord] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");

  useEffect(() => {
    if (!configured) return;
    let live = true;
    const restore = async () => {
      try {
        const id = await identify();
        if (!live) return;
        setUid(id);
        const saved = localStorage.getItem("room");
        const invited = new URLSearchParams(location.search).get("room");
        if (saved && (!invited || invited === saved)) {
          const r = await command("state", saved);
          if (live) {
            setRoom(r);
            setError("");
          }
        }
      } catch (e) {
        if (!live) return;
        const message = (e as Error).message;
        if (message.includes("不在房间") || message.includes("不存在"))
          localStorage.removeItem("room");
        setError(message);
      }
    };
    void restore();
    window.addEventListener("online", restore);
    return () => {
      live = false;
      window.removeEventListener("online", restore);
    };
  }, []);
  useEffect(() => {
    if (!room) return;
    let live = true;
    let refreshing = false;
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const r = await command("state", room.code);
        if (live) {
          setRoom(r);
          setError("");
        }
      } catch (e) {
        if (live) {
          setError((e as Error).message);
          if ((e as Error).message.includes("不在房间")) {
            setRoom(null);
            localStorage.removeItem("room");
          }
        }
      } finally {
        refreshing = false;
      }
    };
    const timer = setInterval(refresh, 5000);
    const channel = db!
      .channel("room-" + room.code)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "game_rooms",
          filter: "code=eq." + room.code,
        },
        refresh,
      )
      .subscribe();
    window.addEventListener("online", refresh);
    return () => {
      live = false;
      clearInterval(timer);
      void db!.removeChannel(channel);
      window.removeEventListener("online", refresh);
    };
  }, [room?.code]);
  useEffect(() => setWord(""), [room?.round, room?.game]);
  async function run(action: string, args: Record<string, unknown> = {}) {
    setBusy(true);
    setError("");
    try {
      const r = await command(action, room?.code ?? code, args);
      if (action === "leave") {
        setRoom(null);
        localStorage.removeItem("room");
        history.replaceState(null, "", location.pathname);
      } else {
        setRoom(r);
        setCode(r.code);
        localStorage.setItem("room", r.code);
        localStorage.setItem("nickname", name);
        history.replaceState(null, "", "?room=" + r.code);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const host = room?.host === uid,
    me = room?.players.find((p) => p.id === uid),
    others = room?.players.filter((p) => p.id !== uid) ?? [];
  const hostOnline = room?.players.find((p) => p.id === room.host)?.online;
  return (
    <main>
      <header>
        <a href="./" className="brand">
          同词相遇<span>WORDS, TOGETHER</span>
        </a>
        <span className="pill">
          {room ? `${room.players.length} 位伙伴` : "2–10 人 · 无需注册"}
        </span>
      </header>
      {!room ? (
        <>
          <section className="hero">
            <span className="eyebrow">一点联想，一点默契</span>
            <h1>
              兜兜转转，
              <br />
              想到<span>一起。</span>
            </h1>
            <p>
              从不同的词出发，找到同一个答案。
              <br />
              把这一刻，留给你和朋友。
            </p>
            <div className="orbs">
              <span>海浪</span>
              <b>↗</b>
              <span>夏天</span>
            </div>
          </section>
          <section className="card">
            <h2>相遇，从这里开始</h2>
            {!configured && (
              <p className="alert">
                开发预览：请按 README 配置 Supabase 后开始联机。
              </p>
            )}
            <label>
              你的昵称
              <input
                maxLength={16}
                placeholder="让朋友认出你"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <div className="modes">
              <button
                className={mode === "classic" ? "selected" : ""}
                onClick={() => setMode("classic")}
              >
                经典模式<small>一直联想，直到相遇</small>
              </button>
              <button
                className={mode === "challenge" ? "selected" : ""}
                onClick={() => setMode("challenge")}
              >
                默契挑战<small>记录每轮默契趋势</small>
              </button>
            </div>
            <button
              className="primary"
              disabled={busy || !configured || !name.trim()}
              onClick={() => run("create", { name, mode })}
            >
              创建房间 ↗
            </button>
            <div className="divider">或加入朋友的房间</div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run("join", { name });
              }}
              className="join"
            >
              <input
                aria-label="6位房间号"
                inputMode="numeric"
                maxLength={6}
                placeholder="6 位房间号"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
              <button
                disabled={
                  busy || !configured || !name.trim() || code.length !== 6
                }
              >
                加入
              </button>
            </form>
          </section>
          <footer>没有标准答案，只有我们的共同答案。</footer>
        </>
      ) : (
        <>
          <section className="roomhead">
            <span className="eyebrow">
              {room.mode === "classic" ? "经典模式" : "默契挑战"} · 第{" "}
              {room.game} 局
            </span>
            <h1>
              {room.phase === "lobby"
                ? "等朋友，来相遇"
                : room.phase === "won"
                  ? "我们，想到一起了！"
                  : room.phase === "closed"
                    ? "房间已结束"
                    : `第 ${room.round} 轮联想`}
            </h1>
            <button
              className="link"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(location.href);
                  setNotice("邀请链接已复制");
                } catch {
                  setNotice("请复制浏览器地址邀请朋友");
                }
              }}
            >
              房间 {room.code} · 复制邀请链接
            </button>
          </section>
          <section className="card">
            <div className="people">
              {room.players.map((p) => (
                <div className="person" key={p.id}>
                  <span className={"avatar " + (p.online ? "" : "offline")}>
                    {p.name.slice(0, 1)}
                  </span>
                  <strong>
                    {p.name}
                    {p.id === uid ? "（你）" : ""}
                  </strong>
                  <small>
                    {p.id === room.host ? "房主 · " : ""}
                    {!p.online
                      ? "离线，等待重连"
                      : p.submitted
                        ? "已锁定 ✓"
                        : "在线"}
                  </small>
                  {host && !p.online && p.id !== uid && (
                    <button
                      disabled={busy}
                      onClick={() => {
                        if (
                          confirm(
                            `移除 ${p.name}？其本轮答案也会移除，剩余玩家继续。`,
                          )
                        )
                          void run("remove", { player: p.id });
                      }}
                    >
                      移除离线席位
                    </button>
                  )}
                </div>
              ))}
            </div>
            {room.phase === "lobby" && (
              <>
                <p>
                  第一轮自由写一个中文词语；接下来根据上一轮的词共同联想。所有人写下相同的词，就相遇成功。
                </p>
                <button
                  className="primary"
                  disabled={busy || !host || room.players.length < 2}
                  onClick={() => run("start")}
                >
                  {host ? "开始相遇" : "等待房主开始"}
                </button>
              </>
            )}
            {room.phase === "writing" && (
              <>
                <p>答案会在所有人提交后一起揭晓。没有倒计时，慢慢想。</p>
                {room.mine ? (
                  <div className="locked">
                    <small>你的答案已锁定</small>
                    <h2>{room.mine}</h2>
                    <p>
                      等待 {others.filter((p) => !p.submitted).length} 位伙伴
                    </p>
                  </div>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run("submit", {
                        word,
                        round: room.round,
                        game: room.game,
                      });
                    }}
                  >
                    <label>
                      这一轮，你想到
                      <input
                        value={word}
                        maxLength={20}
                        placeholder="写一个中文词语"
                        onChange={(e) => setWord(e.target.value)}
                        required
                      />
                    </label>
                    <button
                      className="primary"
                      disabled={busy || !word.trim() || !me}
                      type="submit"
                    >
                      锁定答案
                    </button>
                  </form>
                )}
              </>
            )}
            {(room.phase === "revealed" || room.phase === "won") && (
              <>
                <div className={room.phase === "won" ? "success" : ""}>
                  <h2>
                    {room.phase === "won" ? "✦ 默契达成" : "不同的词，新的方向"}
                  </h2>
                  <p>
                    {room.phase === "won"
                      ? "原来我们的心，走到了同一个地方。"
                      : "把这些词连起来，下一个共同答案会是什么？"}
                  </p>
                </div>
                <button
                  className="primary"
                  disabled={busy || !host || room.players.length < 2}
                  onClick={() => run(room.phase === "won" ? "restart" : "next")}
                >
                  {host
                    ? room.phase === "won"
                      ? "再来一局"
                      : "开始下一轮"
                    : "等待房主继续"}
                </button>
              </>
            )}
            {!host && !hostOnline && (
              <button disabled={busy} onClick={() => run("claim")}>
                房主已离线 · 接管房主
              </button>
            )}
            <p className="hint">
              离线不会自动跳过。离线超过 45
              秒可由房主移除；房主离线时，在线玩家可接管。少于 2
              人时保留本轮，等待伙伴或退出。
            </p>
            <button
              className="link danger"
              disabled={busy}
              onClick={() => {
                if (confirm("确定主动退出？本轮你的答案会移除。"))
                  void run("leave");
              }}
            >
              退出房间
            </button>
          </section>
          {room.history.length > 0 && (
            <section className="card">
              <h2>我们的联想轨迹</h2>
              {room.mode === "challenge" && (
                <div className="trend" aria-label="每轮默契趋势">
                  {room.history.map((r) => (
                    <div key={r.n}>
                      <i style={{ height: `${Math.max(r.score, 4)}px` }} />
                      <strong>{r.score}%</strong>
                      <small>第 {r.n} 轮</small>
                    </div>
                  ))}
                </div>
              )}
              {[...room.history].reverse().map((r) => (
                <article key={r.n}>
                  <h3>
                    第 {r.n} 轮{" "}
                    {room.mode === "challenge" && <span>{r.score}% 默契</span>}
                  </h3>
                  <div className="words">
                    {r.words.map((w, i) => (
                      <div key={i}>
                        <b>{w.word}</b>
                        <small>{w.name}</small>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </section>
          )}
        </>
      )}
      {error && (
        <div role="alert" className="toast error">
          {error}
        </div>
      )}
      {notice && (
        <button className="toast" onClick={() => setNotice("")}>
          {notice} ×
        </button>
      )}
    </main>
  );
}
