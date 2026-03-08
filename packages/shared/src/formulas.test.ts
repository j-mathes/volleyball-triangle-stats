import { describe, expect, it } from "vitest";
import { createEmptyTotals } from "./constants";
import {
  calculateFirstBallPoints,
  calculateSetScore,
  calculateTerminalServes,
  calculateTransitionPoints,
  withDerived,
} from "./formulas";

describe("formulas", () => {
  it("calculates all three triangle categories", () => {
    const stats = createEmptyTotals();
    stats.usAces = 4;
    stats.opponentMisses = 3;
    stats.opponentAces = 2;
    stats.usMisses = 1;

    stats.firstBallUsKills = 5;
    stats.firstBallUsStops = 2;
    stats.firstBallOpponentKills = 3;
    stats.firstBallOpponentStops = 1;

    stats.transitionUsKills = 4;
    stats.transitionUsStops = 3;
    stats.transitionOpponentKills = 2;
    stats.transitionOpponentStops = 2;

    expect(calculateTerminalServes(stats)).toBe(4);
    expect(calculateFirstBallPoints(stats)).toBe(3);
    expect(calculateTransitionPoints(stats)).toBe(3);
  });

  it("derives set score from tracked winning actions", () => {
    const stats = createEmptyTotals();
    stats.usAces = 2;
    stats.firstBallUsKills = 3;
    stats.firstBallUsStops = 1;
    stats.transitionUsKills = 2;
    stats.transitionUsStops = 2;

    stats.opponentAces = 1;
    stats.firstBallOpponentKills = 2;
    stats.firstBallOpponentStops = 1;
    stats.transitionOpponentKills = 3;
    stats.transitionOpponentStops = 0;

    expect(calculateSetScore(stats)).toEqual({ us: 10, opponent: 7 });
  });

  it("hydrates derived fields for a set", () => {
    const set = withDerived({
      setNumber: 1,
      stats: {
        ...createEmptyTotals(),
        usAces: 1,
        firstBallUsKills: 1,
        transitionOpponentKills: 1,
      },
    });

    expect(set.terminalServes).toBe(1);
    expect(set.firstBallPoints).toBe(1);
    expect(set.transitionPoints).toBe(-1);
    expect(set.usScore).toBe(2);
    expect(set.opponentScore).toBe(1);
  });
});
