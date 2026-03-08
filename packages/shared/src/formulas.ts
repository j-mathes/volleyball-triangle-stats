import type { SetDerivedState, StatTotals } from "./types";

export function calculateTerminalServes(stats: StatTotals): number {
  return (stats.usAces + stats.opponentMisses) - (stats.opponentAces + stats.usMisses);
}

export function calculateFirstBallPoints(stats: StatTotals): number {
  return (stats.firstBallUsKills + stats.firstBallUsStops) - (stats.firstBallOpponentKills + stats.firstBallOpponentStops);
}

export function calculateTransitionPoints(stats: StatTotals): number {
  return (stats.transitionUsKills + stats.transitionUsStops) - (stats.transitionOpponentKills + stats.transitionOpponentStops);
}

export function calculateSetScore(stats: StatTotals): { us: number; opponent: number } {
  const us =
    stats.usAces +
    stats.firstBallUsKills +
    stats.firstBallUsStops +
    stats.transitionUsKills +
    stats.transitionUsStops;

  const opponent =
    stats.opponentAces +
    stats.firstBallOpponentKills +
    stats.firstBallOpponentStops +
    stats.transitionOpponentKills +
    stats.transitionOpponentStops;

  return { us, opponent };
}

export function withDerived(set: Omit<SetDerivedState, "terminalServes" | "firstBallPoints" | "transitionPoints" | "usScore" | "opponentScore">): SetDerivedState {
  const terminalServes = calculateTerminalServes(set.stats);
  const firstBallPoints = calculateFirstBallPoints(set.stats);
  const transitionPoints = calculateTransitionPoints(set.stats);
  const score = calculateSetScore(set.stats);

  return {
    ...set,
    terminalServes,
    firstBallPoints,
    transitionPoints,
    usScore: score.us,
    opponentScore: score.opponent,
  };
}
