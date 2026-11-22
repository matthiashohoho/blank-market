# Blank Market

A hidden-rule stock trading game. Phones are the trading terminals, a TV shows the market.

## Deploy to Vercel (about 5 minutes)

1. Install the Vercel CLI and sign in:
       npm i -g vercel
       vercel login
2. In this folder, deploy:
       vercel deploy --prod
   Accept the defaults (no framework, no build command).
3. Add the database: Vercel dashboard → your `blank-market` project → Storage →
   Create → **Upstash for Redis** (free plan) → Connect to the project.
   This adds the KV_REST_API_URL / KV_REST_API_TOKEN variables.
4. Redeploy so the new variables apply:
       vercel deploy --prod

## Play
- Host: open the site, enter your name, pick length and round time, Create game.
- Players: open the site on their phones and join with the four-letter code (or scan the QR code on the TV).
- TV: open `https://<your-site>/?tv=CODE` on the TV or a laptop plugged into it.

## Local test (no database needed)
    node dev.js .      # then open http://localhost:3456
