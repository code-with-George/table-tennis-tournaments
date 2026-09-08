import express from "express";
import cors from "cors";
import { searchPlayers } from "./tttmClient.js";

const app = express();
app.use(cors());

app.get("/api/players/search", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) {
    res.json([]);
    return;
  }

  try {
    const results = await searchPlayers(q);
    res.json(results);
  } catch (err) {
    console.error("player search failed:", err);
    res.status(502).json({
      error: "tttm-unavailable",
      message: "לא הצלחנו להתחבר לאתר הדירוגים. אפשר להזין דירוג ידנית.",
    });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(PORT, () => {
  console.log(`server listening on http://localhost:${PORT}`);
});
