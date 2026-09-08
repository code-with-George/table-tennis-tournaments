export type TournamentFormat = "groups" | "knockout";
export type MatchFormatType = "bo3" | "bo5" | "bo7";
export type TournamentStage = "players" | "draw" | "groups" | "knockout" | "done";

export interface Tournament {
  id: string;
  name: string;
  createdAt: number;
  tableCount: number;
  format: TournamentFormat;
  matchFormat: MatchFormatType;
  groupSize: number;
  advancersPerGroup: number;
  stage: TournamentStage;
}

export interface Player {
  tournamentId: string;
  id: string;
  name: string;
  club?: string;
  rating: number;
  source: "tttm" | "manual";
  tttmId?: string;
  groupId?: string;
  groupLabel?: string;
}

export interface GameScore {
  a: number;
  b: number;
}

export type MatchStatus = "pending" | "ready" | "done";

export interface Match {
  tournamentId: string;
  id: string;
  stage: "group" | "knockout";
  groupId?: string;
  groupLabel?: string;
  round?: number;
  slot?: number;
  tableNumber?: number;
  playerAId?: string;
  playerBId?: string;
  games: GameScore[];
  winnerId?: string;
  status: MatchStatus;
}
