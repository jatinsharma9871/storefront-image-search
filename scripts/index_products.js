import fs from "fs";
import fetch from "node-fetch";
import { pipeline } from "@xenova/transformers";

const MODEL = "Xenova/clip-vit-base-patch32";

const PRODUCTS = JSON.parse(fs.readFileSync("products.json", "utf8"));
console.log(`Loaded ${PRODUCTS.length} products`);

console.log("Loading CLIP...");
const extractor = await pipeline("feature-extraction", MODEL);
console.log("Model loaded");

function toPublicImage(url) {
  const clean = url.split("?")[0];
  const match = clean.match(/\/products\/(.+)$/);
  if (!match) return null;
  return `https://thesverve.com/cdn/shop/products/${match[1]}`;
}

async function fetchImage(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) throw new Error("Fetch failed");
  return Buffer.from(await res.arrayBuffer());
}

let vectors = [];
let indexed = 0;
let failed = 0;

for (let i = 0; i < PRODUCTS.length; i++) {
  const p = PRODUCTS[i];
  try {
    const imgUrl = toPublicImage(p.image);
    if (!imgUrl) throw new Error("Invalid image");

    const buffer = await fetchImage(imgUrl);
    const emb = await extractor(buffer, {
      pooling: "mean",
      normalize: true,
    });

    vectors.push({
      handle: p.handle,
      embedding: Array.from(emb.data),
    });

    indexed++;
    if (indexed % 50 === 0) {
      console.log(`Indexed ${indexed}/${PRODUCTS.length}`);
    }
  } catch {
    failed++;
  }
}

fs.writeFileSync("vectors.json", JSON.stringify(vectors));
console.log("✅ INDEXING COMPLETE");
console.log("Indexed:", indexed);
console.log("Failed:", failed);
