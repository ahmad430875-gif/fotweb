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

## Local development & Supabase setup

This project uses Supabase for Auth and application data. The frontend reads the public project values from environment variables. The app validates these values and rejects placeholder values so setup errors are caught early.

1) Copy the example env and set real values

From the repository root:

```bash
cp .env.example .env
```

Edit `.env` and provide your actual Supabase project values:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

Important:
- Do NOT leave the placeholder value `your-local-supabase-anon-key`.
- Do NOT use placeholders such as `changeme` or `replace-me`.
- The app validates that `VITE_SUPABASE_URL` is a valid `http:` or `https:` URL and that `VITE_SUPABASE_ANON_KEY` is not a placeholder.

2) Install dependencies

```bash
npm install
```

3) Start the dev server

```bash
npm run dev
```

Open the Vite URL (usually `http://localhost:5173`). Public pages should load. If the Supabase env vars are missing or invalid, the app will show a clear error and tell you exactly which values are missing or invalid.

4) Optional — run Supabase locally (end-to-end)

The repo contains `supabase/config.toml`, `supabase/migrations/`, and `supabase/functions/`. To run Supabase locally if you want full backend behavior:

```bash
npm run db:start
```

If you need TypeScript types for the local schema:

```bash
npm run db:types
```

### Apply database migrations to a hosted Supabase project

Player, team, and competition saves require the database schema and access policies in this repository's migrations. From the repository root, use the Supabase CLI to apply migrations that are pending for the linked project:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase migration list
npx supabase db push
```

Replace `YOUR_PROJECT_REF` with the project reference shown in the Supabase project URL. Review the migration list before pushing. If migrations were previously run manually in the Supabase SQL Editor, do not blindly run the SQL files again or push untracked migrations; first reconcile the project's migration history with the database.

5) Build and preview checks

```bash
npm run build
npm run preview
```

6) Troubleshooting tips

- If you see a message that "Supabase is not configured", check `.env` for `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` and ensure they are non-empty and not placeholder values.
- If the URL looks wrong, ensure it starts with `http://` or `https://` and points to your Supabase project or local Supabase instance.
- If auth operations fail, verify the Supabase project has Auth enabled and that the anon key matches the project's API keys.

---

This repository also includes a set of admin and secretary pages gated by role-based access controls, so a valid Supabase session and user profile are required for those flows to work properly.
