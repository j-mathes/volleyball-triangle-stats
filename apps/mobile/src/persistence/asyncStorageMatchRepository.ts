import type { MatchEvent, MatchRepository, MatchSummary, MatchTimelineRecord } from "@triangle-stats/shared";

const INDEX_KEY = "triangle-stats:matches:index";
const MATCH_KEY_PREFIX = "triangle-stats:match:";

export interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

function getMatchKey(matchId: string): string {
  return `${MATCH_KEY_PREFIX}${matchId}`;
}

function toSummary(record: MatchTimelineRecord): MatchSummary {
  return {
    matchId: record.matchId,
    matchName: record.matchName,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    eventCount: record.events.length,
    cursor: record.cursor,
  };
}

async function readIndex(storage: AsyncStorageLike): Promise<MatchSummary[]> {
  const raw = await storage.getItem(INDEX_KEY);
  if (!raw) {
    return [];
  }

  const parsed = JSON.parse(raw) as MatchSummary[];
  return parsed.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function writeIndex(storage: AsyncStorageLike, summaries: MatchSummary[]): Promise<void> {
  await storage.setItem(INDEX_KEY, JSON.stringify(summaries));
}

function upsertSummary(list: MatchSummary[], next: MatchSummary): MatchSummary[] {
  const without = list.filter((item) => item.matchId !== next.matchId);
  without.push(next);
  return without.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export class AsyncStorageMatchRepository implements MatchRepository {
  constructor(private readonly storage: AsyncStorageLike) {}

  async createMatch(matchId: string, matchName: string, createdAt: string): Promise<MatchTimelineRecord> {
    const event: MatchEvent = {
      type: "MATCH_STARTED",
      matchId,
      matchName,
      timestamp: createdAt,
    };

    const record: MatchTimelineRecord = {
      matchId,
      matchName,
      createdAt,
      updatedAt: createdAt,
      cursor: 1,
      events: [event],
    };

    await this.storage.setItem(getMatchKey(matchId), JSON.stringify(record));

    const existing = await readIndex(this.storage);
    const updated = upsertSummary(existing, toSummary(record));
    await writeIndex(this.storage, updated);

    return record;
  }

  async listMatches(): Promise<MatchSummary[]> {
    return readIndex(this.storage);
  }

  async loadMatch(matchId: string): Promise<MatchTimelineRecord | undefined> {
    const raw = await this.storage.getItem(getMatchKey(matchId));
    if (!raw) {
      return undefined;
    }

    return JSON.parse(raw) as MatchTimelineRecord;
  }

  async saveTimeline(record: MatchTimelineRecord): Promise<void> {
    const nextRecord: MatchTimelineRecord = {
      ...record,
      updatedAt: new Date().toISOString(),
    };

    await this.storage.setItem(getMatchKey(record.matchId), JSON.stringify(nextRecord));

    const existing = await readIndex(this.storage);
    const updated = upsertSummary(existing, toSummary(nextRecord));
    await writeIndex(this.storage, updated);
  }

  async deleteMatch(matchId: string): Promise<void> {
    await this.storage.removeItem(getMatchKey(matchId));

    const existing = await readIndex(this.storage);
    const updated = existing.filter((item) => item.matchId !== matchId);
    await writeIndex(this.storage, updated);
  }
}
