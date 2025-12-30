import fs from "fs";
import path from "path";
import formidable from "formidable";
import { fileURLToPath } from "url";

export const runtime = "nodejs";
export const config = { api: { bodyParser: false } };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const vectors = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "vectors.json"), "utf8")
);

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const form = formidable({ multiples: false });

  form.parse(req, async (err, fields, files) => {
    if (err || !files.image) {
      return res.status(400).json({ error: "Invalid upload" });
    }

    // TEMP: random similarity placeholder
    // (replace later with query embedding)
    const results = vectors.slice(0, 12).map(v => v.handle);

    res.status(200).json({
      success: true,
      results,
    });
  });
}
