import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { saveTournament } from "../db";
import type { Tournament, TournamentFormat, MatchFormatType } from "../types";
import { makeId } from "../lib/matches";

export default function NewTournament() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [tableCount, setTableCount] = useState(4);
  const [format, setFormat] = useState<TournamentFormat>("groups");
  const [matchFormat, setMatchFormat] = useState<MatchFormatType>("bo5");

  const canSubmit = name.trim().length > 0 && tableCount > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    const tournament: Tournament = {
      id: makeId(),
      name: name.trim(),
      createdAt: Date.now(),
      tableCount,
      format,
      matchFormat,
      // group size & advancers are chosen on the draw screen, once the actual
      // player count is known — defaults here are just placeholders
      groupSize: 4,
      advancersPerGroup: 2,
      stage: "players",
    };
    await saveTournament(tournament);
    navigate(`/tournaments/${tournament.id}/players`);
  }

  return (
    <div className="page">
      <h1>תחרות חדשה</h1>
      <form onSubmit={handleSubmit}>
        <div className="card">
          <div className="field">
            <label>שם התחרות</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="לדוגמה: אליפות מועדון קיץ 2026"
              autoFocus
            />
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

          {format === "groups" && (
            <p className="muted">
              גודל הבתים ומספר העולים לנוקאוט ייבחרו בהמשך, אחרי שתוסיפו את השחקנים — כך תוכלו
              להתאים אותם למספר המשתתפים בפועל.
            </p>
          )}
        </div>

        <div className="actions-row">
          <button type="submit" disabled={!canSubmit}>
            המשך להוספת שחקנים
          </button>
        </div>
      </form>
    </div>
  );
}
