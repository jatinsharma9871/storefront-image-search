import fs from "fs";
import fetch from "node-fetch";

const SHOP = "thesverve.myshopify.com";
const TOKEN = "acda1d5a1d41bc5b8d927f4efd56d9f3";

if (!TOKEN) {
  console.error("❌ Missing SHOPIFY_ADMIN_TOKEN");
  process.exit(1);
}

const QUERY = `
query Products($cursor: String) {
  products(first: 250, after: $cursor) {
    edges {
      node {
        id
        handle
        images(first: 1) {
          edges {
            node {
              url
            }
          }
        }
      }
      cursor
    }
    pageInfo {
      hasNextPage
    }
  }
}
`;

async function run() {
  let products = [];
  let cursor = null;
  let page = 1;

  while (true) {
    console.log(`Fetching page ${page}...`);

    const res = await fetch(`https://${SHOP}/admin/api/2024-01/graphql.json`, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: QUERY,
        variables: { cursor },
      }),
    });

    const json = await res.json();
    const edges = json.data.products.edges;

    for (const e of edges) {
      const img = e.node.images.edges[0]?.node.url;
      if (!img) continue;

      products.push({
        id: e.node.id,
        handle: e.node.handle,
        image: img,
      });
    }

    if (!json.data.products.pageInfo.hasNextPage) break;
    cursor = edges[edges.length - 1].cursor;
    page++;
  }

  fs.writeFileSync("products.json", JSON.stringify(products, null, 2));
  console.log("✅ Done. Total products:", products.length);
}

run();
