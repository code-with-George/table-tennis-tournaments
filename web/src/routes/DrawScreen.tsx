import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  getTournament,
  listPlayers,
  savePlayer,
  saveMatches,
  saveTournament,
  deleteMatchesByStage,
} from "../db";
import type { Match, Player, Tournament } from "../types";
import { computeGroupCount, snakeSeedGroups, groupLabel } from "../lib/seeding";
import { buildKnockoutMatches, buildKnockoutShell, type Qualifier } from "../lib/bracket";
import { computeSeedOwners } from "../lib/groupTransitions";
import { makeId } from "../lib/matches";
import ConfirmDialog from "../components/ConfirmDialog";

export default function DrawScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [groupsPreview, setGroupsPreview] = useState<Player[][] | null>(null);
  const [groupSize, setGroupSize] = useState(4);
  const [advancersPerGroup, setAdvancersPerGroup] = useState(2);
  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(
    null
  );

  useEffect(() => {
    if (!id) return;
    (async () => {
      const t = await getTournament(id);
      const p = await listPlayers(id);
      setTournament(t ?? null);
      setPlayers(p);
      if (t?.format === "groups") {
        setGroupSize(t.groupSize);
        setAdvancersPerGroup(t.advancersPerGroup);
      }
    })();
  }, [id]);

  useEffect(() => {
    if (!tournament || tournament.format !== "groups" || players.length === 0) return;
    const sorted = [...players].sort((a, b) => b.rating - a.rating);
    const groupCount = computeGroupCount(sorted.length, groupSize);
    setGroupsPreview(snakeSeedGroups(sorted, groupCount));
    // re-splits from scratch on group-size change; manual moves only persist within a size
  }, [players, tournament, groupSize]);

  const groupCount = groupsPreview?.length ?? 0;

  const sortedForKnockout = useMemo(
    () => [...players].sort((a, b) => b.rating - a.rating),
    [players]
  );

  function movePlayer(playerId: string, fromGroup: number, toGroup: number) {
    if (!groupsPreview || fromGroup === toGroup) return;
    setGroupsPreview((prev) => {
      if (!prev) return prev;
      const next = prev.map((g) => [...g]);
      const idx = next[fromGroup].findIndex((p) => p.id === playerId);
      if (idx === -1) return prev;
      const [player] = next[fromGroup].splice(idx, 1);
      next[toGroup].push(player);
      return next;
    });
  }

  function confirmGroups() {
    if (!tournament || !groupsPreview) return;
    if (tournament.stage !== "players" && tournament.stage !== "draw") {
      setConfirmState({
        message:
          "התחרות כבר בשלב מאוחר יותר. אישור החלוקה מחדש ימחק את כל תוצאות הבתים ואת שלב הנוקאוט הקיים (אם נבנה) ויתחיל אותם מחדש. להמשיך?",
        onConfirm: doConfirmGroups,
      });
      return;
    }
    doConfirmGroups();
  }

  async function doConfirmGroups() {
    if (!tournament || !groupsPreview) return;
    setConfirmState(null);
    await Promise.all([
      deleteMatchesByStage(tournament.id, "group"),
      deleteMatchesByStage(tournament.id, "knockout"),
    ]);
    const updatedPlayers: Player[] = [];
    const matches: Match[] = [];
    groupsPreview.forEach((groupPlayers, gi) => {
      const label = groupLabel(gi);
      groupPlayers.forEach((p) => updatedPlayers.push({ ...p, groupId: String(gi), groupLabel: label }));
      for (let i = 0; i < groupPlayers.length; i++) {
        for (let j = i + 1; j < groupPlayers.length; j++) {
          matches.push({
            tournamentId: tournament.id,
            id: makeId(),
            stage: "group",
            groupId: String(gi),
            groupLabel: label,
            playerAId: groupPlayers[i].id,
            playerBId: groupPlayers[j].id,
            games: [],
            status: "ready",
          });
        }
      }
    });
    const qualifierCount = computeSeedOwners(
      groupsPreview.map((groupPlayers, gi) => ({ groupId: String(gi), playerCount: groupPlayers.length })),
      advancersPerGroup
    ).size;
    const shell = buildKnockoutShell(tournament.id, qualifierCount);

    await Promise.all(updatedPlayers.map(savePlayer));
    await saveMatches([...matches, ...shell]);
    await saveTournament({ ...tournament, groupSize, advancersPerGroup, stage: "groups" });
    navigate(`/tournaments/${tournament.id}/groups`);
  }

  async function backToPlayers() {
    if (!tournament) return;
    await saveTournament({ ...tournament, stage: "players" });
    navigate(`/tournaments/${tournament.id}/players`);
  }

  function confirmKnockout() {
    if (!tournament) return;
    if (tournament.stage === "knockout" || tournament.stage === "done") {
      setConfirmState({
        message:
          "התחרות כבר בשלב הנוקאוט. בניית הברקט מחדש תמחק את כל התוצאות שהוזנו בו ותתחיל אותו מחדש. להמשיך?",
        onConfirm: doConfirmKnockout,
      });
      return;
    }
    doConfirmKnockout();
  }

  async function doConfirmKnockout() {
    if (!tournament) return;
    setConfirmState(null);
    await deleteMatchesByStage(tournament.id, "knockout");
    const qualifiers: Qualifier[] = sortedForKnockout.map((p, i) => ({ playerId: p.id, seed: i + 1 }));
    const matches = buildKnockoutMatches(tournament.id, qualifiers);
    await saveMatches(matches);
    await saveTournament({ ...tournament, stage: "knockout" });
    navigate(`/tournaments/${tournament.id}/knockout`);
  }

  if (!tournament) return <div className="page">טוען...</div>;

  return (
    <div className="page">
      <p className="muted">
        <Link to="/">כל התחרויות</Link> / {tournament.name}
      </p>

      {tournament.format === "groups" ? (
        <>
          <div className="screen-header">
            <h1>חלוקה לבתים</h1>
            <button className="secondary" onClick={backToPlayers}>
              → הוספת שחקנים נוספים
            </button>
          </div>
          <p className="muted">
            {players.length} שחקנים נוספו לתחרות. חלוקה אוטומטית לפי שיטת Seeding נחש (Snake) —
            השחקנים מפוזרים בין הבתים כך שכל בית יהיה מאוזן ברמתו. ניתן להעביר שחקן ידנית בין
            בתים לפני האישור הסופי.
          </p>

          <div className="card">
            <div className="field">
              <label>גודל בית יעד (מספר שחקנים)</label>
              <div className="choice-group">
                {[3, 4, 5].map((size) => (
                  <div
                    key={size}
                    className={`choice-card ${groupSize === size ? "selected" : ""}`}
                    onClick={() => setGroupSize(size)}
                  >
                    <div className="title">{size} שחקנים בבית</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="field">
              <label>כמה עולים משלב הבתים לנוקאוט (מכל בית)</label>
              <div className="choice-group">
                {[1, 2, 3].map((count) => (
                  <div
                    key={count}
                    className={`choice-card ${advancersPerGroup === count ? "selected" : ""}`}
                    onClick={() => setAdvancersPerGroup(count)}
                  >
                    <div className="title">{count} עולים</div>
                  </div>
                ))}
              </div>
            </div>

            <p className="muted" style={{ margin: 0 }}>
              {players.length} שחקנים יחולקו ל-{groupCount} בתים (בממוצע כ-
              {Math.round(players.length / Math.max(1, groupCount))} שחקנים לבית).
            </p>
          </div>

          {groupsPreview && (
            <div className="groups-grid">
              {groupsPreview.map((groupPlayers, gi) => (
                <div className="card" key={gi}>
                  <div className="card-title">{groupLabel(gi)}</div>
                  {groupPlayers
                    .slice()
                    .sort((a, b) => b.rating - a.rating)
                    .map((p) => (
                      <div className="player-list-row" key={p.id}>
                        <div>
                          <strong>{p.name}</strong>
                          <span className="muted"> · {p.rating}</span>
                        </div>
                        <select
                          value={gi}
                          onChange={(e) => movePlayer(p.id, gi, Number(e.target.value))}
                          style={{ width: "auto" }}
                        >
                          {groupsPreview.map((_, oi) => (
                            <option key={oi} value={oi}>
                              {groupLabel(oi)}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                </div>
              ))}
            </div>
          )}

          <div className="actions-row">
            <button onClick={confirmGroups}>אישור החלוקה והתחלת שלב הבתים</button>
          </div>
        </>
      ) : (
        <>
          <div className="screen-header">
            <h1>סיד לקראת הנוקאוט</h1>
            <button className="secondary" onClick={backToPlayers}>
              → הוספת שחקנים נוספים
            </button>
          </div>
          <p className="muted">השחקנים מדורגים לפי דירוג. הזרעים החזקים יפוזרו בברקט כדי להיפגש רק בשלבים מאוחרים.</p>

          <div className="card">
            {sortedForKnockout.map((p, i) => (
              <div className="player-list-row" key={p.id}>
                <div>
                  <span className="pill" style={{ marginInlineEnd: 10 }}>
                    זרע {i + 1}
                  </span>
                  <strong>{p.name}</strong>
                </div>
                <span className="rating">{p.rating}</span>
              </div>
            ))}
          </div>

          <div className="actions-row">
            <button onClick={confirmKnockout}>אישור ובניית ברקט הנוקאוט</button>
          </div>
        </>
      )}

      {confirmState && (
        <ConfirmDialog
          message={confirmState.message}
          onConfirm={confirmState.onConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </div>
  );
}
