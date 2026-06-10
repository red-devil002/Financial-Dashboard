# Frontend — Finance Dashboard

React + Vite + Tailwind single-page app. See the [root README](../README.md) for
full setup; this covers frontend-specific details.

## Run

```bash
npm install
npm run dev        # http://localhost:5173 (proxies /api → :3001)
npm run build      # production build → dist/
npm run preview    # preview the production build
```

## Environment

Create `.env` from `.env.example`:

- `VITE_API_URL` — leave **blank** in development (the Vite proxy handles `/api`).
  For a deployed frontend, set it to your backend's API URL,
  e.g. `https://api.example.com/api`.

## Conventions

- **Styling**: Tailwind utility classes + a few component classes defined in
  `src/index.css` (`.card`, `.btn`, `.input`, …). Design tokens (colors, radius,
  font) are in `tailwind.config.js`.
- **Data fetching**: only through `src/api/`. Components import the relevant
  `*Api` object from `endpoints.js`.
- **Money formatting**: always use `fmt()` from `src/lib/format.js` (2 dp, no
  abbreviation).
- **Responsiveness**: the `Layout` switches between a desktop sidebar and a
  mobile bottom nav; tables collapse to cards on small screens. Test at ~375px
  and ~1280px widths.
- **State after mutations**: call `triggerRefresh()` from `useApp()` so pages
  reload their data.
