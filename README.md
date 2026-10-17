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

### Install on mobile

The hosted app is installable from supported mobile browsers over HTTPS. In Chrome, use **Install app** when it appears or choose **Install app** from the browser menu. On iPhone or iPad, open the site in Safari and use **Share → Add to Home Screen**. The app shell is cached for offline startup, but sign-in and Supabase-backed content still require a network connection.

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

The Tournament Control workspace requires `202610160001_institutional_tournament_control.sql`. If the portal reports that `public.match_brackets` is missing, confirm that migration is applied to the same project used by the app. If it is listed as applied but PostgREST still reports a schema-cache error, run `NOTIFY pgrst, 'reload schema';` in the Supabase SQL Editor and reload the portal.

Tournament invitations, lifecycle controls, and group qualification also require `202610160002_multi_university_competitions.sql`, `202610170001_competition_lifecycle_and_groups.sql`, and `202610170002_break_team_policy_recursion.sql`. Apply pending migrations in order with `npx supabase db push`. This also repairs a recursive team-registration RLS policy. Then deploy the updated Secretary account-management function with `npx supabase functions deploy manage-secretary`.

### Deploy university invitations

The Sports Secretary invitation and password-reset links must return to the app's `/fotweb/` base path. Configure the hosted Edge Function with the public app URL, add that exact URL to Supabase Auth's allowed redirect URLs, then deploy the function:

```bash
npx supabase secrets set APP_URL=https://ahmad430875-gif.github.io/fotweb/
npx supabase functions deploy manage-secretary
```

For local development, set `APP_URL` to `http://localhost:5173/fotweb/` and add it to the Auth redirect URL allow list. The function falls back to the request host plus `/fotweb/` when `APP_URL` is not set.

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

### Institutional tournament control center

The secretary portal's **Tournament Control** workspace (`/secretary/control-center`) guides secretaries through separate pages for tournament structure, fixtures and bracket progression, squad announcement locks, discipline and player eligibility, and venue and officials. Its schema starts in `supabase/migrations/202610160001_institutional_tournament_control.sql`; the follow-up `supabase/migrations/202610160002_multi_university_competitions.sql` adds organizer invitations, university participation, and cross-university team access. Apply both pending migrations with the Supabase CLI before using the workspace.

Player eligibility is fail-closed until academic enrollment is confirmed. In **Secretary → Players**, set **Academic enrollment** to **Actively enrolled** and record the student's **Batch / session**. The check also requires an active player profile and an unreleased registration for the selected competition, and blocks players with an unserved red-card record. Mark a red-card suspension served from the control center to restore eligibility.

### University competitions and inter-class teams

Each competition belongs to its organizing university. From **Secretary → Leagues & Invitations**, the organizer invites participating universities; each invited university accepts in its own portal and enters its own team. The organizer controls the competition and fixture publication, while each participant controls its permanent player profiles, registrations, and squad announcements.

New competitions start as drafts. Use **Publish competition** in Secretary → Competitions to make one public. In **Tournament Control → Structure**, assign each registered team to a group; schedule and complete or cancel every group fixture. The group tables use points, goal difference, goals scored, then team name as tie-breakers and mark the top four in each group. To seed, every team must have at least one completed group fixture, and all scheduled group fixtures must be complete or cancelled. Select the completed group stage and choose **Qualify top four & seed bracket** to create its first knockout round automatically. One group creates semi-finals; an even number of groups is paired in alphabetical order and cross-seeded (for example, A1 vs B4). Automatic seeding requires at least four teams per group and does not support an odd number of groups greater than one. Public qualification tables appear with published competitions.

Use **End tournament** only when every fixture is complete or cancelled. Ending is permanent: the competition and its tournament records become read-only for everyone. Secretary account emails and active status are visible to Super Admins; passwords are never viewable. Use **Send password reset** to securely restore access or **Change Sports Secretary** to invite a replacement. Public Google Drive image links can be pasted into logo/photo URL fields; the file must be shared so anyone with the link can view it.

Create university squads in **University Team**. For campus sports-week tournaments, create separate **Class Teams** and use an academic-year label matching the players' permanent profiles; the database also enforces this rule when registrations or academic years change. Inter-class competitions accept class teams, while other competition types accept university teams.

Bracket fixtures are synchronized with the existing `matches` records used by public fixtures, results, events, and statistics. The public competition page also shows group standings and qualification places, and displays public image URLs (including publicly shared Google Drive images) as images. Publish an organizer's fixture from **Fixtures & Results** when it is ready to appear on public pages.
