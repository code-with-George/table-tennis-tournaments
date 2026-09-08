import type { GameScore, MatchFormatType } from "../types";

export function gamesToWin(format: MatchFormatType): number {
  if (format === "bo3") return 2;
  if (format === "bo5") return 3;
  return 4;
}

export function isValidGameScore(a: number, b: number): boolean {
  if (!Number.isInteger(a) || !Number.isInteger(b)) return false;
  if (a < 0 || b < 0) return false;
  if (a === b) return false;
  const winner = Math.max(a, b);
  const loser = Math.min(a, b);
  if (winner < 11) return false;
  if (winner === 11) return loser <= 9;
  return winner - loser === 2;
}

export function computeMatchResult(games: GameScore[], format: MatchFormatType) {
  const need = gamesToWin(format);
  let winsA = 0;
  let winsB = 0;
  for (const g of games) {
    if (g.a > g.b) winsA++;
    else if (g.b > g.a) winsB++;
  }
  const done = winsA >= need || winsB >= need;
  return { winsA, winsB, done };
}

export function makeId(): string {
  return crypto.randomUUID();
}
