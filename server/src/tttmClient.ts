import * as cheerio from "cheerio";
import { TtlCache } from "./cache.js";

export type PlayerSearchResult = {
  id: string;
  name: string;
  club: string;
  rating: number;
};

const SEARCH_URL = "https://tttm.co.il/?page=rank";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const termCache = new TtlCache<PlayerSearchResult[]>(5 * 60 * 1000);

/** tttm.co.il's search only matches a single substring against the name, so
 * "עמית גורן" (first + last together) returns nothing even though "עמית" and
 * "גורן" separately both match. To search a full name we query each word on
 * its own, merge the results, and keep only players whose name contains
 * every word — giving the AND-style search users expect. */
async function fetchSingleTerm(term: string): Promise<PlayerSearchResult[]> {
  const cached = termCache.get(term);
  if (cached) return cached;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  let html: string;
  try {
    const res = await fetch(SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
      },
      body: `search=${encodeURIComponent(term)}&subSearch=search`,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`tttm.co.il responded with status ${res.status}`);
    }
    html = await res.text();
  } finally {
    clearTimeout(timeout);
  }

  const $ = cheerio.load(html);
  const results: PlayerSearchResult[] = [];

  $("table.miniRank tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 5) return;

    const link = $(cells[2]).find("a");
    const href = link.attr("href") ?? "";
    const idMatch = href.match(/\/p\/(\d+)\//);
    if (!idMatch) return;

    const name = link.text().trim();
    const club = $(cells[3]).text().trim();
    const ratingText = $(cells[4]).text().trim();
    const ratingMatch = ratingText.match(/-?\d+/);
    const rating = ratingMatch ? parseInt(ratingMatch[0], 10) : 0;

    if (!name) return;

    results.push({ id: idMatch[1], name, club, rating });
  });

  termCache.set(term, results);
  return results;
}

export async function searchPlayers(query: string): Promise<PlayerSearchResult[]> {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) {
    return fetchSingleTerm(words[0] ?? "");
  }

  const perWordResults = await Promise.all(words.map((w) => fetchSingleTerm(w)));
  const merged = new Map<string, PlayerSearchResult>();
  for (const list of perWordResults) {
    for (const r of list) merged.set(r.id, r);
  }

  return Array.from(merged.values()).filter((r) => words.every((w) => r.name.includes(w)));
}
