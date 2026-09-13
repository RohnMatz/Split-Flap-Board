import Parser from 'rss-parser';
import type { FeedResult } from '@/types/feeds';
import { sanitize, padRow, wordWrap } from './formatter';

const parser = new Parser({ timeout: 8000 });

export async function fetchNews(
  rssUrl: string,
  source: string,
  cols: number,
  maxRows: number = 6,
): Promise<FeedResult[]> {
  const feed = await parser.parseURL(rssUrl);
  const items = feed.items.slice(0, 5);

  return items.map((item) => {
    const title = sanitize(item.title ?? 'NO TITLE');

    const rawSummary = (item.contentSnippet ?? item.content ?? '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const summary = sanitize(rawSummary);

    const body = summary
      ? (summary.startsWith(title) ? summary : `${title}\n${summary}`)
      : title;

    const lines = wordWrap(body, cols).slice(0, Math.max(1, maxRows - 1));

    const rows = [
      padRow(source.slice(0, cols), cols),
      ...lines.map((line) => padRow(line, cols)),
    ];

    while (rows.length < maxRows) {
      rows.push(padRow('', cols));
    }

    return {
      rows: rows.slice(0, maxRows),
      feedName: 'NEWS',
      feedIcon: 'newspaper',
      accentCols: [],
      validUntil: Date.now() + 900_000,
      isRelevant: true,
    };
  });
}
