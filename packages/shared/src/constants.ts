import type { StatKey, StatTotals } from "./types";

export const STAT_KEYS: StatKey[] = [
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
];

export function createEmptyTotals(): StatTotals {
  return Object.fromEntries(STAT_KEYS.map((k) => [k, 0])) as StatTotals;
}
