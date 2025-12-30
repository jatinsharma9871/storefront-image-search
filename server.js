import express from "express";
import cors from "cors";
import imageSearch from "./api/image-search.js";

const app = express();

// CORS (local only)
app.use(cors({
  origin: "*",
  methods: ["POST", "OPTIONS"],
}));

// Preflight
app.options("/api/image-search", (req, res) => {
  res.sendStatus(200);
});

// POST ONLY
app.post("/api/image-search", async (req, res) => {
  await imageSearch(req, res);
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`✅ Local API running at http://localhost:${PORT}`);
});
