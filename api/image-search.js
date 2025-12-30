import fs from "fs";
import path from "path";
import formidable from "formidable";
import { fileURLToPath } from "url";
import { pipeline } from "@xenova/transformers";

/* -------------------- CONFIG -------------------- */

export const runtime = "nodejs";

export const config = {
  api: {
    bodyParser: false,
  },
};

/* -------------------- INIT -------------------- */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const vectors = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "vectors.json"), "utf8")
);

// Lazy-load CLIP (once per cold start)
let extractorPromise = null;
async function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = pipeline(
      "feature-extraction",
      "Xenova/clip-vit-base-patch32"
    );
  }
  return extractorPromise;
}

/* -------------------- UTILS -------------------- */

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

/* -------------------- HANDLER -------------------- */

export default async function handler(req, res) {
  /* CORS FIRST */
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    /* 1️⃣ Parse upload */
    const { files } = await parseForm(req);

    if (!files || !files.image) {
      return res.status(400).json({ error: "No image uploaded" });
    }

    const imageBuffer = fs.readFileSync(files.image.filepath);

    /* 2️⃣ Embed query image */
    const extractor = await getExtractor();
    const query = await extractor(imageBuffer, {
      pooling: "mean",
      normalize: true,
    });

    const qv = Array.from(query.data);

    /* 3️⃣ Similarity search */
    const scored = vectors.map(v => ({
      handle: v.handle,
      score: cosine(qv, v.embedding),
    }));

    scored.sort((a, b) => b.score - a.score);

    /* 4️⃣ Respond */
    return res.status(200).json({
      success: true,
      results: scored.slice(0, 12).map(x => x.handle),
    });

  } catch (err) {
    console.error("IMAGE SEARCH ERROR:", err);
    return res.status(500).json({ error: "Search failed" });
  }
}
