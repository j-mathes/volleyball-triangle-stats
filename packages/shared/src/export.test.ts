import { describe, expect, it } from "vitest";
import { toExportCsv, toExportJson } from "./export";
import { applyEvent, deriveMatchState, type MatchTimeline } from "./matchEngine";

describe("export", () => {
  it("builds JSON export with schema version and timeline", () => {
    let timeline: MatchTimeline = { events: [], cursor: 0 };
    timeline = applyEvent(timeline, {
      type: "MATCH_STARTED",
      matchId: "m1",
      matchName: "Final",
      timestamp: "2026-03-07T00:00:01.000Z",
    });

    const state = deriveMatchState(timeline);
    expect(state).toBeDefined();

    const exported = toExportJson(state!, timeline.events, timeline.cursor);
    expect(exported.schemaVersion).toBe(1);
    expect(exported.timeline.cursor).toBe(1);
    expect(exported.timeline.events).toHaveLength(1);
    expect(exported.state.matchId).toBe("m1");
  });

  it("builds CSV with header, per-set rows, and match total row", () => {
    let timeline: MatchTimeline = { events: [], cursor: 0 };
    timeline = applyEvent(timeline, {
      type: "MATCH_STARTED",
      matchId: "m1",
      matchName: "Final",
      timestamp: "2026-03-07T00:00:01.000Z",
    });
    timeline = applyEvent(timeline, {
      type: "SET_STARTED",
      matchId: "m1",
      setNumber: 1,
      timestamp: "2026-03-07T00:00:02.000Z",
    });
    timeline = applyEvent(timeline, {
      type: "STAT_INCREMENTED",
      matchId: "m1",
      setNumber: 1,
      stat: "usAces",
      value: 1,
      timestamp: "2026-03-07T00:00:03.000Z",
    });

    const state = deriveMatchState(timeline);
    expect(state).toBeDefined();

    const csv = toExportCsv(state!);
    const lines = csv.split("\n");

    expect(lines[0]).toContain("row,usScore,opponentScore");
    expect(lines.some((line: string) => line.startsWith("set-1,"))).toBe(true);
    expect(lines.some((line: string) => line.startsWith("match-total,"))).toBe(true);
  });
});
