import type { VercelRequest, VercelResponse } from "@vercel/node";
import { searchPlayers } from "../_lib/tttmClient.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) {
    res.status(200).json([]);
    return;
  }

  try {
    const results = await searchPlayers(q);
    res.status(200).json(results);
  } catch (err) {
    console.error("player search failed:", err);
    res.status(502).json({
      error: "tttm-unavailable",
      message: "לא הצלחנו להתחבר לאתר הדירוגים. אפשר להזין דירוג ידנית.",
    });
  }
}
