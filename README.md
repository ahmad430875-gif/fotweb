# Touchline

A responsive football match centre built with React, TypeScript, Vite, Tailwind CSS, and Lucide icons. Match scores, fixtures, league tables, and editorial content use local mock data.

## Getting started

```sh
npm install
npm run dev
```

## Checks

```sh
npm run build
npm run lint
```

---

## Local development & Supabase setup (added)

This project uses Supabase for Auth and the application data. The repository includes a local Supabase configuration in `supabase/` and the frontend reads the public project values from environment variables. The app now includes stricter validation for these vars and will refuse placeholder values.

1) Copy the example env and set real values

From the repository root:

```bash
cp .env.example .env
```

Edit `.env` and set your real Supabase project values (example):

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

Important:
- Do NOT leave the placeholder value `your-local-supabase-anon-key` or other obvious placeholders like `changeme` or `replace-me`.
- The app validates that `VITE_SUPABASE_URL` is a valid `http:` or `https:` URL and that `VITE_SUPABASE_ANON_KEY` is not a placeholder.

2) Install dependencies

```bash
npm install
```

3) Start the dev server

```bash
npm run dev
```

Open the Vite URL (usually `http://localhost:5173`). Public pages should load. If the Supabase env vars are missing or invalid, the app will show a clear error or guidance telling you which values are missing/invalid.

4) Optional — run Supabase locally (end-to-end)

The repo contains `supabase/config.toml`, `supabase/migrations/` and `supabase/functions/`. To run Supabase locally (recommended if you want full backend behavior):

```bash
npm run db:start
```

If you need TypeScript types for the local DB schema:

```bash
npm run db:types
```

5) Build/time checks

```bash
npm run build
npm run preview
```

6) Troubleshooting tips

- If you see a message that "Supabase is not configured", check `.env` for `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` and ensure they are non-empty and not placeholder values.
- If the URL looks wrong, ensure it starts with `http://` or `https://` and points to your Supabase project or local Supabase instance (the example `.env.example` uses `http://127.0.0.1:54321` for local emulation).
- If auth operations fail, verify the Supabase project has Auth enabled and that the anon key matches the project's API keys.

---

(If you want, I can also add a short config-warning banner to the admin login UI to display missing/invalid env diagnostics.)
