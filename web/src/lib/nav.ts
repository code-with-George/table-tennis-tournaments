import type { Tournament } from "../types";

export function stagePath(t: Tournament): string {
  switch (t.stage) {
    case "players":
      return `/tournaments/${t.id}/players`;
    case "draw":
      return `/tournaments/${t.id}/draw`;
    case "groups":
    case "knockout":
      return `/tournaments/${t.id}/schedule`;
    case "done":
      return `/tournaments/${t.id}/knockout`;
    default:
      return `/tournaments/${t.id}/players`;
  }
}

export const formatLabel: Record<Tournament["format"], string> = {
  groups: "בתים ואז נוקאוט",
  knockout: "נוקאוט ישיר",
};

export const stageLabel: Record<Tournament["stage"], string> = {
  players: "הוספת שחקנים",
  draw: "חלוקה לבתים",
  groups: "שלב הבתים",
  knockout: "שלב הנוקאוט",
  done: "הסתיימה",
};

export const matchFormatLabel: Record<Tournament["matchFormat"], string> = {
  bo3: "עד 2 ניצחונות (Bo3)",
  bo5: "עד 3 ניצחונות (Bo5)",
  bo7: "עד 4 ניצחונות (Bo7)",
};
