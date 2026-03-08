import { describe, expect, it } from "vitest";
import { applyEvent, deriveMatchState, redo, undo, type MatchTimeline } from "./matchEngine";
import type { MatchEvent } from "./types";

function ts(n: number): string {
  return `2026-03-07T00:00:0${n}.000Z`;
}

function push(timeline: MatchTimeline, event: MatchEvent): MatchTimeline {
  return applyEvent(timeline, event);
}

describe("matchEngine", () => {
  it("returns undefined before match start", () => {
    const state = deriveMatchState({ events: [], cursor: 0 });
    expect(state).toBeUndefined();
  });

  it("replays lifecycle + stats into per-set and aggregate totals", () => {
    let timeline: MatchTimeline = { events: [], cursor: 0 };

    timeline = push(timeline, {
      type: "MATCH_STARTED",
      matchId: "m1",
      matchName: "Quarterfinal",
      timestamp: ts(1),
    });
    timeline = push(timeline, {
      type: "SET_STARTED",
      matchId: "m1",
      setNumber: 1,
      timestamp: ts(2),
    });
    timeline = push(timeline, {
      type: "STAT_INCREMENTED",
      matchId: "m1",
      setNumber: 1,
      stat: "usAces",
      value: 2,
      timestamp: ts(3),
    });
    timeline = push(timeline, {
      type: "SET_ENDED",
      matchId: "m1",
      setNumber: 1,
      timestamp: ts(4),
    });
    timeline = push(timeline, {
      type: "SET_STARTED",
      matchId: "m1",
      setNumber: 2,
      timestamp: ts(5),
    });
    timeline = push(timeline, {
      type: "STAT_INCREMENTED",
      matchId: "m1",
      setNumber: 2,
      stat: "firstBallOpponentKills",
      value: 1,
      timestamp: ts(6),
    });

    const state = deriveMatchState(timeline);
    expect(state).toBeDefined();
    expect(state?.sets).toHaveLength(2);
    expect(state?.sets[0].usScore).toBe(2);
    expect(state?.sets[1].opponentScore).toBe(1);
    expect(state?.aggregate.usScore).toBe(2);
    expect(state?.aggregate.opponentScore).toBe(1);
    expect(state?.activeSetNumber).toBe(2);
  });

  it("supports undo and redo via cursor movement", () => {
    let timeline: MatchTimeline = { events: [], cursor: 0 };

    timeline = push(timeline, {
      type: "MATCH_STARTED",
      matchId: "m1",
      matchName: "Match",
      timestamp: ts(1),
    });
    timeline = push(timeline, {
      type: "SET_STARTED",
      matchId: "m1",
      setNumber: 1,
      timestamp: ts(2),
    });
    timeline = push(timeline, {
      type: "STAT_INCREMENTED",
      matchId: "m1",
      setNumber: 1,
      stat: "transitionUsKills",
      value: 1,
      timestamp: ts(3),
    });

    const beforeUndo = deriveMatchState(timeline);
    expect(beforeUndo?.aggregate.usScore).toBe(1);

    timeline = undo(timeline);
    const afterUndo = deriveMatchState(timeline);
    expect(afterUndo?.aggregate.usScore).toBe(0);
    expect(afterUndo?.canRedo).toBe(true);

    timeline = redo(timeline);
    const afterRedo = deriveMatchState(timeline);
    expect(afterRedo?.aggregate.usScore).toBe(1);
  });

  it("invalidates redo history when appending after undo", () => {
    let timeline: MatchTimeline = { events: [], cursor: 0 };

    timeline = push(timeline, {
      type: "MATCH_STARTED",
      matchId: "m1",
      matchName: "Match",
      timestamp: ts(1),
    });
    timeline = push(timeline, {
      type: "SET_STARTED",
      matchId: "m1",
      setNumber: 1,
      timestamp: ts(2),
    });
    timeline = push(timeline, {
      type: "STAT_INCREMENTED",
      matchId: "m1",
      setNumber: 1,
      stat: "usAces",
      value: 1,
      timestamp: ts(3),
    });

    timeline = undo(timeline);
    timeline = push(timeline, {
      type: "STAT_INCREMENTED",
      matchId: "m1",
      setNumber: 1,
      stat: "opponentAces",
      value: 1,
      timestamp: ts(4),
    });

    const state = deriveMatchState(timeline);
    expect(state?.aggregate.usScore).toBe(0);
    expect(state?.aggregate.opponentScore).toBe(1);
    expect(state?.canRedo).toBe(false);
  });
});
