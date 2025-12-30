import fs from "fs";
import path from "path";
import formidable from "formidable";
import { fileURLToPath } from "url";

export const config = {
  api: {
    bodyParser: false,
  },
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load vectors once
const vectorsPath = path.join(process.cwd(), "vectors.json");
const VECTORS = JSON.parse(fs.readFileSync(vectorsPath, "utf8"));

export default async function handler(req, res) {
  /**
   * 🔑 CORS — MUST be FIRST
   */
res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  // Handle preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const form = formidable({ multiples: false });

    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.error("Form parse error:", err);
        return res.status(400).json({ error: "Invalid form data" });
      }

      const image = files.image;
      if (!image) {
        return res.status(400).json({ error: "No image uploaded" });
      }

      /**
       * ⚠️ IMPORTANT
       * We are NOT doing CLIP here yet.
       * Just return a safe response to confirm API works.
       */
      const topResults = VECTORS.slice(0, 12).map(v => v.id);

      return res.status(200).json({
        success: true,
        results: topResults,
      });
    });

  } catch (error) {
    console.error("API ERROR:", error);
    return res.status(500).json({ error: "Server error" });
  }
}
