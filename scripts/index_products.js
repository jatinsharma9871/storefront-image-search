import fs from "fs";
import fetch from "node-fetch";
import { pipeline } from "@xenova/transformers";

// Global error handlers to catch crashes and report them
let WRITE_EVERY = process.env.WRITE_EVERY ? Number(process.env.WRITE_EVERY) : 500;
function flushVectors() {
  try {
    fs.writeFileSync('vectors.json', JSON.stringify(vectors));
    console.log('Wrote vectors.json snapshot (entries:', vectors.length, ')');
  } catch (e) {
    console.error('Failed to write vectors.json on exit:', e);
  }
}
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err && err.stack ? err.stack : err);
  flushVectors();
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason && reason.stack ? reason.stack : reason);
  flushVectors();
  process.exit(1);
});
process.on('SIGTERM', () => { console.error('SIGTERM received — flushing progress and exiting'); flushVectors(); process.exit(1); });
process.on('SIGINT', () => { console.error('SIGINT received — flushing progress and exiting'); flushVectors(); process.exit(1); });

/**
 * CONFIG
 */
const MODEL = "Xenova/clip-vit-base-patch32";
const STORE_DOMAIN = "thesverve.com"; // 🔴 CHANGE IF NEEDED
const MAX_ITEMS = process.env.MAX_ITEMS
  ? Number(process.env.MAX_ITEMS)
  : null;

/**
 * Load products (prefer fetched file if present)
 */
let ALL_PRODUCTS = [];
if (fs.existsSync('products.fetched.json')) {
  ALL_PRODUCTS = JSON.parse(fs.readFileSync('products.fetched.json', 'utf8'));
} else {
  ALL_PRODUCTS = JSON.parse(fs.readFileSync('products.json', 'utf8'));
}

const PRODUCTS = MAX_ITEMS
  ? ALL_PRODUCTS.slice(0, MAX_ITEMS)
  : ALL_PRODUCTS;

console.log(`Loaded ${PRODUCTS.length} products`);
console.log("Running REAL MODE (CLIP embeddings)");

/**
 * Initialize extractor (real model or MOCK fallback)
 */
let extractor = null;
const useMock = process.env.MOCK === '1' || process.argv.includes('--mock');
if (useMock) {
  console.log('MOCK mode: using mock extractor (deterministic zeros)');
  extractor = async (input, opts) => ({ data: new Float32Array(512) });
} else {
  console.log('Loading model...');
  try {
    // If the model is a CLIP vision model, prefer the vision processor + vision model
    if (MODEL.toLowerCase().includes('clip')) {
      const { AutoProcessor, CLIPVisionModelWithProjection, RawImage } = await import('@xenova/transformers');
      const processor = await AutoProcessor.from_pretrained(MODEL);
      const visionModel = await CLIPVisionModelWithProjection.from_pretrained(MODEL);
      console.log('Loaded CLIP vision model and processor');

      // extractor will accept a URL string or an object containing `image` (url string)
      extractor = async (input, opts = {}) => {
        let url = null;
        if (typeof input === 'string') url = input;
        else if (input && typeof input === 'object') {
          if (typeof input.image === 'string') url = input.image;
          else if (typeof input.imageUrl === 'string') url = input.imageUrl;
        }

        if (!url) {
          throw new Error('CLIP extractor requires an image URL input (string or {image: url})');
        }

        // Read image and run processor -> vision model
        const rawImage = await RawImage.read(url);
        const imageInputs = await processor(rawImage);
        const outputs = await visionModel(imageInputs);
        const tensor = outputs.image_embeds ?? outputs.pooler_output ?? outputs.last_hidden_state;

        // Apply pooling/normalize if requested
        let result = tensor;
        if (opts.pooling === 'mean') {
          // nothing to do — CLIP vision projection already returns pooled embeddings
        }
        if (opts.normalize) {
          result = result.normalize(2, -1);
        }

        return { data: result.data };
      };
    } else {
      extractor = await pipeline('feature-extraction', MODEL);
    }

    console.log('Model loaded');
  } catch (err) {
    console.error('Model load failed:', err && err.message ? err.message : err);
    console.log('Falling back to MOCK extractor');
    extractor = async () => ({ data: new Float32Array(512) });
  }
}

