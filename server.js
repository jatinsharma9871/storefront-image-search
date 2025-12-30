import express from "express";
import cors from "cors";
import imageSearch from "./api/image-search.js";

const app = express();

// Allow CORS locally
app.use(cors({
  origin: "*",
  methods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Vercel-style handler wrapper
app.all("/api/image-search", async (req, res) => {
  await imageSearch(req, res);
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`✅ Local API running at http://localhost:${PORT}`);
});
