# Big Beautiful Umpire App

A React Three Fiber home-plate umpire simulator with two game modes:

- **Solo Ninth** keeps the original deterministic single-player inning and umpire report card.
- **Pitcher vs. Blue** is a realtime two-device role-swap series. One player chooses pitches, targets the 5×5 plate/chase grid, and works a command meter while the other calls taken pitches. Players swap roles for a mirrored second ninth.

## Requirements

- Node.js 22+
- A Cloudflare account for deploying the multiplayer room Worker
- Vercel for the existing static frontend deployment

## Local development

```bash
npm install
npm run dev:multiplayer
```

The Vite client runs at `http://localhost:5175` and the local Durable Object Worker runs at `http://localhost:8787`. The client automatically uses the local Worker on localhost.

Useful checks:

```bash
npm test
npm run test:worker
npm run test:e2e
npm run build
```

The end-to-end test launches isolated desktop and phone browser contexts and runs an accelerated complete two-round series.

## Deployment

Authenticate and deploy the room Worker:

```bash
npx wrangler login
npm run deploy:worker
```

Copy the resulting `https://…workers.dev` origin into the Vercel build environment as `VITE_MULTIPLAYER_ORIGIN` for Development, Preview, and Production. Because this is a Vite variable, redeploy the frontend after changing it.

```bash
npx vercel@latest link --yes --project big-beautiful-umpire-app --scope davisdeatonphotographys-projects
npx vercel@latest env add VITE_MULTIPLAYER_ORIGIN production
npx vercel@latest env add VITE_MULTIPLAYER_ORIGIN preview
npx vercel@latest env add VITE_MULTIPLAYER_ORIGIN development
npx vercel@latest --prod
```

Production players only visit the Vercel URL. The browser opens its realtime WebSocket directly to the Worker origin.
