import type { Match, MatchFormatType } from "../types";
import { computeMatchResult } from "./matches";

export interface StandingRow {
  playerId: string;
  played: number;
  matchWins: number;
  matchLosses: number;
  gameWins: number;
  gameLosses: number;
  pointWins: number;
  pointLosses: number;
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

export function computeGroupStandings(
  playerIds: string[],
  matches: Match[],
  format: MatchFormatType
): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  for (const id of playerIds) {
    rows.set(id, {
      playerId: id,
      played: 0,
      matchWins: 0,
      matchLosses: 0,
      gameWins: 0,
      gameLosses: 0,
      pointWins: 0,
      pointLosses: 0,
    });
  }

  const headToHead = new Map<string, string>(); // pairKey -> winnerId

  for (const m of matches) {
    if (!m.playerAId || !m.playerBId) continue;
    const a = rows.get(m.playerAId);
    const b = rows.get(m.playerBId);
    if (!a || !b) continue;
    if (m.games.length === 0) continue;

    // sets/points update as soon as they're entered, even mid-match — only the
    // match win/loss credit waits for the match to actually be decided
    const { winsA, winsB, done } = computeMatchResult(m.games, format);
    a.gameWins += winsA;
    a.gameLosses += winsB;
    b.gameWins += winsB;
    b.gameLosses += winsA;
    for (const g of m.games) {
      a.pointWins += g.a;
      a.pointLosses += g.b;
      b.pointWins += g.b;
      b.pointLosses += g.a;
    }
    if (!done) continue;

    a.played++;
    b.played++;
    const winnerId = winsA > winsB ? m.playerAId : m.playerBId;
    if (winnerId === m.playerAId) {
      a.matchWins++;
      b.matchLosses++;
    } else {
      b.matchWins++;
      a.matchLosses++;
    }
    headToHead.set(pairKey(m.playerAId, m.playerBId), winnerId);
  }

  const list = Array.from(rows.values());
  list.sort((x, y) => {
    if (y.matchWins !== x.matchWins) return y.matchWins - x.matchWins;
    const xGameDiff = x.gameWins - x.gameLosses;
    const yGameDiff = y.gameWins - y.gameLosses;
    if (yGameDiff !== xGameDiff) return yGameDiff - xGameDiff;
    const xPointDiff = x.pointWins - x.pointLosses;
    const yPointDiff = y.pointWins - y.pointLosses;
    if (yPointDiff !== xPointDiff) return yPointDiff - xPointDiff;
    const h2h = headToHead.get(pairKey(x.playerId, y.playerId));
    if (h2h === x.playerId) return -1;
    if (h2h === y.playerId) return 1;
    return 0;
  });
  return list;
}
