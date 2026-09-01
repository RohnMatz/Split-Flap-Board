import { getDb } from '@/lib/db';
import type { FeedResult } from '@/types/feeds';
import type { AppConfig } from '@/types/config';
import { getCachedFeed, getStaleCache, setCachedFeed, setFeedError } from './cache';
import { fetchWeather } from './weather';
import { fetchNews } from './news';
import { fetchLaunches } from './launches';
import { fetchISSPass } from './iss';
import { fetchMoon } from './moon';
import { fetchWikipediaOnThisDay } from './wikipedia';
import { fetchFlights } from './flights';
import { fetchQuote } from './quotes';
import { fetchSports } from './sports';
import { fetchStocks } from './stocks';
import { fetchCountdown } from './countdown';

interface ScheduleSlot {
  id: number;
  position: number;
  feed_id: string | null;
  message_id: number | null;
  duration: number;
  enabled: number;
  start_hour: number | null;
  end_hour: number | null;
}

interface MessageRow {
  id: number;
  label: string;
  body: string;
  category: string;
}

interface FeedRow {
  id: string;
  type: string;
  enabled: number;
  config_json: string;
  cache_ttl: number;
}

let currentSlotIndex = 0;
let slotStartedAt = 0;
let revision = 0;

function getConfig(): AppConfig {
  const db = getDb();
  const row = db.prepare('SELECT * FROM app_config WHERE id = 1').get() as Record<string, unknown>;
  return {
    id: 1,
    latitude: (row.latitude as number) ?? 40.7128,
    longitude: (row.longitude as number) ?? -74.006,
    timezone: (row.timezone as string) ?? 'America/New_York',
    cols: (row.cols as number) ?? 32,
    rows: (row.rows as number) ?? 4,
    fontSize: (row.font_size as number) ?? 1.0,
    flipSpeed: (row.flip_speed as number) ?? 80,
    waveDelay: (row.wave_delay as number) ?? 40,
    audioEnabled: Boolean(row.audio_enabled),
    audioVolume: (row.audio_volume as number) ?? 0.7,
    brightness: (row.brightness as number) ?? 1.0,
    accentColor: (row.accent_color as string) ?? '#e85d04',
    boardBg: (row.board_bg as string) ?? '#1a1a1a',
    cellBg: (row.cell_bg as string) ?? '#111111',
    charColor: (row.char_color as string) ?? '#f5f0e8',
    fontFamily: (row.font_family as string) ?? "'Courier Prime', monospace",
    cellWidth: (row.cell_width as string) ?? '2.4rem',
    cellHeight: (row.cell_height as string) ?? '4rem',
    presetId: (row.preset_id as string) ?? 'twa',
    rotationInterval: (row.rotation_interval as number) ?? 30,
    textHAlign: ((row.text_h_align as string) ?? 'center') as AppConfig['textHAlign'],
    textVAlign: ((row.text_v_align as string) ?? 'top') as AppConfig['textVAlign'],
    animationPatterns: (() => {
      try { return JSON.parse((row.animation_patterns as string) ?? '[]'); } catch { return []; }
    })(),
  };
}

/** Returns true if the current hour (in local server time) is within [start, end). */


