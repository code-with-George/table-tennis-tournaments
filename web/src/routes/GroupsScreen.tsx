import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getTournament, listPlayers, listMatches, saveMatch, saveMatches } from "../db";
import type { Match, Player, Tournament } from "../types";
import { computeMatchResult } from "../lib/matches";
import { computeGroups, resolveGroupSeeds } from "../lib/groupTransitions";
import ScoreModal from "../components/ScoreModal";

export default function GroupsScreen() {
  const { id } = useParams<{ id: string }>();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);

  useEffect(() => {
    if (!id) return;
    load();
  }, [id]);

  async function load() {
    if (!id) return;
    const [t, p, all] = await Promise.all([getTournament(id), listPlayers(id), listMatches(id)]);
    if (!t) return;
    const groupMatches = all.filter((mm) => mm.stage === "group");

    if (t.format === "groups") {
      const knockoutMatches = all.filter((mm) => mm.stage === "knockout").map((m) => ({ ...m }));
      const groupsData = computeGroups(p, groupMatches, t.matchFormat);
      const resolved = resolveGroupSeeds(knockoutMatches, groupsData, t.advancersPerGroup);
      if (resolved !== knockoutMatches) await saveMatches(resolved);
    }

    setTournament(t);
    setPlayers(p);
    setMatches(groupMatches);
  }

  const groups = useMemo(
    () => (tournament ? computeGroups(players, matches, tournament.matchFormat) : []),
    [players, matches, tournament]
  );

  function findMatch(groupMatches: Match[], aId: string, bId: string): Match | undefined {
    return groupMatches.find(
      (m) => (m.playerAId === aId && m.playerBId === bId) || (m.playerAId === bId && m.playerBId === aId)
    );
  }

  async function handleSaveScore(games: Match["games"]) {
    if (!editingMatch || !tournament) return;
    const { winsA, winsB, done } = computeMatchResult(games, tournament.matchFormat);
    const winnerId = done
      ? winsA > winsB
        ? editingMatch.playerAId
        : editingMatch.playerBId
      : undefined;
    const updated: Match = { ...editingMatch, games, winnerId, status: done ? "done" : "ready" };
    await saveMatch(updated);
    setEditingMatch(null);
    await load();
  }

  if (!tournament) return <div className="page">טוען...</div>;

  const playerName = (pid?: string) => players.find((p) => p.id === pid)?.name ?? "?";

  return (
    <div className="page">
      <p className="muted">
        <Link to="/">כל התחרויות</Link> / {tournament.name}
      </p>
      <div className="screen-header">
        <h1>שלב הבתים</h1>
        <div className="header-actions">
          <Link to={`/tournaments/${tournament.id}/schedule`}>
            <button className="secondary">לוח משחקים חי</button>
          </Link>
        </div>
      </div>
      <div>
        <Link to={`/tournaments/${tournament.id}/knockout`} className="subtle-link">
          → עץ הנוקאוט
        </Link>
      </div>
      <p className="muted">{tournament.tableCount} שולחנות זמינים באולם</p>

      <div className="groups-grid">
        {groups.map((g) => (
          <div className="card group-card" key={g.groupId}>
            <div className="card-title">{g.label}</div>

            <table className="standings-table">
              <thead>
                <tr>
                  <th></th>
                  <th>שם</th>
                  <th>נצ׳</th>
                  <th>הפ׳ סטים</th>
                </tr>
              </thead>
              <tbody>
                {g.standings.map((row, i) => (
                  <tr key={row.playerId}>
                    <td>{i + 1}</td>
                    <td>
                      <strong>{playerName(row.playerId)}</strong>
                    </td>
                    <td>
                      {row.matchWins}-{row.matchLosses}
                    </td>
                    <td>{row.gameWins - row.gameLosses}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th></th>
                    {g.players.map((p) => (
                      <th key={p.id}>{p.name.split(" ")[0]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {g.players.map((rowPlayer, ri) => (
                    <tr key={rowPlayer.id}>
                      <th>{rowPlayer.name.split(" ")[0]}</th>
                      {g.players.map((colPlayer, ci) => {
                        if (ri === ci) return <td key={colPlayer.id}>—</td>;
                        if (ri > ci) return <td key={colPlayer.id}></td>;
                        const m = findMatch(g.matches, rowPlayer.id, colPlayer.id);
                        if (!m) return <td key={colPlayer.id}></td>;
                        const { winsA, winsB } = computeMatchResult(m.games, tournament.matchFormat);
                        const rowWins = m.playerAId === rowPlayer.id ? winsA : winsB;
                        const colWins = m.playerAId === rowPlayer.id ? winsB : winsA;
                        return (
                          <td key={colPlayer.id} className="score-cell" onClick={() => setEditingMatch(m)}>
                            {m.games.length === 0 ? (
                              <span className="muted">הזנה</span>
                            ) : (
                              <span className="score">
                                {rowWins}-{colWins}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {editingMatch && (
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
