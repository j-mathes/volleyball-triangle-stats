import type { MatchDerivedState, MatchEvent, SetDerivedState } from "./types";

export interface MatchExportJson {
  schemaVersion: 1;
  exportedAt: string;
  state: MatchDerivedState;
  timeline: {
    cursor: number;
    events: MatchEvent[];
  };
}

export function toExportJson(state: MatchDerivedState, events: MatchEvent[], cursor: number): MatchExportJson {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    state,
    timeline: {
      cursor,
      events,
    },
  };
}

function csvRowsForSet(set: SetDerivedState, label: string): string[] {
  return [
    [
      label,
      set.usScore,
      set.opponentScore,
      set.terminalServes,
      set.firstBallPoints,
      set.transitionPoints,
      set.stats.usAces,
      set.stats.usMisses,
      set.stats.opponentAces,
      set.stats.opponentMisses,
      set.stats.firstBallUsKills,
      set.stats.firstBallUsStops,
      set.stats.firstBallOpponentKills,
      set.stats.firstBallOpponentStops,
      set.stats.transitionUsKills,
      set.stats.transitionUsStops,
      set.stats.transitionOpponentKills,
      set.stats.transitionOpponentStops,
    ].join(","),
  ];
}

export function toExportCsv(state: MatchDerivedState): string {
  const header = [
    "row",
    "usScore",
    "opponentScore",
    "terminalServes",
    "firstBallPoints",
    "transitionPoints",
    "usAces",
    "usMisses",
    "opponentAces",
    "opponentMisses",
    "firstBallUsKills",
    "firstBallUsStops",
    "firstBallOpponentKills",
    "firstBallOpponentStops",
    "transitionUsKills",
    "transitionUsStops",
    "transitionOpponentKills",
    "transitionOpponentStops",
  ].join(",");

  const lines: string[] = [header];
  for (const set of state.sets) {
    lines.push(...csvRowsForSet(set, `set-${set.setNumber}`));
  }
  lines.push(...csvRowsForSet(state.aggregate, "match-total"));

  return lines.join("\n");
}
