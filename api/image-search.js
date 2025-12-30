import fs from "fs";
import path from "path";
import formidable from "formidable";
import { fileURLToPath } from "url";

/**
 * Disable default body parser
 */
export const config = {
  api: {
    bodyParser: false,
  },
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load vectors ONCE
const vectorsPath = path.join(process.cwd(), "vectors.json");
const VECTORS = JSON.parse(fs.readFileSync(vectorsPath, "utf8"));

/**
 * Cosine similarity
 */
function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export default async function handler(req, res) {
  try {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // Parse multipart form
    const form = formidable({ multiples: false });

    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.error("Form parse error:", err);
        return res.status(400).json({ error: "Invalid form data" });
      }

      const imageFile = files.image;
      if (!imageFile) {
        return res.status(400).json({ error: "No image uploaded" });
      }

      /**
       * ⚠️ IMPORTANT
       * We DO NOT compute CLIP here.
       * Frontend sends image ONLY to get nearest matches.
       * For demo, we return top products directly.
       */

      // TEMP: return top-N products (replace with real search later)
      const top = VECTORS.slice(0, 12).map(v => v.id);

      return res.status(200).json({
        success: true,
        results: top,
      });
    });

  } catch (error) {
    console.error("API ERROR:", error);
    return res.status(500).json({ error: "Server error" });
  }
}
