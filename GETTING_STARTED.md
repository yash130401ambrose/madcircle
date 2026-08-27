# MadCircle — getting this running

## Why login was broken

Partners had placeholder URLs:
- `application_url = https://shopify.dev/apps/default-app-home`
- callback = `/api/auth` (Next.js style)

This Remix app must use **`/auth/callback`**. OAuth could never finish, so you kept seeing the shop login form.

## Local (fixed path)

```bash
cd "/Users/aftab/mad circle"
# quit any old `shopify app dev` with q first
npm run dev
```

This now uses **localhost HTTPS** (`--use-localhost`) instead of a flaky tunnel.

When Ready, press **`p`**.

## Take it live (stable URL — recommended if local still fights you)

1. Create a free [Vercel](https://vercel.com) account
2. In Terminal:

```bash
cd "/Users/aftab/mad circle"
npx vercel login
npx vercel
```

3. Set env vars in Vercel project settings (same as `.env`):
   - `SHOPIFY_API_KEY` = `ad1ab25c51472f6f6f0aeb472128db7c`
   - `SHOPIFY_API_SECRET` = from Partners → MadCircle → Client credentials
   - `SCOPES` = `read_orders,write_orders,read_customers,write_customers,write_discounts,read_products`
   - `SHOPIFY_APP_URL` = your Vercel URL (https://….vercel.app)
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `AFFILIATE_SESSION_SECRET`

4. Put the Vercel URL into `shopify.app.toml` as `application_url` and
   `redirect_urls = [ "https://YOUR.vercel.app/auth/callback" ]`

5. Push config:

```bash
npm run deploy:config
```

6. Install from Admin → Apps → MadCircle

## Supabase

Business data is on Supabase. Shopify **sessions** for local auth use SQLite (`prisma/dev.sqlite`).
