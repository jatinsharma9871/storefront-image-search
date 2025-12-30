import express from "express";
import cors from "cors";
import imageSearch from "./api/image-search.js";

const app = express();

// Shopify-safe CORS
app.use(cors({
  origin: "*",
  methods: ["POST", "GET", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

// Health check
app.get("/", (_, res) => {
  res.json({ ok: true, service: "image-search" });
});

// Image search endpoint
app.all("/api/image-search", async (req, res) => {
  await imageSearch(req, res);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Railway server running on port ${PORT}`);
});
