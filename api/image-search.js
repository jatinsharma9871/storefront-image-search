import fs from "fs";
import path from "path";
import formidable from "formidable";
import { fileURLToPath } from "url";
import { pipeline } from "@xenova/transformers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load vectors
const vectors = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "vectors.json"), "utf8")
);

// Load CLIP ONCE
let extractor;
async function getExtractor() {
  if (!extractor) {
    console.log("Loading CLIP model...");
    extractor = await pipeline(
      "feature-extraction",
      "Xenova/clip-vit-base-patch32"
    );
    console.log("CLIP loaded");
  }
  return extractor;
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function parseForm(req) {
  const form = formidable({ multiples: false });
  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method === "GET") {
    return res.json({ ok: true });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { files } = await parseForm(req);
    if (!files.image) {
      return res.status(400).json({ error: "No image uploaded" });
    }

    const imageBuffer = fs.readFileSync(files.image.filepath);

    const extractor = await getExtractor();
    const query = await extractor(imageBuffer, {
      pooling: "mean",
      normalize: true
    });

    const qv = Array.from(query.data);

    const results = vectors
      .map(v => ({
        handle: v.handle,
        score: cosine(qv, v.embedding)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map(x => x.handle);

    res.json({ success: true, results });

  } catch (err) {
  console.error("SEARCH ERROR FULL:", err);
  res.status(500).json({
    error: "Search failed",
    message: err?.message,
    stack: err?.stack
  });
}
}
