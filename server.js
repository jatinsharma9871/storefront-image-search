import express from "express";
import cors from "cors";
import imageSearch from "./api/image-search.js";
import { pipeline } from "@xenova/transformers";

const app = express();

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

/* 🔥 PRELOAD CLIP AT BOOT */
(async () => {
  console.log("🔥 Preloading CLIP model...");
  await pipeline("feature-extraction", "Xenova/clip-vit-base-patch32");
  console.log("✅ CLIP preloaded");
})();

app.get("/", (_, res) => {
  res.json({ ok: true, service: "image-search" });
});

app.all("/api/image-search", async (req, res) => {
  await imageSearch(req, res);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
