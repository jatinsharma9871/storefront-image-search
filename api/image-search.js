
import fs from 'fs';
import path from 'path';
let vectors = null;
function loadVectors() {
  if (!vectors) {
    let data;
    try {
      data = fs.readFileSync(path.resolve('./api/vectors.json'), 'utf8');
    } catch (e) {
      // Fall back to repo root vectors.json
      data = fs.readFileSync(path.resolve('./vectors.json'), 'utf8');
    }
    vectors = JSON.parse(data);
  }
  return vectors;
}

function cosine(a,b){ return a.reduce((s,v,i)=>s+v*b[i],0); }

let extractor;
async function ensureExtractor() {
  if (extractor) return;

  // Allow fast MOCK mode for CI/tests so we don't download models
  if (process.env.MOCK === '1') {
    extractor = async (input, opts = {}) => {
      const dim = parseInt(process.env.EMBED_DIM || '512', 10);
      // deterministic zero vector (sufficient for smoke tests)
      const vec = new Float32Array(dim);
      return { data: vec };
    };
    return;
  }

  // Use CLIP vision model + processor to handle base64 image buffers
  const { AutoProcessor, CLIPVisionModelWithProjection, RawImage } = await import('@xenova/transformers');
  const processor = await AutoProcessor.from_pretrained('Xenova/clip-vit-base-patch32');
  const visionModel = await CLIPVisionModelWithProjection.from_pretrained('Xenova/clip-vit-base-patch32');

  // extractor accepts Buffer (base64 decoded), URL (string), or RawImage instance
  extractor = async (input, opts = {}) => {
    let rawImage = null;

    if (typeof input === 'string') {
      // Treat as URL
      rawImage = await RawImage.read(input);
    } else if (Buffer.isBuffer(input)) {
      // Decode buffer to raw pixels using Jimp
      const jimpMod = await import('jimp').catch(e => { throw e; });
      const Jimp = jimpMod?.default ?? jimpMod?.Jimp ?? jimpMod;
      const img = await Jimp.read(input);
      const data = new Uint8ClampedArray(img.bitmap.data.buffer);
      // Jimp provides RGBA data (4 channels)
      rawImage = new RawImage(data, img.bitmap.width, img.bitmap.height, 4);
    } else if (input instanceof RawImage) {
      rawImage = input;
    } else if (input && input.image && Buffer.isBuffer(input.image)) {
      const jimpMod = await import('jimp').catch(e => { throw e; });
      const Jimp = jimpMod?.default ?? jimpMod?.Jimp ?? jimpMod;
      const img = await Jimp.read(input.image);
      const data = new Uint8ClampedArray(img.bitmap.data.buffer);
      rawImage = new RawImage(data, img.bitmap.width, img.bitmap.height, 4);
    } else if (input && typeof input === 'object' && typeof input.image === 'string') {
      rawImage = await RawImage.read(input.image);
    } else {
      throw new Error('Unsupported input type for CLIP extractor');
    }

    const imageInputs = await processor(rawImage);
    const outputs = await visionModel(imageInputs);
    const tensor = outputs.image_embeds ?? outputs.pooler_output ?? outputs.last_hidden_state;
    let result = tensor;
    if (opts.normalize) result = result.normalize(2, -1);
    return { data: result.data };
  };
}

export default async function handler(req,res){
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  if(req.method==="OPTIONS") return res.status(200).end();

  if(req.method!=="POST") return res.status(405).end();

  // Validate input
  if(!req.body || !req.body.image) return res.status(400).json({error:'Missing base64 image in body.image'});

  await ensureExtractor();

  const img = Buffer.from(req.body.image, 'base64');
  // Important: pass as image object to avoid tokenizer treating as text
  let q;
  try {
    q = await extractor({ image: img }, { pooling: 'mean', normalize: true });
  } catch (err) {
    console.error('Extractor failed:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'embedder error', detail: err && err.message ? err.message : String(err) });
  }

  const vecs = loadVectors();
  const ranked = vecs.map(v=>({ id:v.id, score: cosine(q.data, v.embedding) })).sort((a,b)=>b.score-a.score);

  res.json({ products: ranked.slice(0,24).map(r=>r.id) });
}
