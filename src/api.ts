import { createClient } from "@supabase/supabase-js";
import type { Room } from "./domain";
const env = import.meta.env;
export const configured = !!(
  env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY
);
export const db = configured
  ? createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
  : null;
let identity: Promise<string> | null = null;
export function identify(): Promise<string> {
  return (identity ??= (async () => {
    if (!db) throw new Error("请先配置 Supabase");
    const { data, error } = await db.auth.getSession();
    if (error) throw error;
    if (data.session) {
      await db.realtime.setAuth(data.session.access_token);
      return data.session.user.id;
    }
    const signed = await db.auth.signInAnonymously();
    if (signed.error) throw signed.error;
    await db.realtime.setAuth(signed.data.session!.access_token);
    return signed.data.user!.id;
  })().catch((e) => {
    identity = null;
    throw e;
  }));
}
async function perform(
  action: string,
  code: string,
  args: Record<string, unknown> = {},
): Promise<Room> {
  await identify();
  const { data, error } = await db!
    .rpc("game_command", { action, code, args })
    .abortSignal(AbortSignal.timeout(15000));
  if (error) throw new Error(error.message);
  return data as Room;
}

// Serialize this tab's reads and writes so an older poll cannot overwrite a submission.
let queue: Promise<unknown> = Promise.resolve();
export function command(
  action: string,
  code: string,
  args: Record<string, unknown> = {},
): Promise<Room> {
  const next = queue.then(() => perform(action, code, args));
  queue = next.catch(() => undefined);
  return next;
}
