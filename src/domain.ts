export type Player = {
  id: string;
  name: string;
  online: boolean;
  submitted: boolean;
};
export type Round = {
  n: number;
  score: number;
  words: { name: string; word: string }[];
};
export type Room = {
  code: string;
  host: string;
  mode: "classic" | "challenge";
  phase: "lobby" | "writing" | "revealed" | "won" | "closed";
  round: number;
  players: Player[];
  history: Round[];
  mine: string | null;
  game: number;
};
export const normalizeWord = (value: string) => value.trim();
export function matchScore(words: string[]) {
  if (!words.length) return 0;
  const counts = new Map<string, number>();
  for (const word of words) {
    const w = normalizeWord(word);
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return Math.round((Math.max(...counts.values()) / words.length) * 100);
}