async function fetchFeedResult(feedRow: FeedRow, config: AppConfig): Promise<FeedResult | null> {
  const feedConfig = JSON.parse(feedRow.config_json) as Record<string, unknown>;
  const cols = config.cols;

  try {
    switch (feedRow.type) {
      case 'weather':
        return await fetchWeather(config.latitude, config.longitude, cols);

      case 'news': {
        const rssUrl = (feedConfig.rssUrl as string) ?? 'https://feeds.bbci.co.uk/news/rss.xml';
        const source = (feedConfig.source as string) ?? 'NEWS';
        const items = await fetchNews(rssUrl, source, cols);
        return items[0] ?? null;
      }

      case 'launches': {
        const windowHours = (feedConfig.windowHours as number) ?? 48;
        return await fetchLaunches(windowHours, cols);
      }

      case 'iss': {
        const windowHours = (feedConfig.windowHours as number) ?? 6;
        return await fetchISSPass(config.latitude, config.longitude, config.timezone, windowHours, cols);
      }

      case 'moon':
        return fetchMoon(cols);

      case 'wikipedia':
        return await fetchWikipediaOnThisDay(cols);

      case 'flights': {
        const radiusDeg = (feedConfig.radiusDeg as number) ?? 0.5;
        return await fetchFlights(config.latitude, config.longitude, radiusDeg, cols);
      }

      case 'quotes': {
        const categories = (feedConfig.categories as string[]) ?? [];
        return fetchQuote(categories, cols);
      }

      case 'sports': {
        const sport = (feedConfig.sport as string) ?? 'baseball';
        const league = (feedConfig.league as string) ?? 'mlb';
        return await fetchSports(sport, league, cols);
      }

      case 'stocks': {
        const symbols = (feedConfig.symbols as string[]) ?? ['SPY', 'QQQ'];
        return await fetchStocks(symbols, cols);
      }

      case 'countdown': {
        const label = (feedConfig.label as string) ?? 'EVENT';
        const targetDate = (feedConfig.targetDate as string) ?? '';
        if (!targetDate) return null;
        return fetchCountdown(label, targetDate, cols);
      }

      default:
        return null;
    }
  } catch (err) {
    console.error(`Feed ${feedRow.id} error:`, err);
    setFeedError(feedRow.id, String(err));
    return null;
  }
}

async function getResultForFeed(feedRow: FeedRow, config: AppConfig): Promise<FeedResult | null> {
  const cached = getCachedFeed(feedRow.id);
  if (cached) return cached;

  const result = await fetchFeedResult(feedRow, config);
  if (result) {
    setCachedFeed(feedRow.id, result, feedRow.cache_ttl);
    return result;
  }

  return getStaleCache(feedRow.id);
}

export async function getCurrentBoardState(): Promise<{
  result: FeedResult;
  revision: number;
  config: AppConfig;
}> {
  const db = getDb();
  const config = getConfig();

  const slots = db
    .prepare('SELECT * FROM schedule_slots WHERE enabled = 1 ORDER BY position')
    .all() as ScheduleSlot[];

  if (slots.length === 0) {
    const fallback = fetchQuote([], config.cols);
    if (slotStartedAt === 0) { slotStartedAt = Date.now(); revision++; }
    return { result: fallback, revision, config };
  }

  const now = Date.now();
  const elapsed = now - slotStartedAt;
  const currentDuration = slots[currentSlotIndex % slots.length].duration * 1000;

  // Still within the current slot's duration — return unchanged (client deduplicates on revision)
  if (slotStartedAt > 0 && elapsed < currentDuration) {
    return { result: fetchQuote([], config.cols), revision, config };
  }

  // Duration expired (or first run). Advance to the next slot if not the first run.
  if (slotStartedAt > 0) {
    currentSlotIndex = (currentSlotIndex + 1) % slots.length;
  }

  // Find the next relevant slot, trying each in order
  for (let attempts = 0; attempts < slots.length; attempts++) {
    const slot = slots[currentSlotIndex % slots.length];

    if (slot.feed_id) {
      const feedRow = db
        .prepare('SELECT * FROM feeds WHERE id = ? AND enabled = 1')
        .get(slot.feed_id) as FeedRow | undefined;

      if (feedRow) {
        const result = await getResultForFeed(feedRow, config);
        if (result?.isRelevant) {
          slotStartedAt = now;
          revision++;
          return { result, revision, config };
        }
      }
    } else if (slot.message_id) {
      const msg = db
        .prepare('SELECT * FROM messages WHERE id = ? AND enabled = 1')
        .get(slot.message_id) as MessageRow | undefined;

      if (msg) {
        const lines = msg.body.split('\n').map((line) =>
          line.slice(0, config.cols).padEnd(config.cols),
        );
        const result: FeedResult = {
          rows: lines.slice(0, config.rows),
          feedName: 'MESSAGE',
          feedIcon: 'message',
          accentCols: [],
          validUntil: Date.now() + slot.duration * 1000,
          isRelevant: true,
        };
        slotStartedAt = now;
        revision++;
        return { result, revision, config };
      }
    }

    // Not relevant or not found — try next slot
    currentSlotIndex = (currentSlotIndex + 1) % slots.length;
    attempts++;
  }

  // All slots exhausted — fallback to quote
  const fallback = fetchQuote([], config.cols);
  slotStartedAt = now;
  revision++;
  return { result: fallback, revision, config };
}
