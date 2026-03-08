import { describe, expect, it } from "vitest";
import { toExportCsv, toExportJson } from "./export";
import { applyEvent, deriveMatchState, redo, undo, type MatchTimeline } from "./matchEngine";
import type { MatchEvent, MatchDerivedState } from "./types";

function ts(n: number): string {
  return `2026-03-07T00:00:${String(n).padStart(2, "0")}.000Z`;
}

function push(timeline: MatchTimeline, event: MatchEvent): MatchTimeline {
  return applyEvent(timeline, event);
}

function assertState(state: MatchDerivedState | undefined): asserts state is MatchDerivedState {
  expect(state).toBeDefined();
}

describe("integration", () => {
  it("runs full lifecycle with multi-set stats, undo/redo, and match end", () => {
    let timeline: MatchTimeline = { events: [], cursor: 0 };

    timeline = push(timeline, {
      type: "MATCH_STARTED",
      matchId: "m-int-1",
      matchName: "Tournament Final",
      timestamp: ts(1),
    });

    timeline = push(timeline, {
      type: "SET_STARTED",
      matchId: "m-int-1",
      setNumber: 1,
      timestamp: ts(2),
    });

    timeline = push(timeline, {
      type: "STAT_INCREMENTED",
      matchId: "m-int-1",
      setNumber: 1,
      stat: "usAces",
      value: 2,
      timestamp: ts(3),
    });

    timeline = push(timeline, {
      type: "STAT_INCREMENTED",
      matchId: "m-int-1",
      setNumber: 1,
      stat: "firstBallUsKills",
      value: 3,
      timestamp: ts(4),
    });

    timeline = push(timeline, {
      type: "SET_ENDED",
      matchId: "m-int-1",
      setNumber: 1,
      timestamp: ts(5),
    });

    timeline = push(timeline, {
      type: "SET_STARTED",
      matchId: "m-int-1",
      setNumber: 2,
      timestamp: ts(6),
    });

    timeline = push(timeline, {
      type: "STAT_INCREMENTED",
      matchId: "m-int-1",
      setNumber: 2,
      stat: "opponentAces",
      value: 1,
      timestamp: ts(7),
    });

    timeline = undo(timeline);
    timeline = redo(timeline);

    timeline = push(timeline, {
      type: "MATCH_ENDED",
      matchId: "m-int-1",
      timestamp: ts(8),
    });

    const state = deriveMatchState(timeline);
    assertState(state);

    expect(state.sets).toHaveLength(2);
    expect(state.aggregate.usScore).toBe(5);
    expect(state.aggregate.opponentScore).toBe(1);
    expect(state.endedAt).toBe(ts(8));
    expect(state.activeSetNumber).toBeUndefined();
    expect(state.canUndo).toBe(true);
  });

  it("preserves deterministic reconstruction from JSON export timeline", () => {
    let timeline: MatchTimeline = { events: [], cursor: 0 };

    timeline = push(timeline, {
      type: "MATCH_STARTED",
      matchId: "m-int-2",
      matchName: "Replay Test",
      timestamp: ts(1),
    });
    timeline = push(timeline, {
      type: "SET_STARTED",
      matchId: "m-int-2",
      setNumber: 1,
      timestamp: ts(2),
    });
    timeline = push(timeline, {
      type: "STAT_INCREMENTED",
      matchId: "m-int-2",
      setNumber: 1,
      stat: "transitionUsKills",
      value: 2,
      timestamp: ts(3),
    });
    timeline = push(timeline, {
      type: "STAT_INCREMENTED",
      matchId: "m-int-2",
      setNumber: 1,
      stat: "transitionOpponentStops",
      value: 1,
      timestamp: ts(4),
    });

    const state = deriveMatchState(timeline);
    assertState(state);

    const exported = toExportJson(state, timeline.events, timeline.cursor);

    const replayed = deriveMatchState({
      events: exported.timeline.events,
      cursor: exported.timeline.cursor,
    });
    assertState(replayed);

    expect(replayed).toEqual(exported.state);
  });

  it("keeps CSV shape stable for multi-set exports", () => {
    let timeline: MatchTimeline = { events: [], cursor: 0 };

    timeline = push(timeline, {
      type: "MATCH_STARTED",
      matchId: "m-int-3",
      matchName: "CSV Test",
      timestamp: ts(1),
    });
    timeline = push(timeline, {
      type: "SET_STARTED",
      matchId: "m-int-3",
      setNumber: 1,
      timestamp: ts(2),
    });
    timeline = push(timeline, {
      type: "STAT_INCREMENTED",
      matchId: "m-int-3",
      setNumber: 1,
      stat: "usAces",
      value: 1,
      timestamp: ts(3),
    });
    timeline = push(timeline, {
      type: "SET_ENDED",
      matchId: "m-int-3",
      setNumber: 1,
      timestamp: ts(4),
    });
    timeline = push(timeline, {
      type: "SET_STARTED",
      matchId: "m-int-3",
      setNumber: 2,
      timestamp: ts(5),
    });
    timeline = push(timeline, {
      type: "STAT_INCREMENTED",
      matchId: "m-int-3",
      setNumber: 2,
      stat: "opponentAces",
      value: 2,
      timestamp: ts(6),
    });

    const state = deriveMatchState(timeline);
    assertState(state);

    const csv = toExportCsv(state);
    const lines = csv.split("\n");

    expect(lines).toHaveLength(4);

    const headerColumns = lines[0].split(",").length;
    expect(headerColumns).toBe(18);

    for (const line of lines.slice(1)) {
      expect(line.split(",").length).toBe(headerColumns);
    }

    expect(lines[1].startsWith("set-1,")).toBe(true);
    expect(lines[2].startsWith("set-2,")).toBe(true);
    expect(lines[3].startsWith("match-total,")).toBe(true);
  });
});
