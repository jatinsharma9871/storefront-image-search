import fs from "fs";
import path from "path";
import formidable from "formidable";
import { fileURLToPath } from "url";
import { pipeline } from "@xenova/transformers";

/**
 * Force Node runtime (important for CLIP)
 */
export const runtime = "nodejs";

/**
 * Disable body parser (multipart upload)
 */
export const config = {
  api: {
    bodyParser: false,
  },
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load vectors once (cold start)
 */
const vectors = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "vectors.json"), "utf8")
);

/**
 * Load CLIP once (cold start)
 */
let extractorPromise;
function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = pipeline(
      "feature-extraction",
      "Xenova/clip-vit-base-patch32"
    );
  }
  return extractorPromise;
}

/**
 * Cosine similarity
 */
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export default async function handler(req, res) {
  /**
   * CORS (Shopify-safe)
   */
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  /**
   * Parse multipart form
   */
  const form = formidable({ multiples: false });

  form.parse(req, async (err, fields, files) => {
    try {
      if (err || !files.image) {
        return res.status(400).json({ error: "Invalid upload" });
      }

      const imageBuffer = fs.readFileSync(files.image.filepath);

      /**
       * 1️⃣ Embed uploaded image
       */
      const extractor = await getExtractor();
      const queryEmbedding = await extractor(imageBuffer, {
        pooling: "mean",
        normalize: true,
      });

      const queryVector = Array.from(queryEmbedding.data);

      /**
       * 2️⃣ Compute similarity
       */
      const scored = vectors.map(v => ({
        handle: v.handle,
        score: cosine(queryVector, v.embedding),
      }));

      /**
       * 3️⃣ Sort & pick top results
       */
      scored.sort((a, b) => b.score - a.score);

      const topHandles = scored
        .slice(0, 12)
        .map(x => x.handle);

      /**
       * 4️⃣ Respond
       */
      res.status(200).json({
        success: true,
        results: topHandles,
      });

    } catch (e) {
      console.error("Search error:", e);
      res.status(500).json({ error: "Search failed" });
    }
  });
}
