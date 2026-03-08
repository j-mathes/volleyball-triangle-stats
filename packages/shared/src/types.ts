export type TeamSide = "us" | "opponent";

export type TerminalServeStat =
  | "usAces"
  | "usMisses"
  | "opponentAces"
  | "opponentMisses";

export type RallyStat =
  | "usKills"
  | "usStops"
  | "opponentKills"
  | "opponentStops";

export type FirstBallStat =
  | "firstBallUsKills"
  | "firstBallUsStops"
  | "firstBallOpponentKills"
  | "firstBallOpponentStops";

export type TransitionStat =
  | "transitionUsKills"
  | "transitionUsStops"
  | "transitionOpponentKills"
  | "transitionOpponentStops";

export type StatKey = TerminalServeStat | FirstBallStat | TransitionStat;

export type TriangleCategory =
  | "terminalServes"
  | "firstBallPoints"
  | "transitionPoints";

export type MatchEvent =
  | {
      type: "MATCH_STARTED";
      matchId: string;
      matchName: string;
      timestamp: string;
    }
  | {
      type: "SET_STARTED";
      matchId: string;
      setNumber: number;
      timestamp: string;
    }
  | {
      type: "STAT_INCREMENTED";
      matchId: string;
      setNumber: number;
      stat: StatKey;
      value: number;
      timestamp: string;
    }
  | {
      type: "SET_ENDED";
      matchId: string;
      setNumber: number;
      timestamp: string;
    }
  | {
      type: "MATCH_ENDED";
      matchId: string;
      timestamp: string;
    };

export type StatTotals = Record<StatKey, number>;

export interface SetDerivedState {
  setNumber: number;
  stats: StatTotals;
  terminalServes: number;
  firstBallPoints: number;
  transitionPoints: number;
  usScore: number;
  opponentScore: number;
}

export interface MatchDerivedState {
  matchId: string;
  matchName: string;
  startedAt: string;
  endedAt?: string;
  activeSetNumber?: number;
  sets: SetDerivedState[];
  aggregate: SetDerivedState;
  cursor: number;
  canUndo: boolean;
  canRedo: boolean;
}
