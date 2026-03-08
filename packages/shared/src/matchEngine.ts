import { createEmptyTotals } from "./constants";
import { withDerived } from "./formulas";
import type { MatchDerivedState, MatchEvent, SetDerivedState, StatTotals } from "./types";

export interface MatchTimeline {
  events: MatchEvent[];
  cursor: number;
}

function createAggregateSet(stats: StatTotals): SetDerivedState {
  return withDerived({
    setNumber: 0,
    stats,
  });
}

function findSetOrCreate(sets: SetDerivedState[], setNumber: number): SetDerivedState {
  const existing = sets.find((s) => s.setNumber === setNumber);
  if (existing) {
    return existing;
  }

  const created = withDerived({
    setNumber,
    stats: createEmptyTotals(),
  });
  sets.push(created);
  return created;
}

function sumStats(sets: SetDerivedState[]): StatTotals {
  const totals = createEmptyTotals();
  for (const set of sets) {
    for (const stat of Object.keys(totals) as (keyof StatTotals)[]) {
      totals[stat] += set.stats[stat];
    }
  }
  return totals;
}

export function deriveMatchState(timeline: MatchTimeline): MatchDerivedState | undefined {
  const replayed = timeline.events.slice(0, timeline.cursor);
  const matchStarted = replayed.find((e) => e.type === "MATCH_STARTED");
  if (!matchStarted || matchStarted.type !== "MATCH_STARTED") {
    return undefined;
  }

  const sets: SetDerivedState[] = [];
  let activeSetNumber: number | undefined;
  let endedAt: string | undefined;

  for (const event of replayed) {
    if (event.type === "SET_STARTED") {
      activeSetNumber = event.setNumber;
      findSetOrCreate(sets, event.setNumber);
    }

    if (event.type === "STAT_INCREMENTED") {
      const set = findSetOrCreate(sets, event.setNumber);
      set.stats[event.stat] += event.value;
      const refreshed = withDerived(set);
      Object.assign(set, refreshed);
    }

    if (event.type === "SET_ENDED" && activeSetNumber === event.setNumber) {
      activeSetNumber = undefined;
    }

    if (event.type === "MATCH_ENDED") {
      endedAt = event.timestamp;
      activeSetNumber = undefined;
    }
  }

  const aggregate = createAggregateSet(sumStats(sets));

  return {
    matchId: matchStarted.matchId,
    matchName: matchStarted.matchName,
    startedAt: matchStarted.timestamp,
    endedAt,
    activeSetNumber,
    sets: sets.sort((a, b) => a.setNumber - b.setNumber),
    aggregate,
    cursor: timeline.cursor,
    canUndo: timeline.cursor > 0,
    canRedo: timeline.cursor < timeline.events.length,
  };
}

export function applyEvent(timeline: MatchTimeline, event: MatchEvent): MatchTimeline {
  const kept = timeline.events.slice(0, timeline.cursor);
  kept.push(event);
  return {
    events: kept,
    cursor: kept.length,
  };
}

export function undo(timeline: MatchTimeline): MatchTimeline {
  if (timeline.cursor === 0) {
    return timeline;
  }
  return {
    ...timeline,
    cursor: timeline.cursor - 1,
  };
}

export function redo(timeline: MatchTimeline): MatchTimeline {
  if (timeline.cursor >= timeline.events.length) {
    return timeline;
  }
  return {
    ...timeline,
    cursor: timeline.cursor + 1,
  };
}
