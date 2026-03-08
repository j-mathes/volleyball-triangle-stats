import type {
  MatchEvent,
  MatchRepository,
  MatchTimeline,
  MatchTimelineRecord,
  StatKey,
} from "@triangle-stats/shared";
import { applyEvent, deriveMatchState, redo, undo } from "@triangle-stats/shared";

const now = () => new Date().toISOString();

export class MobileMatchController {
  private timeline: MatchTimeline = { events: [], cursor: 0 };
  private currentMatchId?: string;
  private currentMatchName?: string;
  private createdAt?: string;

  constructor(private readonly repository?: MatchRepository) {}

  private toRecord(): MatchTimelineRecord | undefined {
    if (!this.currentMatchId || !this.currentMatchName || !this.createdAt) {
      return undefined;
    }

    return {
      matchId: this.currentMatchId,
      matchName: this.currentMatchName,
      createdAt: this.createdAt,
      updatedAt: now(),
      cursor: this.timeline.cursor,
      events: this.timeline.events,
    };
  }

  private hydrate(record: MatchTimelineRecord): void {
    this.timeline = {
      events: record.events,
      cursor: record.cursor,
    };
    this.currentMatchId = record.matchId;
    this.currentMatchName = record.matchName;
    this.createdAt = record.createdAt;
  }

  async createMatch(matchId: string, matchName: string): Promise<void> {
    if (!this.repository) {
      this.startMatch(matchId, matchName);
      return;
    }

    const createdAt = now();
    const record = await this.repository.createMatch(matchId, matchName, createdAt);
    this.hydrate(record);
  }

  async restoreMatch(matchId: string): Promise<boolean> {
    if (!this.repository) {
      return false;
    }

    const record = await this.repository.loadMatch(matchId);
    if (!record) {
      return false;
    }

    this.hydrate(record);
    return true;
  }

  async persistMatch(): Promise<void> {
    if (!this.repository) {
      return;
    }

    const record = this.toRecord();
    if (!record) {
      return;
    }

    await this.repository.saveTimeline(record);
  }

  startMatch(matchId: string, matchName: string): void {
    this.currentMatchId = matchId;
    this.currentMatchName = matchName;
    this.createdAt = now();
    this.timeline = { events: [], cursor: 0 };

    const event: MatchEvent = {
      type: "MATCH_STARTED",
      matchId,
      matchName,
      timestamp: this.createdAt,
    };
    this.timeline = applyEvent(this.timeline, event);
  }

  dispatch(event: MatchEvent): void {
    if (event.type === "MATCH_STARTED") {
      this.currentMatchId = event.matchId;
      this.currentMatchName = event.matchName;
      this.createdAt = event.timestamp;
      this.timeline = { events: [], cursor: 0 };
    }

    this.timeline = applyEvent(this.timeline, event);
  }

  incrementStat(matchId: string, setNumber: number, stat: StatKey): void {
    this.dispatch({
      type: "STAT_INCREMENTED",
      matchId,
      setNumber,
      stat,
      value: 1,
      timestamp: now(),
    });
  }

  getState() {
    return deriveMatchState(this.timeline);
  }

  getTimeline(): MatchTimeline {
    return this.timeline;
  }

  undo(): void {
    this.timeline = undo(this.timeline);
  }

  redo(): void {
    this.timeline = redo(this.timeline);
  }
}
