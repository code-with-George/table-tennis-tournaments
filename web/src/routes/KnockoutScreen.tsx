import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getTournament, listPlayers, listMatches, saveMatches, saveTournament } from "../db";
import type { Match, Player, Tournament } from "../types";
import { computeMatchResult } from "../lib/matches";
import { resolveKnockoutMatch, roundLabel } from "../lib/bracket";
import ScoreModal from "../components/ScoreModal";

export default function KnockoutScreen() {
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
    const [t, p, m] = await Promise.all([getTournament(id), listPlayers(id), listMatches(id)]);
    setTournament(t ?? null);
    setPlayers(p);
    setMatches(m.filter((mm) => mm.stage === "knockout"));
  }

  const playerName = (pid?: string) => (pid ? players.find((p) => p.id === pid)?.name ?? "?" : undefined);

  const totalRounds = useMemo(
    () => matches.reduce((max, m) => Math.max(max, m.round ?? 0), 0),
    [matches]
  );

  const roundsData = useMemo(() => {
    const map = new Map<number, Match[]>();
    for (const m of matches) {
      const r = m.round ?? 0;
      if (!map.has(r)) map.set(r, []);
      map.get(r)!.push(m);
    }
    for (const list of map.values()) list.sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [matches]);

  const lastRoundRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // the bracket scrolls horizontally on narrow screens — default to showing
    // the most advanced round (the final) instead of leaving it hidden off-screen
    lastRoundRef.current?.scrollIntoView({ inline: "end", block: "nearest" });
  }, [totalRounds]);

  const champion = useMemo(() => {
    if (!tournament || tournament.stage !== "done") return null;
    const final = matches.find((m) => m.round === totalRounds);
    return final?.winnerId ? playerName(final.winnerId) : null;
  }, [tournament, matches, totalRounds]);

  async function handleSaveScore(games: Match["games"]) {
    if (!editingMatch || !tournament) return;
    const fresh = matches.map((m) => ({ ...m }));
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

    setEditingMatch(null);
    await load();
  }

  if (!tournament) return <div className="page">טוען...</div>;

  return (
    <div className="page">
      <p className="muted">
        <Link to="/">כל התחרויות</Link> / {tournament.name}
      </p>
      <div className="screen-header">
        <h1>שלב הנוקאוט</h1>
        <div className="header-actions">
          {tournament.stage !== "done" && (
            <Link to={`/tournaments/${tournament.id}/schedule`}>
              <button className="secondary">לוח משחקים חי</button>
            </Link>
          )}
          {tournament.format !== "groups" && (
            <Link to={`/tournaments/${tournament.id}/draw`}>
              <button className="secondary">→ חזרה לסיד ולשחקנים</button>
            </Link>
          )}
        </div>
      </div>
      {tournament.format === "groups" && (
        <Link to={`/tournaments/${tournament.id}/groups`} className="subtle-link">
          → חזרה לתוצאות הבתים
        </Link>
      )}

      {champion && (
        <div className="champion-banner">
          <div className="trophy">🏆</div>
          <h2>{champion} — אלוף התחרות!</h2>
        </div>
      )}

      <div className="bracket">
        {roundsData.map(([round, roundMatches], i) => (
          <div
            className="bracket-round"
            key={round}
            ref={i === roundsData.length - 1 ? lastRoundRef : undefined}
          >
            <h3>{roundLabel(round, totalRounds)}</h3>
            {roundMatches.map((m) => {
              const aName = playerName(m.playerAId) ?? (m.playerAId ? "?" : "טרם נקבע");
              const bName = playerName(m.playerBId) ?? (m.playerBId ? "?" : "טרם נקבע");
              const { winsA, winsB } = computeMatchResult(m.games, tournament.matchFormat);
              const clickable = m.status === "ready" || (m.status === "done" && m.games.length > 0);
              return (
                <div
                  className="bracket-match"
                  key={m.id}
                  onClick={() => clickable && setEditingMatch(m)}
                  style={{ cursor: clickable ? "pointer" : "default", opacity: m.playerAId || m.playerBId ? 1 : 0.5 }}
                >
                  <div className={`bracket-slot ${m.winnerId && m.winnerId === m.playerAId ? "winner" : ""}`}>
                    <span>{aName}</span>
                    <span>{m.games.length > 0 ? winsA : ""}</span>
                  </div>
                  <div className={`bracket-slot ${m.winnerId && m.winnerId === m.playerBId ? "winner" : ""}`}>
                    <span>{bName}</span>
                    <span>{m.games.length > 0 ? winsB : ""}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {editingMatch && editingMatch.playerAId && editingMatch.playerBId && (
        <ScoreModal
          playerAName={playerName(editingMatch.playerAId) ?? "?"}
          playerBName={playerName(editingMatch.playerBId) ?? "?"}
          initialGames={editingMatch.games}
          matchFormat={tournament.matchFormat}
          onCancel={() => setEditingMatch(null)}
          onSave={handleSaveScore}
        />
      )}
    </div>
  );
}
