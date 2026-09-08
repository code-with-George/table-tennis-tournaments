import type { GameScore, Match, MatchFormatType } from "../types";
import { computeMatchResult, makeId } from "./matches";

export function roundLabel(round: number, totalRounds: number): string {
  const diff = totalRounds - round;
  if (diff === 0) return "גמר";
  if (diff === 1) return "חצי גמר";
  if (diff === 2) return "רבע גמר";
  return `סיבוב ${round}`;
}

export interface Qualifier {
  playerId: string;
  seed: number; // 1-indexed, lower = stronger
}

export function seedOrder(size: number): number[] {
  if (size === 1) return [1];
  const prev = seedOrder(size / 2);
  const result: number[] = [];
  for (const s of prev) result.push(s, size + 1 - s);
  return result;
}

export function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** Builds the full knockout bracket (all rounds) from a seeded qualifier list.
 * Byes (when qualifier count isn't a power of 2) are auto-resolved and propagated. */
export function buildKnockoutMatches(tournamentId: string, qualifiers: Qualifier[]): Match[] {
  const bySeed = new Map(qualifiers.map((q) => [q.seed, q.playerId]));
  return buildKnockoutBracket(tournamentId, qualifiers.length, (seed) => bySeed.get(seed));
}

/** Builds an empty knockout "shell": the full bracket shape (all rounds, all
 * slots) with every player slot unresolved. Used when the qualifier count is
 * known (from group sizes) before any group has actually finished playing. */
export function buildKnockoutShell(tournamentId: string, qualifierCount: number): Match[] {
  return buildKnockoutBracket(tournamentId, qualifierCount, () => undefined);
}

/** Shared bracket-construction core: builds every round's match shells, wires
 * round-1 slots via `resolvePlayer(seed)`, and cascades any resulting byes
 * forward. `qualifierCount` only determines bracket size and which seeds are
 * structural byes — it does not need `resolvePlayer` to succeed for every seed. */
function buildKnockoutBracket(
  tournamentId: string,
  qualifierCount: number,
  resolvePlayer: (seed: number) => string | undefined
): Match[] {
  const n = qualifierCount;
  if (n === 0) return [];
  const bracketSize = nextPowerOf2(Math.max(2, n));
  const order = seedOrder(bracketSize);
  const totalRounds = Math.log2(bracketSize);

  const byRoundSlot = new Map<string, Match>();
  const matches: Match[] = [];

  const round1Count = bracketSize / 2;
  for (let slot = 0; slot < round1Count; slot++) {
    const seedA = order[slot * 2];
    const seedB = order[slot * 2 + 1];
    const playerAId = resolvePlayer(seedA);
    const playerBId = resolvePlayer(seedB);
    const match: Match = {
      tournamentId,
      id: makeId(),
      stage: "knockout",
      round: 1,
      slot,
      playerAId,
      playerBId,
      games: [],
      status: playerAId && playerBId ? "ready" : "pending",
    };
    if (playerAId && !playerBId) {
      match.winnerId = playerAId;
      match.status = "done";
    } else if (playerBId && !playerAId) {
      match.winnerId = playerBId;
      match.status = "done";
    }
    matches.push(match);
    byRoundSlot.set(`1:${slot}`, match);
  }

  for (let r = 2; r <= totalRounds; r++) {
    const count = bracketSize / 2 ** r;
    for (let slot = 0; slot < count; slot++) {
      const match: Match = {
        tournamentId,
        id: makeId(),
        stage: "knockout",
        round: r,
        slot,
        games: [],
        status: "pending",
      };
      matches.push(match);
      byRoundSlot.set(`${r}:${slot}`, match);
    }
  }

  // propagate any first-round byes forward (repeat until stable, in case of consecutive byes)
  let changed = true;
  while (changed) {
    changed = false;
    for (let r = 1; r < totalRounds; r++) {
      const count = bracketSize / 2 ** r;
      for (let slot = 0; slot < count; slot++) {
        const m = byRoundSlot.get(`${r}:${slot}`)!;
        if (m.status !== "done" || !m.winnerId) continue;
        const next = byRoundSlot.get(`${r + 1}:${Math.floor(slot / 2)}`);
        if (!next) continue;
        const isA = slot % 2 === 0;
        if (isA && next.playerAId !== m.winnerId) {
          next.playerAId = m.winnerId;
          changed = true;
        } else if (!isA && next.playerBId !== m.winnerId) {
          next.playerBId = m.winnerId;
          changed = true;
        }
        if (next.playerAId && next.playerBId && next.status === "pending") {
          next.status = "ready";
        }
      }
    }
  }

  return matches;
}

/** Re-derives every round from round 1 forward: pushes each match's winner into
 * the next round's slot, and whenever that changes who occupies a slot (e.g. an
 * earlier round's result was corrected after later rounds were already played),
 * clears the now-stale result so the bracket never shows an outcome built on a
 * pairing that no longer holds. Expects fresh copies of the matches (it mutates
 * them in place) and returns the full list, untouched matches included. */
export function propagateBracket(allMatches: Match[]): Match[] {
  const knockout = allMatches.filter(
    (m): m is Match & { round: number; slot: number } =>
      m.stage === "knockout" && m.round !== undefined && m.slot !== undefined
  );
  const byKey = new Map(knockout.map((m) => [`${m.round}:${m.slot}`, m]));
  const maxRound = knockout.reduce((max, m) => Math.max(max, m.round), 0);
  const sorted = [...knockout].sort((a, b) => a.round - b.round || a.slot - b.slot);

  for (const m of sorted) {
    if (m.round >= maxRound) continue;
    const next = byKey.get(`${m.round + 1}:${Math.floor(m.slot / 2)}`);
    if (!next) continue;
    const isA = m.slot % 2 === 0;
    const currentId = isA ? next.playerAId : next.playerBId;
    if (currentId !== m.winnerId) {
      if (isA) next.playerAId = m.winnerId;
      else next.playerBId = m.winnerId;
      next.games = [];
      next.winnerId = undefined;
      next.status = next.playerAId && next.playerBId ? "ready" : "pending";
    }
  }

  const otherMatches = allMatches.filter((m) => m.stage !== "knockout");
  return [...otherMatches, ...knockout];
}

/** Applies a saved score to one knockout match and re-derives everything
 * downstream from it (winner propagation + stale-result invalidation via
 * propagateBracket). Expects fresh copies of every knockout match for the
 * tournament; returns the updated list plus whether the final is now decided. */
export function resolveKnockoutMatch(
  matches: Match[],
  matchId: string,
  games: GameScore[],
  format: MatchFormatType
): { matches: Match[]; finalDecided: boolean } {
  const target = matches.find((m) => m.id === matchId);
  if (!target) return { matches, finalDecided: false };

  const { winsA, winsB, done } = computeMatchResult(games, format);
  target.games = games;
  target.winnerId = done ? (winsA > winsB ? target.playerAId : target.playerBId) : undefined;
  target.status = done ? "done" : "ready";

  const propagated = propagateBracket(matches);
  const totalRounds = propagated.reduce((max, m) => Math.max(max, m.round ?? 0), 0);
  const final = propagated.find((m) => m.round === totalRounds);
  const finalDecided = !!(final?.status === "done" && final.winnerId);
  return { matches: propagated, finalDecided };
}
