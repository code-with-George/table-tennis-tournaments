import type { Match, Player, Tournament } from "../types";
import { computeGroupStandings, type StandingRow } from "./standings";
import { seedOrder, nextPowerOf2, propagateBracket } from "./bracket";
import { deleteMatchesByStage, savePlayer, saveTournament } from "../db";

export interface GroupData {
  groupId: string;
  label: string;
  players: Player[];
  matches: Match[];
  standings: StandingRow[];
}

/** Groups players + their group-stage matches by groupId and computes each
 * group's standings. Shared by every screen that needs a per-group view. */
export function computeGroups(
  players: Player[],
  groupMatches: Match[],
  matchFormat: Tournament["matchFormat"]
): GroupData[] {
  const byGroup = new Map<string, GroupData>();
  for (const p of players) {
    if (!p.groupId) continue;
    if (!byGroup.has(p.groupId)) {
      byGroup.set(p.groupId, { groupId: p.groupId, label: p.groupLabel ?? p.groupId, players: [], matches: [], standings: [] });
    }
    byGroup.get(p.groupId)!.players.push(p);
  }
  for (const m of groupMatches) {
    if (m.groupId && byGroup.has(m.groupId)) byGroup.get(m.groupId)!.matches.push(m);
  }
  for (const g of byGroup.values()) {
    g.standings = computeGroupStandings(g.players.map((p) => p.id), g.matches, matchFormat);
  }
  return Array.from(byGroup.values()).sort((a, b) => a.label.localeCompare(b.label, "he"));
}

/** Deletes the group draw and any knockout bracket built from it, ungroups
 * every player, and sends the tournament back to the draw stage. */
export async function backToDraw(tournament: Tournament, players: Player[]): Promise<void> {
  await Promise.all([
    deleteMatchesByStage(tournament.id, "group"),
    deleteMatchesByStage(tournament.id, "knockout"),
    ...players.map((p) => savePlayer({ ...p, groupId: undefined, groupLabel: undefined })),
  ]);
  await saveTournament({ ...tournament, stage: "draw" });
}

export interface GroupSizeInfo {
  groupId: string;
  playerCount: number;
}

/** Maps each knockout seed number to the (group, in-group rank) that owns it.
 * Mirrors the fixed group-order/rank iteration that determines seeding —
 * independent of any match result — so it can run before any group has
 * played a single match (using just player counts) or after (using
 * GroupData). A group with fewer players than `advancersPerGroup` simply
 * doesn't produce a seed for the ranks it lacks, so the resulting map size
 * is the true qualifier count, not `groups.length * advancersPerGroup`. */
export function computeSeedOwners(
  groups: GroupSizeInfo[],
  advancersPerGroup: number
): Map<number, { groupId: string; rank: number }> {
  const owners = new Map<number, { groupId: string; rank: number }>();
  let seed = 1;
  for (let rank = 0; rank < advancersPerGroup; rank++) {
    for (const g of groups) {
      if (g.playerCount > rank) owners.set(seed++, { groupId: g.groupId, rank });
    }
  }
  return owners;
}

function isGroupComplete(g: GroupData): boolean {
  return g.matches.every((m) => m.status === "done");
}

/** Fills in (and self-corrects) round-1 knockout slots as their feeder groups
 * finish, resolving structural byes along the way, then cascades any change
 * forward via propagateBracket. Expects fresh copies of every knockout match
 * for the tournament (it mutates them in place) and returns the full list —
 * unchanged if nothing needed updating. */
export function resolveGroupSeeds(
  knockoutMatches: Match[],
  groups: GroupData[],
  advancersPerGroup: number
): Match[] {
  const owners = computeSeedOwners(
    groups.map((g) => ({ groupId: g.groupId, playerCount: g.players.length })),
    advancersPerGroup
  );
  const qualifierCount = owners.size;
  const bracketSize = nextPowerOf2(Math.max(2, qualifierCount));
  const order = seedOrder(bracketSize);
  const groupById = new Map(groups.map((g) => [g.groupId, g]));

  function resolvePlayerForSeed(seed: number): string | undefined {
    const owner = owners.get(seed);
    if (!owner) return undefined;
    const g = groupById.get(owner.groupId);
    if (!g || !isGroupComplete(g)) return undefined;
    return g.standings[owner.rank]?.playerId;
  }

  let changed = false;
  for (const m of knockoutMatches) {
    if (m.round !== 1) continue;
    const slot = m.slot ?? 0;
    const seedA = order[slot * 2];
    const seedB = order[slot * 2 + 1];
    const resolvedA = resolvePlayerForSeed(seedA);
    const resolvedB = resolvePlayerForSeed(seedB);

    let sideChanged = false;
    if (resolvedA !== undefined && m.playerAId !== resolvedA) {
      m.playerAId = resolvedA;
      sideChanged = true;
    }
    if (resolvedB !== undefined && m.playerBId !== resolvedB) {
      m.playerBId = resolvedB;
      sideChanged = true;
    }
    if (sideChanged) {
      m.games = [];
      m.winnerId = undefined;
      changed = true;
    }

    const aIsBye = !owners.has(seedA);
    const bIsBye = !owners.has(seedB);
    if (m.playerAId && bIsBye) {
      if (m.status !== "done" || m.winnerId !== m.playerAId) {
        m.status = "done";
        m.winnerId = m.playerAId;
        changed = true;
      }
    } else if (m.playerBId && aIsBye) {
      if (m.status !== "done" || m.winnerId !== m.playerBId) {
        m.status = "done";
        m.winnerId = m.playerBId;
        changed = true;
      }
    } else if (m.playerAId && m.playerBId && m.status === "pending") {
      m.status = "ready";
      changed = true;
    }
  }

  return changed ? propagateBracket(knockoutMatches) : knockoutMatches;
}
