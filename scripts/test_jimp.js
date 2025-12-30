import fetch from 'node-fetch';

const URL = process.argv[2] || 'https://cdn.shopify.com/s/files/1/0568/6824/1501/files/MN0015YG_a.jpg?v=1761885190';

console.log('Testing URL:', URL);

try {
  const res = await fetch(URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const ab = await res.arrayBuffer();
  const buf = Buffer.from(ab);

  console.log('Buffer size:', buf.length);

  const jimpMod = await import('jimp').catch(e => ({ err: e }));
  console.log('jimp module keys:', Object.keys(jimpMod || {}));
  const Jimp = (jimpMod && jimpMod.Jimp) || (jimpMod && jimpMod.default) || jimpMod;
  console.log('Jimp value type:', typeof Jimp);
  if (!Jimp) throw new Error('Jimp not found');

  try {
    const img = await Jimp.read(buf);
    console.log('Jimp read ok:', img.bitmap.width, 'x', img.bitmap.height);
  } catch (e) {
    console.error('Jimp.read failed:', e);
  }

  // Optionally test transformers — skip by setting SKIP_MODEL=1 in env
  if (!process.env.SKIP_MODEL) {
    try {
      const { pipeline } = await import('@xenova/transformers');
      const extractor = await pipeline('feature-extraction', 'Xenova/clip-vit-base-patch32');
      console.log('Model loaded for quick test');
      try { await extractor(buf); console.log('Variant: raw buffer ok'); } catch (e) { console.error('raw buffer error:', e); }
      try { await extractor(new Uint8Array(ab)); console.log('Variant: Uint8Array ok'); } catch (e) { console.error('Uint8Array error:', e); }
    } catch (e) {
      console.warn('Transformer not available or failed to init:', e && e.message ? e.message : e);
    }
  } else {
    console.log('Skipping transformer checks (SKIP_MODEL=1)');
  }
} catch (err) {
  console.error('Test failed:', err && err.message ? err.message : err);
}
