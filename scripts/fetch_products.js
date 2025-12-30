import fs from "fs";
import fetch from "node-fetch";

// Read config from env, fallback to constants for backwards compatibility
const SHOP = process.env.SHOP || "the-sverve.myshopify.com"; // set SHOP env to your store
const TOKEN = process.env.TOKEN || "acda1d5a1d41bc5b8d927f4efd56d9f3"; // set TOKEN env to your storefront token

let products = [];
let cursor = null;
let hasNext = true;
let page = 1;

const useMock = process.env.MOCK === '1' || process.argv.includes('--mock') || SHOP.includes('CHANGE THIS') || TOKEN.includes('CHANGE THIS');
if (useMock) {
  console.log('MOCK mode: skipping Shopify fetch (use MOCK=0 or set SHOP/TOKEN to enable)');
  // If products.json exists, copy it; otherwise create a tiny sample so downstream steps work
  try {
    const existing = fs.readFileSync('products.json', 'utf8');
    fs.writeFileSync('products.fetched.json', existing);
    console.log('Wrote products.fetched.json from existing products.json');
    process.exit(0);
  } catch (e) {
    const sample = [{ id: 'gid://shopify/Product/000', image: 'https://via.placeholder.com/600' }];
    fs.writeFileSync('products.fetched.json', JSON.stringify(sample, null, 2));
    console.log('Wrote sample products.fetched.json');
    process.exit(0);
  }
}

console.log("Fetching product images from Shopify...");

const MAX_PAGES = parseInt(process.env.MAX_PAGES || '200', 10);
while (hasNext && page <= MAX_PAGES) {
  console.log(`Fetching page ${page}...`);

  // Only include the `after` argument when we have a cursor
  const afterArg = cursor ? `, after: "${cursor}"` : '';
  const query = `
  {
    products(first: 250${afterArg}) {
      edges {
        cursor
        node {
          id
          images(first: 5) {
            edges {
              node {
                url
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
      }
    }
  }`;

  // Support Admin API when ADMIN_TOKEN is provided (useful when only admin token is available)
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
  const useAdmin = !!ADMIN_TOKEN && (process.env.USE_ADMIN !== '0');
  const endpoint = useAdmin ? `https://${SHOP}/admin/api/2024-01/graphql.json` : `https://${SHOP}/api/2024-01/graphql.json`;
  const headers = useAdmin
    ? { "Content-Type": "application/json", "X-Shopify-Access-Token": ADMIN_TOKEN }
    : { "Content-Type": "application/json", "X-Shopify-Storefront-Access-Token": TOKEN };

  console.log('Querying Shopify', useAdmin ? 'Admin API' : 'Storefront API', 'endpoint=', endpoint);

  // Retry logic to handle transient network errors (ETIMEDOUT etc.)
  const maxAttempts = 3;
  let attempt = 0;
  let res = null;
  while (attempt < maxAttempts) {
    attempt++;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ query }),
        // node-fetch fallback timeout options could be used, but keep default here
      });
    } catch (err) {
      console.error(`Network error (attempt ${attempt}/${maxAttempts}):`, err && err.message ? err.message : err);
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        continue;
      }
      console.error('Exceeded max fetch attempts — aborting');
      process.exit(1);
    }

    if (!res.ok) {
      // Retry on 5xx server errors
      if (res.status >= 500 && attempt < maxAttempts) {
        console.error(`Shopify server error (attempt ${attempt}):`, res.status, res.statusText);
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        continue;
      }
      console.error('Shopify HTTP error:', res.status, res.statusText);
      process.exit(1);
    }

    break; // success
  }

  const json = await res.json();

  // 🔴 CRITICAL: handle errors safely
  if (json.errors) {
    console.error("❌ Shopify GraphQL errors:");
    console.error(JSON.stringify(json.errors, null, 2));
    process.exit(1);
  }

  if (!json.data || !json.data.products) {
    console.error("❌ Invalid Shopify response:");
    console.error(JSON.stringify(json, null, 2));
    process.exit(1);
  }

  const edges = json.data.products?.edges ?? [];

  if (!edges.length) {
    console.log('No edges returned on page', page, '- stopping');
    break;
  }

  for (const edge of edges) {
    const id = edge?.node?.id;
    const images = edge?.node?.images?.edges ?? [];
    for (const img of images) {
      // Admin API uses `src` / `originalSrc`; storefront uses `url`.
      const node = img?.node || {};
      const url = node.url ?? node.src ?? node.originalSrc;
      if (!url) continue;

      // Only index real product images
      if (!url.includes("/products/")) continue;

      products.push({ id, image: url });
    }
  }

  hasNext = !!json.data.products?.pageInfo?.hasNextPage;
  cursor = edges.length ? edges[edges.length - 1].cursor : null;
  page++;
}

// Write to a fetched file to avoid clobbering a hand-maintained list
fs.writeFileSync("products.fetched.json", JSON.stringify(products, null, 2));

console.log("✅ Done");
console.log("Total product images:", products.length);
