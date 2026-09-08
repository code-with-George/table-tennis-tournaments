import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { getTournament, listPlayers, saveTournament } from "../db";
import type { Tournament, TournamentFormat, MatchFormatType } from "../types";
import { stageLabel } from "../lib/nav";
import { backToDraw } from "../lib/groupTransitions";
import ConfirmDialog from "../components/ConfirmDialog";

export default function EditTournament() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [name, setName] = useState("");
  const [tableCount, setTableCount] = useState(4);
  const [format, setFormat] = useState<TournamentFormat>("groups");
  const [matchFormat, setMatchFormat] = useState<MatchFormatType>("bo5");
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    getTournament(id).then((t) => {
      if (!t) return;
      setTournament(t);
      setName(t.name);
      setTableCount(t.tableCount);
      setFormat(t.format);
      setMatchFormat(t.matchFormat);
    });
  }, [id]);

  if (!tournament) return <div className="page">טוען...</div>;

  // once the draw is confirmed, matches already exist that depend on the format
  // and match format — changing them at that point would corrupt the bracket
  const locked = !["players", "draw"].includes(tournament.stage);
  const canSubmit = name.trim().length > 0 && tableCount > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tournament || !canSubmit) return;
    await saveTournament({
      ...tournament,
      name: name.trim(),
      tableCount,
      format: locked ? tournament.format : format,
      matchFormat: locked ? tournament.matchFormat : matchFormat,
    });
    navigate("/");
  }

  function handleUpdatePlayers() {
    if (!tournament) return;
    if (tournament.stage === "players" || tournament.stage === "draw") {
      navigate(`/tournaments/${tournament.id}/players`);
      return;
    }
    setConfirmOpen(true);
  }

  async function runUpdatePlayers() {
    if (!tournament) return;
    setConfirmOpen(false);
    const players = await listPlayers(tournament.id);
    await backToDraw(tournament, players);
    await saveTournament({ ...tournament, stage: "players" });
    navigate(`/tournaments/${tournament.id}/players`);
  }

  return (
    <div className="page">
      <p className="muted">
        <Link to="/">כל התחרויות</Link> / עריכת {tournament.name}
      </p>
      <h1>עריכת תחרות</h1>
      <form onSubmit={handleSubmit}>
        <div className="card">
          <div className="field">
            <label>שם התחרות</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>

          <div className="field">
            <label>כמות שולחנות באולם</label>
            <input
              type="number"
              min={1}
              value={tableCount}
              onChange={(e) => setTableCount(Math.max(1, Number(e.target.value)))}
              style={{ maxWidth: 140 }}
            />
          </div>
        </div>

        <div className="card">
          {locked ? (
            <p className="muted">
              התחרות כבר בשלב "{stageLabel[tournament.stage]}" — שיטת התחרות ופורמט המשחק ננעלו
              כדי לא לפגוע בתוצאות שכבר הוזנו, ולא ניתנים לשינוי יותר.
            </p>
          ) : (
            <>
              <div className="field">
                <label>שיטת תחרות</label>
                <div className="choice-group">
                  <div
                    className={`choice-card ${format === "groups" ? "selected" : ""}`}
                    onClick={() => setFormat("groups")}
                  >
                    <div className="title">שלב בתים ואז נוקאוט</div>
                    <div className="desc">חלוקה לבתים לפי רמה, ולאחר מכן נוקאוט לעולים</div>
                  </div>
                  <div
                    className={`choice-card ${format === "knockout" ? "selected" : ""}`}
                    onClick={() => setFormat("knockout")}
                  >
                    <div className="title">נוקאוט ישיר</div>
                    <div className="desc">ברקט הדחה ישירה מדורג לפי דירוג</div>
                  </div>
                </div>
              </div>

              <div className="field">
                <label>פורמט משחק</label>
                <div className="choice-group">
                  {(["bo3", "bo5", "bo7"] as const).map((mf) => (
                    <div
                      key={mf}
                      className={`choice-card ${matchFormat === mf ? "selected" : ""}`}
                      onClick={() => setMatchFormat(mf)}
                    >
                      <div className="title">
                        {mf === "bo3" ? "Best of 3" : mf === "bo5" ? "Best of 5" : "Best of 7"}
                      </div>
                      <div className="desc">
                        עד {mf === "bo3" ? 2 : mf === "bo5" ? 3 : 4} ניצחונות בסטים
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="actions-row">
          <button type="submit" disabled={!canSubmit}>
            שמירת שינויים
          </button>
          <button type="button" className="secondary" onClick={handleUpdatePlayers}>
            עדכון שחקנים
          </button>
          <button type="button" className="secondary" onClick={() => navigate("/")}>
            ביטול
          </button>
        </div>
      </form>

      {confirmOpen && (
        <ConfirmDialog
          message="עדכון השחקנים ימחק את כל תוצאות הבתים והנוקאוט שכבר הוזנו, ויחזיר את התחרות לשלב הוספת השחקנים. להמשיך?"
          onConfirm={runUpdatePlayers}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}
