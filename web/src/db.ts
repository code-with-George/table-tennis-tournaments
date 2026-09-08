import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Tournament, Player, Match } from "./types";

interface TTTDB extends DBSchema {
  tournaments: {
    key: string;
    value: Tournament;
  };
  players: {
    key: string;
    value: Player;
    indexes: { tournamentId: string };
  };
  matches: {
    key: string;
    value: Match;
    indexes: { tournamentId: string };
  };
}

let dbPromise: Promise<IDBPDatabase<TTTDB>> | null = null;

function getDb(): Promise<IDBPDatabase<TTTDB>> {
  if (!dbPromise) {
    dbPromise = openDB<TTTDB>("ttt-tournaments", 1, {
      upgrade(db) {
        db.createObjectStore("tournaments", { keyPath: "id" });

        const players = db.createObjectStore("players", { keyPath: "key" as never });
        players.createIndex("tournamentId", "tournamentId");

        const matches = db.createObjectStore("matches", { keyPath: "key" as never });
        matches.createIndex("tournamentId", "tournamentId");
      },
    });
  }
  return dbPromise;
}

function playerKey(p: Pick<Player, "tournamentId" | "id">): string {
  return `${p.tournamentId}:${p.id}`;
}
function matchKey(m: Pick<Match, "tournamentId" | "id">): string {
  return `${m.tournamentId}:${m.id}`;
}

export async function listTournaments(): Promise<Tournament[]> {
  const db = await getDb();
  const all = await db.getAll("tournaments");
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getTournament(id: string): Promise<Tournament | undefined> {
  const db = await getDb();
  return db.get("tournaments", id);
}

export async function saveTournament(t: Tournament): Promise<void> {
  const db = await getDb();
  await db.put("tournaments", t);
}

export async function deleteTournament(tournamentId: string): Promise<void> {
  const db = await getDb();
  const [players, matches] = await Promise.all([
    db.getAllFromIndex("players", "tournamentId", tournamentId),
    db.getAllFromIndex("matches", "tournamentId", tournamentId),
  ]);
  const tx = db.transaction(["tournaments", "players", "matches"], "readwrite");
  await Promise.all([
    tx.objectStore("tournaments").delete(tournamentId),
    ...players.map((p) => tx.objectStore("players").delete(playerKey(p))),
    ...matches.map((m) => tx.objectStore("matches").delete(matchKey(m))),
    tx.done,
  ]);
}

export async function listPlayers(tournamentId: string): Promise<Player[]> {
  const db = await getDb();
  return db.getAllFromIndex("players", "tournamentId", tournamentId);
}

export async function savePlayer(p: Player): Promise<void> {
  const db = await getDb();
  await db.put("players", { ...p, key: playerKey(p) } as unknown as Player);
}

export async function deletePlayer(p: Pick<Player, "tournamentId" | "id">): Promise<void> {
  const db = await getDb();
  await db.delete("players", playerKey(p));
}

export async function listMatches(tournamentId: string): Promise<Match[]> {
  const db = await getDb();
  return db.getAllFromIndex("matches", "tournamentId", tournamentId);
}

export async function saveMatch(m: Match): Promise<void> {
  const db = await getDb();
  await db.put("matches", { ...m, key: matchKey(m) } as unknown as Match);
}

export async function saveMatches(list: Match[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("matches", "readwrite");
  await Promise.all([
    ...list.map((m) => tx.store.put({ ...m, key: matchKey(m) } as unknown as Match)),
    tx.done,
  ]);
}

export async function deleteMatchesByStage(
  tournamentId: string,
  stage: Match["stage"]
): Promise<void> {
  const db = await getDb();
  const all = await db.getAllFromIndex("matches", "tournamentId", tournamentId);
  const toDelete = all.filter((m) => m.stage === stage);
  if (toDelete.length === 0) return;
  const tx = db.transaction("matches", "readwrite");
  await Promise.all([...toDelete.map((m) => tx.store.delete(matchKey(m))), tx.done]);
}