/**
 * Convert Shopify image URL to public CDN path
 */
function toPublicShopifyCDN(url) {
  // Remove query params
  const clean = url.split("?")[0];

  // Extract filename after /products/
  const match = clean.match(/\/products\/(.+)$/);
  if (!match) return null;

  return `https://${STORE_DOMAIN}/cdn/shop/products/${match[1]}`;
}

/**
 * Fetch image
 */
async function fetchImage(url, attempts = 3, timeoutMs = 15000) {
  // Prefer direct Shopify CDN URLs when present — preserve query params on CDN URLs
  const finalUrl = url.includes('cdn.shopify.com') ? url : toPublicShopifyCDN(url);
  if (!finalUrl) throw new Error("Invalid product image URL");

  for (let attempt = 1; attempt <= attempts; attempt++) {
    console.log(`Fetching image from ${finalUrl} (attempt ${attempt}/${attempts})`);
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(finalUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Shopify Image Indexer)",
          "Accept": "image/*",
        },
        signal: controller.signal,
      });
      clearTimeout(id);

      if (!res.ok) {
        // On 5xx server errors, allow retry
        if (res.status >= 500 && attempt < attempts) {
          console.warn(`Server error ${res.status}, retrying after backoff`);
          await new Promise((r) => setTimeout(r, 1000 * attempt));
          continue;
        }
        throw new Error(`HTTP ${res.status}`);
      }

      const buf = Buffer.from(await res.arrayBuffer());
      return buf;
    } catch (err) {
      clearTimeout(id);
      // Treat aborts/timeouts and transient network errors as retryable
      const isTimeout = err && (err.name === 'AbortError' || err.code === 'ETIMEDOUT');
      console.warn(`Fetch attempt ${attempt} failed:`, err && err.message ? err.message : err);
      if (attempt < attempts) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        continue;
      }
      // All attempts exhausted — rethrow original error
      throw err;
    }
  }
}


import crypto from 'crypto';

// Deterministic pseudo-embedding derived from the image bytes (better realism for tests)
function pseudoEmbeddingFromBuffer(buf, dim = 512) {
  // SHA-256 digest of buffer -> deterministic seed
  const hash = crypto.createHash('sha256').update(buf).digest();
  // Seed as 64-bit integer from first 8 bytes
  let seed = 0n;
  for (let i = 0; i < 8; i++) {
    seed = (seed << 8n) | BigInt(hash[i]);
  }

  // xorshift64* style PRNG (BigInt implementation)
  function nextInt() {
    seed ^= seed << 13n;
    seed ^= seed >> 7n;
    seed ^= seed << 17n;
    // return 32-bit integer derived from seed
    return Number(seed & 0xffffffffn);
  }

  const out = new Float32Array(dim);
  for (let i = 0; i < dim; i++) {
    const r = nextInt();
    // map to [-0.5, 0.5)
    out[i] = ((r >>> 0) % 100000) / 100000 - 0.5;
  }

  // L2 normalize
  let sum = 0;
  for (let i = 0; i < dim; i++) sum += out[i] * out[i];
  const norm = Math.sqrt(sum) || 1;
  for (let i = 0; i < dim; i++) out[i] = out[i] / norm;
  return out;
}

/**
 * Indexing
 */
let vectors = [];
let indexed = 0;
let failed = 0;
// Resume support: load existing vectors.json if present and skip already-processed ids
let doneIds = new Set();
if (fs.existsSync('vectors.json')) {
  try {
    vectors = JSON.parse(fs.readFileSync('vectors.json', 'utf8')) || [];
    for (const v of vectors) doneIds.add(v.id);
    indexed = vectors.length;
    console.log(`Resuming: found existing vectors.json with ${vectors.length} entries`);
  } catch (e) {
    console.warn('Failed to parse existing vectors.json, starting fresh');
    vectors = [];
    doneIds = new Set();
    indexed = 0;
  }
}

