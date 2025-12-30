import fetch from 'node-fetch';
import handler from '../api/image-search.js';
import products from '../products.json' assert { type: 'json' };

(async function(){
  const p = products[0];
  console.log('Using product image:', p.image);
  const res = await fetch(p.image, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if(!res.ok) throw new Error('HTTP ' + res.status);
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
    json(obj){ out.body = obj; out.status = this._status || 200; console.log('Response:', out); },
    end(){ out.status = this._status || 200; console.log('Ended', out); }
  };

  await handler(req, resFake);
})();