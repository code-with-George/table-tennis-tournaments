import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getTournament, listPlayers, listMatches, saveMatch, saveMatches, saveTournament } from "../db";
import type { Match, Player, Tournament } from "../types";
import { computeMatchResult } from "../lib/matches";
import { resolveKnockoutMatch, roundLabel } from "../lib/bracket";
import { buildGroupQueue, buildKnockoutQueue, assignTables } from "../lib/schedule";
import { computeGroups, resolveGroupSeeds } from "../lib/groupTransitions";
import ScoreModal from "../components/ScoreModal";

export default function ScheduleScreen() {
  const { id } = useParams<{ id: string }>();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [groupMatches, setGroupMatches] = useState<Match[]>([]);
  const [knockoutMatches, setKnockoutMatches] = useState<Match[]>([]);
  const [upNext, setUpNext] = useState<Match[]>([]);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);

  // pause the background refresh while a modal is open so it never yanks the
  // score-entry form out from under the user mid-input
  const modalOpenRef = useRef(false);
  useEffect(() => {
    modalOpenRef.current = !!editingMatch;
  }, [editingMatch]);

  useEffect(() => {
    if (!id) return;
    load();
    const interval = setInterval(() => {
      if (!modalOpenRef.current) load();
    }, 4000);
    return () => clearInterval(interval);
  }, [id]);

  async function load() {
    if (!id) return;
    const t = await getTournament(id);
    if (!t) return;
    const p = await listPlayers(id);
    const all = await listMatches(id);
    let gMatches = all.filter((m) => m.stage === "group");
    let kMatches = all.filter((m) => m.stage === "knockout");

    if (t.format === "groups") {
      const freshKnockout = kMatches.map((m) => ({ ...m }));
      const groupsData = computeGroups(p, gMatches, t.matchFormat);
      const resolved = resolveGroupSeeds(freshKnockout, groupsData, t.advancersPerGroup);
      if (resolved !== freshKnockout) {
        await saveMatches(resolved);
        kMatches = resolved;
      }

      const allGroupsDone = gMatches.length > 0 && gMatches.every((m) => m.status === "done");
      if (allGroupsDone && t.stage === "groups") {
        await saveTournament({ ...t, stage: "knockout" });
        t.stage = "knockout";
      }
    }

    const byGroup = new Map<string, { players: Player[]; matches: Match[] }>();
    for (const pl of p) {
      if (!pl.groupId) continue;
      if (!byGroup.has(pl.groupId)) byGroup.set(pl.groupId, { players: [], matches: [] });
      byGroup.get(pl.groupId)!.players.push(pl);
    }
    for (const m of gMatches) {
      if (m.groupId && byGroup.has(m.groupId)) byGroup.get(m.groupId)!.matches.push(m);
    }
    const groupQueue = t.format === "groups" ? buildGroupQueue(Array.from(byGroup.values())) : [];
    const knockoutQueue = buildKnockoutQueue(kMatches);
    const queue = [...groupQueue, ...knockoutQueue];
    const combinedAll = [...gMatches, ...kMatches];

    const result = assignTables(queue, combinedAll, t.tableCount);
    let finalGroup = gMatches;
    let finalKnockout = kMatches;
    if (result.changed.length > 0) {
      await saveMatches(result.changed);
      const changedById = new Map(result.changed.map((m) => [m.id, m]));
      finalGroup = gMatches.map((m) => changedById.get(m.id) ?? m);
      finalKnockout = kMatches.map((m) => changedById.get(m.id) ?? m);
    }

    setTournament(t);
    setPlayers(p);
    setGroupMatches(finalGroup);
    setKnockoutMatches(finalKnockout);
    setUpNext(result.upNext);
    setLoading(false);
  }

  const playerName = (pid?: string) => players.find((p) => p.id === pid)?.name ?? "?";

  const totalRounds = useMemo(
    () => knockoutMatches.reduce((max, m) => Math.max(max, m.round ?? 0), 0),
    [knockoutMatches]
  );

  async function handleSaveScore(games: Match["games"]) {
    if (!editingMatch || !tournament) return;

    if (editingMatch.stage === "knockout") {
      const fresh = knockoutMatches.map((m) => ({ ...m }));
      const { matches: resolved, finalDecided } = resolveKnockoutMatch(
        fresh,
        editingMatch.id,
        games,
        tournament.matchFormat
      );
      await saveMatches(resolved);
      if (finalDecided && tournament.stage !== "done") {
        await saveTournament({ ...tournament, stage: "done" });
      } else if (!finalDecided && tournament.stage === "done") {
        await saveTournament({ ...tournament, stage: "knockout" });
      }
    } else {
      const { winsA, winsB, done } = computeMatchResult(games, tournament.matchFormat);
      const winnerId = done ? (winsA > winsB ? editingMatch.playerAId : editingMatch.playerBId) : undefined;
      const updated: Match = { ...editingMatch, games, winnerId, status: done ? "done" : "ready" };
      await saveMatch(updated);
    }

    setEditingMatch(null);
    await load();
  }

  if (loading || !tournament) return <div className="page">טוען...</div>;

  if (tournament.stage === "players" || tournament.stage === "draw") {
    return (
      <div className="page">
        <p className="muted">
          <Link to="/">כל התחרויות</Link> / {tournament.name}
        </p>
        <h1>לוח משחקים חי</h1>
        <div className="empty-state card">
          <p>עדיין אין משחקים לתזמן — קודם צריך לסיים את הוספת השחקנים והחלוקה.</p>
        </div>
      </div>
    );
  }

  const allMatches = [...groupMatches, ...knockoutMatches];
  const tables = Array.from({ length: tournament.tableCount }, (_, i) => i + 1);
  const liveByTable = new Map<number, Match>();
  for (const m of allMatches) {
    if (m.status === "ready" && m.tableNumber) liveByTable.set(m.tableNumber, m);
  }

  function matchTag(m: Match): string | null {
    if (m.stage === "group") return m.groupLabel ?? null;
    if (m.round) return roundLabel(m.round, totalRounds);
    return null;
  }

  return (
    <div className="page">
      <p className="muted">
        <Link to="/">כל התחרויות</Link> / {tournament.name}
      </p>
      <div className="screen-header">
        <h1>לוח משחקים חי</h1>
        <div className="header-actions">
          {tournament.format !== "groups" && (
            <Link to={`/tournaments/${tournament.id}/knockout`}>
              <button className="secondary">צפייה בברקט המלא</button>
            </Link>
          )}
        </div>
      </div>
      {tournament.format === "groups" && (
        <div>
          <Link to={`/tournaments/${tournament.id}/groups`} className="subtle-link">
            → תוצאות הבתים
          </Link>
          {" · "}
          <Link to={`/tournaments/${tournament.id}/knockout`} className="subtle-link">
            → עץ הנוקאוט
          </Link>
        </div>
      )}
      <p className="muted">{tournament.tableCount} שולחנות באולם — המשחקים מסודרים כדי לנצל את כולם במקביל</p>

      <div className="tables-grid">
        {tables.map((t) => {
          const m = liveByTable.get(t);
          return (
            <div className="card table-card" key={t}>
              <div className="table-number">שולחן {t}</div>
              {m ? (
                <>
                  {matchTag(m) && <span className="pill">{matchTag(m)}</span>}
                  <div className="table-players">
                    <strong>{playerName(m.playerAId)}</strong>
                    <span className="muted"> נגד </span>
                    <strong>{playerName(m.playerBId)}</strong>
                  </div>
                  <button onClick={() => setEditingMatch(m)}>הזנת תוצאה</button>
                </>
              ) : (
                <p className="muted">שולחן פנוי</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="card">
        <div className="card-title">הבאים בתור</div>
        {upNext.length === 0 ? (
          <p className="muted">אין משחקים נוספים שממתינים כרגע.</p>
        ) : (
          upNext.map((m, i) => (
            <div className="player-list-row" key={m.id}>
              <div>
                <span className="tag" style={{ marginInlineEnd: 8 }}>
                  {i + 1}
                </span>
                <strong>{playerName(m.playerAId)}</strong>
                <span className="muted"> נגד </span>
                <strong>{playerName(m.playerBId)}</strong>
              </div>
              {matchTag(m) && <span className="muted">{matchTag(m)}</span>}
            </div>
          ))
        )}
      </div>

      {editingMatch && editingMatch.playerAId && editingMatch.playerBId && (
        <ScoreModal
          playerAName={playerName(editingMatch.playerAId)}
          playerBName={playerName(editingMatch.playerBId)}
          initialGames={editingMatch.games}
          matchFormat={tournament.matchFormat}
          onCancel={() => setEditingMatch(null)}
          onSave={handleSaveScore}
        />
      )}
    </div>
  );
}
