export interface TttmSearchResult {
  id: string;
  name: string;
  club: string;
  rating: number;
}

export class TttmUnavailableError extends Error {}

export async function searchTttmPlayers(query: string): Promise<TttmSearchResult[]> {
  const res = await fetch(`/api/players/search?q=${encodeURIComponent(query)}`);
  if (res.status === 502) {
    throw new TttmUnavailableError("tttm.co.il unavailable");
  }
  if (!res.ok) {
    throw new Error(`search failed: ${res.status}`);
  }
  return res.json();
}
