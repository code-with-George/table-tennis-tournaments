import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { getTournament, listPlayers, savePlayer, deletePlayer, saveTournament } from "../db";
import type { Player, Tournament } from "../types";
import { searchTttmPlayers, TttmUnavailableError, type TttmSearchResult } from "../api/players";
import { makeId } from "../lib/matches";

export default function PlayersScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TttmSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [manualOpen, setManualOpen] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualRating, setManualRating] = useState(1000);

  useEffect(() => {
    if (!id) return;
    getTournament(id).then((t) => setTournament(t ?? null));
    refreshPlayers();
  }, [id]);

  async function refreshPlayers() {
    if (!id) return;
    setPlayers(await listPlayers(id));
  }

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(null);
      setSearchError(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    const timeout = setTimeout(async () => {
      try {
        const r = await searchTttmPlayers(query.trim());
        setResults(r);
      } catch (err) {
        if (err instanceof TttmUnavailableError) {
          setSearchError("לא הצלחנו להתחבר לאתר הדירוגים (tttm.co.il). ניתן להוסיף את השחקן ידנית.");
        } else {
          setSearchError("שגיאה בחיפוש. נסו שוב או הוסיפו ידנית.");
        }
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [query]);

  const alreadyAddedTttmIds = new Set(players.filter((p) => p.tttmId).map((p) => p.tttmId));

  async function addFromSearch(r: TttmSearchResult) {
    if (!id) return;
    const player: Player = {
      tournamentId: id,
      id: makeId(),
      name: r.name,
      club: r.club,
      rating: r.rating,
      source: "tttm",
      tttmId: r.id,
    };
    await savePlayer(player);
    setQuery("");
    setResults(null);
    await refreshPlayers();
  }

  function openManual(prefillName: string) {
    setManualName(prefillName);
    setManualRating(1000);
    setManualOpen(true);
  }

  async function submitManual(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !manualName.trim()) return;
    const player: Player = {
      tournamentId: id,
      id: makeId(),
      name: manualName.trim(),
      rating: manualRating,
      source: "manual",
    };
    await savePlayer(player);
    setManualOpen(false);
    setQuery("");
    setResults(null);
    await refreshPlayers();
  }

  async function removeOne(p: Player) {
    await deletePlayer(p);
    await refreshPlayers();
  }

  async function goToDraw() {
    if (!tournament) return;
    await saveTournament({ ...tournament, stage: "draw" });
    navigate(`/tournaments/${tournament.id}/draw`);
  }

  if (!tournament) return <div className="page">טוען...</div>;

  return (
    <div className="page">
      <p className="muted">
        <Link to="/">כל התחרויות</Link> / {tournament.name}
      </p>
      <h1>הוספת שחקנים</h1>

      <div className="card">
        <div className="field">
          <label>חיפוש שחקן (שם או שם משפחה)</label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="הקלידו שם לחיפוש בדירוג tttm.co.il..."
          />
        </div>

        {searching && <p className="muted">מחפש...</p>}

        {searchError && (
          <div className="card" style={{ background: "var(--surface-alt)" }}>
            <p style={{ margin: 0 }}>{searchError}</p>
            <button className="secondary small" style={{ marginTop: 10 }} onClick={() => openManual(query)}>
              הוספה ידנית של "{query}"
            </button>
          </div>
        )}

        {results && !searchError && (
          <div className="search-results">
            {results.length === 0 && (
              <div className="search-result-row">
                <span className="muted">לא נמצאו שחקנים בשם "{query}"</span>
                <button className="secondary small" onClick={() => openManual(query)}>
                  הוספה ידנית
                </button>
              </div>
            )}
            {results.map((r) => {
              const added = alreadyAddedTttmIds.has(r.id);
              return (
                <div className="search-result-row" key={r.id}>
                  <div className="info">
                    <strong>{r.name}</strong>
                    <span className="muted">{r.club || "ללא מועדון"}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span className="rating">{r.rating}</span>
                    <button className="small" disabled={added} onClick={() => addFromSearch(r)}>
                      {added ? "נוסף" : "הוספה"}
                    </button>
                  </div>
                </div>
              );
            })}
            {results.length > 0 && (
              <div className="search-result-row">
                <span className="muted">השחקן לא ברשימה?</span>
                <button className="secondary small" onClick={() => openManual(query)}>
                  הוספה ידנית
                </button>
              </div>
            )}
          </div>
        )}

        {!results && !searchError && (
          <button className="secondary small" onClick={() => openManual(query)}>
            הוספה ידנית ללא חיפוש
          </button>
        )}
      </div>

      <div className="card">
        <div className="card-title">שחקנים בתחרות ({players.length})</div>
        {players.length === 0 && <p className="muted">עדיין לא נוספו שחקנים.</p>}
        {players
          .slice()
          .sort((a, b) => b.rating - a.rating)
          .map((p) => (
            <div className="player-list-row" key={p.id}>
              <div>
                <strong>{p.name}</strong>
                {p.club && <span className="muted"> · {p.club}</span>}
                {p.source === "manual" && <span className="tag manual">דירוג ידני</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span className="rating">{p.rating}</span>
                <button className="secondary small" onClick={() => removeOne(p)}>
                  הסרה
                </button>
              </div>
            </div>
          ))}
      </div>

      <div className="actions-row">
        <button disabled={players.length < 2} onClick={goToDraw}>
          המשך לחלוקה ({players.length} שחקנים)
        </button>
      </div>

      {manualOpen && (
        <div className="modal-backdrop" onClick={() => setManualOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>הוספת שחקן ידנית</h3>
            <form onSubmit={submitManual}>
              <div className="field">
                <label>שם השחקן</label>
                <input type="text" value={manualName} onChange={(e) => setManualName(e.target.value)} autoFocus />
              </div>
              <div className="field">
                <label>דירוג (נקודות) לבחירתכם</label>
                <input
                  type="number"
                  value={manualRating}
                  onChange={(e) => setManualRating(Number(e.target.value))}
                />
              </div>
              <div className="actions-row">
                <button type="submit" disabled={!manualName.trim()}>
                  הוספה
                </button>
                <button type="button" className="secondary" onClick={() => setManualOpen(false)}>
                  ביטול
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
