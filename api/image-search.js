import fs from "fs";
import path from "path";
import formidable from "formidable";
import { fileURLToPath } from "url";

/**
 * 🔑 FORCE NODE RUNTIME (VERY IMPORTANT)
 */
export const runtime = "nodejs";

/**
 * Disable body parser (required for multipart)
 */
export const config = {
  api: {
    bodyParser: false,
  },
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load vectors.json once (cold start)
const vectorsPath = path.join(process.cwd(), "vectors.json");
const VECTORS = JSON.parse(fs.readFileSync(vectorsPath, "utf8"));

export default async function handler(req, res) {
  /**
   * 🔑 CORS HEADERS — MUST BE FIRST
   */
  res.setHeader("Access-Control-Allow-Origin", "https://thesverve.com");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  /**
   * ✅ PRE-FLIGHT (Vercel always sends this)
   */
  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    res.end();
    return;
  }

  /**
   * ✅ ONLY ALLOW POST AFTER OPTIONS
   */
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  /**
   * ✅ PARSE MULTIPART FORM
   */
  const form = formidable({ multiples: false });

  form.parse(req, (err, fields, files) => {
    if (err) {
      console.error("Form parse error:", err);
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "Invalid form data" }));
      return;
    }

    const image = files.image;
    if (!image) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "No image uploaded" }));
      return;
    }

    /**
     * ⚠️ TEMP RESPONSE (API IS NOW VERIFIED)
     * We will plug real similarity next
     */
    const results = VECTORS.slice(0, 12).map(v => v.id);

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        success: true,
        results,
      })
    );
  });
}