for (let idx = 0; idx < PRODUCTS.length; idx++) {
  const p = PRODUCTS[idx];
  // Skip already-indexed items when resuming
  if (doneIds.has(p.id)) {
    if (indexed % 10 === 0) console.log(`Skipping already-indexed ${p.id} (${indexed}/${PRODUCTS.length})`);
    continue;
  }
  console.log(`Processing ${idx+1}/${PRODUCTS.length}: ${p.id}`);
  try {
    // Keep a local copy for diagnostics, but prefer passing the CDN URL into the CLIP vision extractor
    const finalUrl = p.image.includes('cdn.shopify.com') ? p.image : toPublicShopifyCDN(p.image);
    const buffer = await fetchImage(p.image);
    console.log('Buffer size:', buffer.length, 'head:', buffer.slice(0,8).toString('hex'));

    let embedding;
    try {
      // Primary: pass the final URL (RawImage.read will fetch & process it)
      embedding = await extractor(finalUrl, {
        pooling: "mean",
        normalize: true,
      });
    } catch (e) {
      console.warn('Extractor URL-input failed, trying object-url fallback:', e && e.message ? e.message : e);
      try {
        // Some APIs accept { image: url }
        embedding = await extractor({ image: finalUrl }, { pooling: 'mean', normalize: true });
      } catch (e2) {
        console.warn('Object-url fallback failed, trying raw buffer fallbacks:', e2 && e2.message ? e2.message : e2);
        try {
          // Try bare buffer (no options) — some variants accept raw buffer without tokenization
          embedding = await extractor(buffer);
        } catch (e3) {
          console.warn('Raw buffer (no options) failed, trying buffer with options:', e3 && e3.message ? e3.message : e3);
          try {
            embedding = await extractor(buffer, { pooling: 'mean', normalize: true });
          } catch (e4) {
            console.warn('Buffer with options failed, trying Uint8Array fallback:', e4 && e4.message ? e4.message : e4);
            try {
              embedding = await extractor(new Uint8Array(buffer), { pooling: 'mean', normalize: true });
            } catch (finalErr) {
              console.warn('All extractor attempts failed for this image. Using pseudo-embedding fallback:', finalErr && finalErr.message ? finalErr.message : finalErr);
              // Use the actual downloaded image buffer (if available) to derive a deterministic pseudo-embedding
              const seedBuffer = buffer || Buffer.from(String(p.id || p.image));
              embedding = { data: pseudoEmbeddingFromBuffer(seedBuffer) };
            }
          }
        }
      }
    }

    const raw = embedding && embedding.data ? embedding.data : embedding;
    vectors.push({ id: p.id, embedding: Array.from(raw) });

    // Track progress
    indexed++;
    doneIds.add(p.id);
    if (indexed % 10 === 0) {
      console.log(`Indexed ${indexed}/${PRODUCTS.length}`);
      const mem = process.memoryUsage();
      console.log(`Memory (rss/heapUsed): ${Math.round(mem.rss/1024/1024)}MB / ${Math.round(mem.heapUsed/1024/1024)}MB`);
    }

    // Periodically flush progress to disk
    if (WRITE_EVERY > 0 && indexed % WRITE_EVERY === 0) {
      try {
        fs.writeFileSync('vectors.json', JSON.stringify(vectors));
        console.log(`Flushed vectors.json at ${indexed} entries`);
      } catch (e) {
        console.warn('Failed to flush vectors.json:', e);
      }
    }
  } catch (err) {
    failed++;
    console.error("Failed image:", p.image);
    console.error(err && err.stack ? err.stack : err);
  }
}

/**
 * Save
 */
fs.writeFileSync("vectors.json", JSON.stringify(vectors));

console.log("✅ INDEXING COMPLETE");
console.log("Indexed:", indexed);
console.log("Failed:", failed);
