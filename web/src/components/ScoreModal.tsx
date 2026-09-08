import { useState } from "react";
import type { GameScore, MatchFormatType } from "../types";
import { gamesToWin, isValidGameScore, computeMatchResult } from "../lib/matches";

interface Props {
  playerAName: string;
  playerBName: string;
  initialGames: GameScore[];
  matchFormat: MatchFormatType;
  onCancel: () => void;
  onSave: (games: GameScore[]) => void;
}

interface RowState {
  a: string;
  b: string;
  autoA: boolean;
  autoB: boolean;
}

function emptyRow(): RowState {
  return { a: "", b: "", autoA: false, autoB: false };
}

const NAV_KEYS = ["Backspace", "Delete", "Tab", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];

function blockNonDigitKeys(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.ctrlKey || e.metaKey || e.altKey || NAV_KEYS.includes(e.key)) return;
  if (!/^[0-9]$/.test(e.key)) e.preventDefault();
}

function sanitizePastedDigits(e: React.ClipboardEvent<HTMLInputElement>): string {
  return e.clipboardData.getData("text").replace(/[^0-9]/g, "");
}

/** A set that ends without going past 11 always ends at exactly 11 for the winner —
 * so once one side's score is filled in at 9 or below, the other side is fully
 * determined and doesn't need to be typed. Only ambiguous once someone reaches 10+. */
function isDeterminedLoserScore(value: string): boolean {
  if (value === "") return false;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 9;
}

export default function ScoreModal({
  playerAName,
  playerBName,
  initialGames,
  matchFormat,
  onCancel,
  onSave,
}: Props) {
  const need = gamesToWin(matchFormat);
  const maxGames = need * 2 - 1;

  // always show every set slot for the tournament's match format (Bo3/Bo5/Bo7),
  // whether creating a fresh match or reopening one that's already partly or
  // fully played — existing results just fill in their slot, the rest stay empty
  const [rows, setRows] = useState<RowState[]>(() =>
    Array.from({ length: maxGames }, (_, i) => {
      const g = initialGames[i];
      return g ? { a: String(g.a), b: String(g.b), autoA: false, autoB: false } : emptyRow();
    })
  );
  const [error, setError] = useState<string | null>(null);

  function updateRow(i: number, key: "a" | "b", value: string) {
    setRows((prev) =>
      prev.map((r, idx) => {
        if (idx !== i) return r;
        const otherKey = key === "a" ? "b" : "a";
        const autoKey = key === "a" ? "autoA" : "autoB";
        const otherAutoKey = key === "a" ? "autoB" : "autoA";
        const next: RowState = { ...r, [key]: value, [autoKey]: false };

        if (isDeterminedLoserScore(value) && (next[otherKey] === "" || next[otherAutoKey])) {
          next[otherKey] = "11";
          next[otherAutoKey] = true;
        } else if (!isDeterminedLoserScore(value) && next[otherAutoKey]) {
          next[otherKey] = "";
          next[otherAutoKey] = false;
        }
        return next;
      })
    );
  }

  function parsedGames(): GameScore[] | null {
    const games: GameScore[] = [];
    for (const r of rows) {
      if (r.a === "" && r.b === "") continue;
      const a = Number(r.a);
      const b = Number(r.b);
      if (!isValidGameScore(a, b)) return null;
      games.push({ a, b });
    }
    return games;
  }

  function handleSave() {
    const games = parsedGames();
    if (games === null) {
      setError("תוצאת סט לא חוקית — חייב להגיע ל-11 לפחות ובהפרש של 2 נקודות");
      return;
    }
    setError(null);
    onSave(games);
  }

  // whether the match was already decided using only the rows before index i —
  // used to visually de-emphasize sets that don't need to be filled in
  const decidedBefore: boolean[] = [];
  {
    const running: GameScore[] = [];
    for (const r of rows) {
      decidedBefore.push(computeMatchResult(running, matchFormat).done);
      if (r.a !== "" && r.b !== "" && isValidGameScore(Number(r.a), Number(r.b))) {
        running.push({ a: Number(r.a), b: Number(r.b) });
      }
    }
  }

  // rows where both scores were entered but don't form a legal set result —
  // highlighted directly on the boxes so the mistake is obvious at a glance
  const rowInvalid = rows.map(
    (r) => r.a !== "" && r.b !== "" && !isValidGameScore(Number(r.a), Number(r.b))
  );

  const validGamesForPreview = rows
    .filter((r) => r.a !== "" && r.b !== "" && isValidGameScore(Number(r.a), Number(r.b)))
    .map((r) => ({ a: Number(r.a), b: Number(r.b) }));
  const preview = computeMatchResult(validGamesForPreview, matchFormat);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>
          {playerAName} נגד {playerBName}
        </h3>
        <p className="muted">
          פורמט: עד {need} ניצחונות בסטים · כל סט עד 11, יתרון 2 · מלאו ניקוד של שחקן אחד בלבד
          וההשלמה תתמלא לבד (אלא אם יש הארכה)
        </p>

        <div style={{ overflowX: "auto" }}>
        <table className="score-grid">
          <thead>
            <tr>
              <th></th>
              {rows.map((_, i) => (
                <th
                  key={i}
                  style={{
                    opacity: rowInvalid[i] ? 1 : decidedBefore[i] ? 0.45 : 1,
                    color: rowInvalid[i] ? "var(--danger)" : undefined,
                  }}
                >
                  {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>{playerAName}</th>
              {rows.map((r, i) => (
                <td key={i} style={{ opacity: rowInvalid[i] ? 1 : decidedBefore[i] ? 0.45 : 1 }}>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    className={rowInvalid[i] ? "invalid" : undefined}
                    value={r.a}
                    onChange={(e) => updateRow(i, "a", e.target.value)}
                    onKeyDown={blockNonDigitKeys}
                    onPaste={(e) => {
                      e.preventDefault();
                      updateRow(i, "a", sanitizePastedDigits(e));
                    }}
                  />
                </td>
              ))}
            </tr>
            <tr>
              <th>{playerBName}</th>
              {rows.map((r, i) => (
                <td key={i} style={{ opacity: rowInvalid[i] ? 1 : decidedBefore[i] ? 0.45 : 1 }}>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    className={rowInvalid[i] ? "invalid" : undefined}
                    value={r.b}
                    onChange={(e) => updateRow(i, "b", e.target.value)}
                    onKeyDown={blockNonDigitKeys}
                    onPaste={(e) => {
                      e.preventDefault();
                      updateRow(i, "b", sanitizePastedDigits(e));
                    }}
                  />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
        </div>

        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

        <p className="muted" style={{ marginTop: 12 }}>
          תוצאת סטים נוכחית: {preview.winsA}-{preview.winsB}
          {preview.done ? " (המשחק הסתיים)" : ""}
        </p>

        <div className="actions-row">
          <button onClick={handleSave}>שמירה</button>
          <button type="button" className="secondary" onClick={onCancel}>
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
