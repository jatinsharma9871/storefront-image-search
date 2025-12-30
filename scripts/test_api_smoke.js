import fetch from 'node-fetch';
// Run in MOCK mode to avoid downloading models in CI
process.env.MOCK = '1';
import handler from '../api/image-search.js';
import products from '../products.json' assert { type: 'json' };

(async function(){
  const p = products[0];
  console.log('Smoke test using product image:', p.image);
  const res = await fetch(p.image, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if(!res.ok){
    console.error('Failed to fetch product image', res.status);
    process.exit(2);
  }
  const ab = await res.arrayBuffer();
  const buf = Buffer.from(ab);
  const base64 = buf.toString('base64');

  // Create fake req/res
  const req = { method: 'POST', body: { image: base64 } };
  const out = {};
  const resFake = {
    headers: {},
    status(code) { this._status = code; return this; },
    setHeader(k,v){ this.headers[k]=v; },
    json(obj){ out.body = obj; out.status = this._status || 200; },
    end(){ out.status = this._status || 200; }
  };

  await handler(req, resFake);

  if(!out.body || !Array.isArray(out.body.products) || out.body.products.length===0){
    console.error('Smoke test failed: no products returned', out);
    process.exit(2);
  }

  console.log('Smoke test succeeded:', out.body.products.slice(0,5));
  process.exit(0);
})().catch(err => { console.error('Smoke test error:', err); process.exit(3); });
