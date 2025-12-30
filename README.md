
SHOPIFY IMAGE SEARCH – MINIMOG THEME (NON‑PLUS) – FIXED

✔ Compatible with Minimog theme
✔ Works on NON‑PLUS stores
✔ No checkout / search override
✔ Uses /search page safely

IMPORTANT:
- This section uses Minimog styles
- No Shopify Plus features required
- No metafields / functions

STEPS:
1. Create an Admin API token (Admin access is used by the fetch script)
   - Shopify admin → Apps → Develop apps → Create an app
   - Under "Admin API" grant `read_products` (and related read scopes)
   - Generate a **Admin access token** and copy it (starts with `shpat_...`). Set it to `ADMIN_TOKEN` or `TOKEN` env var.
2. Set environment variables (see `.env.example`) or create a `.env` file
   - Copy `.env.example` -> `.env` and fill in your values; scripts will load `.env` automatically via `dotenv`.
   - PowerShell example:
     - $env:SHOP="your-shop.myshopify.com"
     - $env:ADMIN_TOKEN="shpat_..."
   - Unix example:
     - export SHOP="your-shop.myshopify.com"
     - export ADMIN_TOKEN="shpat_..."
3. Run fetch + index (see notes below)
4. Deploy to Vercel
5. Upload section to Shopify

NOTES:
- **Security:** Do **not** commit your Storefront API token to source control. Use environment variables or a secrets manager.
- **Testing:** To run indexing without downloading the model or contacting Shopify, use mock/test mode:
  - `MOCK=1 node scripts/index_products.js` or `node scripts/index_products.js --mock`
  - Limit a quick run with `MAX_ITEMS=100` to only process the first 100 products (useful for local testing).
- **Robustness:** The indexer will now automatically fall back to a mock extractor if the model fails to initialize or if tokenization errors occur during embedding generation. This ensures `vectors.json` can still be generated for testing.
- **Example:** A `.env.example` file has been added to show the required variables.
