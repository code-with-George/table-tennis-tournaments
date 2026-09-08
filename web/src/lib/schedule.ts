import type { Match, Player } from "../types";

/** Standard "circle method" round-robin scheduling: splits N players into
 * rounds where every round's pairs are disjoint (no player appears twice in
 * the same round). This is what makes a group's matches playable in parallel
 * across tables without ever double-booking a player. Odd counts get a bye
 * each round. */
function circleMethodRounds(playerIds: string[]): [string, string][][] {
  const arr: string[] = [...playerIds];
  if (arr.length % 2 === 1) arr.push("__bye__");
  const n = arr.length;
  if (n < 2) return [];
  const rounds: [string, string][][] = [];

  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a !== "__bye__" && b !== "__bye__") pairs.push([a, b]);
    }
    rounds.push(pairs);

    const fixed = arr[0];
    const rest = arr.slice(1);
    rest.unshift(rest.pop()!);
    arr.splice(0, arr.length, fixed, ...rest);
  }
  return rounds;
}

function findMatchForPair(matches: Match[], a: string, b: string): Match | undefined {
  return matches.find(
    (m) => (m.playerAId === a && m.playerBId === b) || (m.playerAId === b && m.playerBId === a)
  );
}

/** One group's matches, ordered into circle-method rounds. */
function orderGroupMatches(groupPlayerIds: string[], groupMatches: Match[]): Match[][] {
  const rounds = circleMethodRounds(groupPlayerIds);
  return rounds.map((pairs) =>
    pairs.map(([a, b]) => findMatchForPair(groupMatches, a, b)).filter((m): m is Match => !!m)
  );
}

/** The full play order for the group stage: each group's matches are split
 * into rounds (via the circle method), then rounds are interleaved across
 * groups — round 1 of every group, then round 2 of every group, etc. — so
 * that at any point several groups can be playing on different tables at
 * once instead of finishing one group before starting the next. */
export function buildGroupQueue(groups: { players: Player[]; matches: Match[] }[]): Match[] {
  const perGroupRounds = groups.map((g) => orderGroupMatches(g.players.map((p) => p.id), g.matches));
  const maxRounds = Math.max(0, ...perGroupRounds.map((r) => r.length));
  const queue: Match[] = [];
  for (let r = 0; r < maxRounds; r++) {
    // zip at the individual-match level (not just round-by-round) so tables
    // fill with matches from *different* groups first, instead of exhausting
    // one group's round before another group gets a turn
    const maxMatchesInRound = Math.max(0, ...perGroupRounds.map((gr) => gr[r]?.length ?? 0));
    for (let mi = 0; mi < maxMatchesInRound; mi++) {
      for (const groupRounds of perGroupRounds) {
        const m = groupRounds[r]?.[mi];
        if (m) queue.push(m);
      }
    }
  }
  return queue;
}

/** Knockout play order: round 1 first (all playable in parallel), then round
 * 2, etc. — later rounds naturally aren't "ready" until their feeders finish. */
export function buildKnockoutQueue(matches: Match[]): Match[] {
  return [...matches].sort((a, b) => (a.round ?? 0) - (b.round ?? 0) || (a.slot ?? 0) - (b.slot ?? 0));
}

export interface AssignResult {
  /** Matches that were just newly assigned a table this pass — persist these. */
  changed: Match[];
  /** table number -> the match currently live there. */
  liveByTable: Map<number, Match>;
  /** Matches not yet on a table, in the order they'll be sent up next. */
  upNext: Match[];
}

/** Greedily fills every free table with the next queued match whose players
 * are both free, in queue-priority order. Never double-books a player across
 * two tables at once. Matches already on a table (tableNumber set) are left
 * untouched — this only fills tables that just became free. */
export function assignTables(queueOrder: Match[], allMatches: Match[], tableCount: number): AssignResult {
  const byId = new Map(allMatches.map((m) => [m.id, { ...m }]));
  const liveByTable = new Map<number, Match>();
  const busyPlayers = new Set<string>();

  for (const m of byId.values()) {
    if (m.status === "ready" && m.tableNumber) {
      liveByTable.set(m.tableNumber, m);
      if (m.playerAId) busyPlayers.add(m.playerAId);
      if (m.playerBId) busyPlayers.add(m.playerBId);
    }
  }

  const freeTables: number[] = [];
  for (let t = 1; t <= tableCount; t++) {
    if (!liveByTable.has(t)) freeTables.push(t);
  }

  const changed: Match[] = [];
  const upNext: Match[] = [];

  for (const qm of queueOrder) {
    const m = byId.get(qm.id);
    if (!m || m.status !== "ready" || m.tableNumber || !m.playerAId || !m.playerBId) continue;

    if (busyPlayers.has(m.playerAId) || busyPlayers.has(m.playerBId)) {
      upNext.push(m);
      continue;
    }
    if (freeTables.length === 0) {
      upNext.push(m);
      continue;
    }
    const t = freeTables.shift()!;
    m.tableNumber = t;
    liveByTable.set(t, m);
    busyPlayers.add(m.playerAId);
    busyPlayers.add(m.playerBId);
    changed.push(m);
  }

  return { changed, liveByTable, upNext };
}
