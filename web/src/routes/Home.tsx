import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listTournaments, deleteTournament } from "../db";
import type { Tournament } from "../types";
import { stagePath, formatLabel, stageLabel } from "../lib/nav";
import ConfirmDialog from "../components/ConfirmDialog";

export default function Home() {
  const [tournaments, setTournaments] = useState<Tournament[] | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Tournament | null>(null);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setTournaments(await listTournaments());
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    await deleteTournament(pendingDelete.id);
    setPendingDelete(null);
    await refresh();
  }

  return (
    <div className="page">
      <div className="hero">
        <span className="hero-badge">🏓 ברוכים הבאים</span>
        <h1 className="hero-title">ניהול תחרויות טניס שולחן, מההגרלה ועד האליפות</h1>
        <p className="hero-subtitle">
          כל מה שצריך כדי להריץ תחרות באולם: בחרו מספר שולחנות ושחקנים, חפשו דירוגים אמיתיים
          מ־tttm.co.il או הזינו ידנית, קבלו חלוקה אוטומטית ומאוזנת לבתים או ברקט נוקאוט מסודר,
          ועקבו אחרי כל משחק בלוח משחקים חי שמנצל את כל השולחנות במקביל. הכול נשמר בדפדפן שלכם —
          גם אם האינטרנט נופל באמצע, התחרות לא נעלמת.
        </p>
        <div className="hero-features">
          <span className="hero-feature">⚡ הגרלה מאוזנת לפי דירוג</span>
          <span className="hero-feature">📋 לוח משחקים חי לפי שולחנות</span>
          <span className="hero-feature">💾 עובד גם בלי אינטרנט</span>
        </div>
      </div>

      <div className="tournament-list-title">
        <h1 style={{ fontSize: "1.2rem", margin: 0 }}>התחרויות שלי</h1>
        <Link to="/tournaments/new">
          <button>+ התחלת תחרות חדשה</button>
        </Link>
      </div>

      {tournaments === null && <p className="muted">טוען...</p>}

      {tournaments && tournaments.length === 0 && (
        <div className="empty-state card">
          <p>עדיין אין תחרויות. לחצו על "התחלת תחרות חדשה" כדי להתחיל.</p>
        </div>
      )}

      {tournaments?.map((t) => (
        <div className="card" key={t.id}>
          <Link to={stagePath(t)} className="tournament-card">
            <div className="tournament-card-top">
              <div>
                <div className="card-title">{t.name}</div>
                <div className="muted">
                  {formatLabel[t.format]} · {t.tableCount} שולחנות ·{" "}
                  {new Date(t.createdAt).toLocaleDateString("he-IL")}
                </div>
              </div>
              <span className="pill stage">{stageLabel[t.stage]}</span>
            </div>
          </Link>
          <div className="actions-row" style={{ marginTop: 12 }}>
            <Link to={`/tournaments/${t.id}/edit`}>
              <button className="secondary small">עריכה</button>
            </Link>
            <button className="danger small" onClick={() => setPendingDelete(t)}>
              מחיקה
            </button>
          </div>
        </div>
      ))}

      {pendingDelete && (
        <ConfirmDialog
          message={`למחוק לצמיתות את התחרות "${pendingDelete.name}"? כל השחקנים והתוצאות יימחקו.`}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
