import fs from "fs";
import path from "path";
import formidable from "formidable";
import { fileURLToPath } from "url";

export const runtime = "nodejs";

export const config = {
  api: {
    bodyParser: false,
  },
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const vectorsPath = path.join(process.cwd(), "vectors.json");
const VECTORS = JSON.parse(fs.readFileSync(vectorsPath, "utf8"));

export default function handler(req, res) {
  // 🔑 CORS FIRST
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  // Preflight
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  // 🔎 DEBUG (Vercel only)
  console.log("REQ METHOD:", req.method);

  // 🔥 TEMP: allow GET to confirm routing
  if (req.method === "GET") {
    return res.status(200).json({
      success: true,
      note: "GET request reached API correctly",
      results: VECTORS.slice(0, 5).map(v => v.id),
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const form = formidable({ multiples: false });

  form.parse(req, (err, fields, files) => {
    if (err) {
      console.error("Form error:", err);
      return res.status(400).json({ error: "Invalid form data" });
    }

    if (!files.image) {
      return res.status(400).json({ error: "No image uploaded" });
    }

    // ✅ API confirmed working
    return res.status(200).json({
      success: true,
      results: VECTORS.slice(0, 12).map(v => v.id),
    });
  });
}
