import { searchPlayers } from "../_lib/tttmClient.js";

// tttm.co.il blocks Vercel's regional Node serverless IP range with a 403.
// The Edge runtime routes through Vercel's edge network instead, which uses
// a different egress path that isn't blocked.
export const config = { runtime: "edge" };

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return json([], 200);
  }

  try {
    const results = await searchPlayers(q);
    return json(results, 200);
  } catch (err) {
    console.error("player search failed:", err);
    return json(
      {
        error: "tttm-unavailable",
        message: "לא הצלחנו להתחבר לאתר הדירוגים. אפשר להזין דירוג ידנית.",
      },
      502
    );
  }
}
