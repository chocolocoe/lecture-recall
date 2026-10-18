# Local verification and deployment readiness

## Current verification status

The repository has a local Supabase configuration for PostgreSQL 15, Auth,
Storage, and pgTAP. This checkout is not linked to a Supabase project, and no
`.env` is present. At the Phase 5 review, Supabase CLI, Docker, Deno, and `psql`
were unavailable, so migrations, pgTAP, Storage API behavior, and Edge
Functions could not be run. Frontend type checking, lint, and production build
are available through `package.json`.

The database suite contains 40 pgTAP assertions across students, teachers,
administrators, anonymous access, and two classrooms. It checks table RLS,
cross-classroom reads, membership uniqueness and escalation, lesson writes,
contribution review, progress, and attachment metadata. It does not exercise
real Storage objects or HTTP behavior of Edge Functions. See
[`tests/SECURITY_TEST_PLAN.md`](tests/SECURITY_TEST_PLAN.md) and
[`tests/AUTH_TEST_PLAN.md`](tests/AUTH_TEST_PLAN.md) for manual cases.

## Windows local database verification

Requirements: Node.js 20 or newer, npm, and Docker Desktop with its Linux
container engine running. The current project uses Node 24.21.0. Supabase's
CLI can be installed as a project dependency to pin it for repeatable runs:

```powershell
npm install --save-dev supabase
```

If Docker Desktop is missing, download its Windows installer from the official
[Windows installation guide](https://docs.docker.com/desktop/setup/install/windows-install/).
Run the installer in per-user mode, choose the WSL 2 backend, complete any
requested WSL setup/restart, then launch Docker Desktop and wait for its Linux
engine to report ready.

From the repository root, use only the local Supabase project:

```powershell
npx supabase --version
npx supabase start
npx supabase status
npx supabase db reset
npx supabase test db
```

`db reset` recreates the **local** database and reapplies the checked-in,
ordered migrations. Do not use it from a linked project or against remote
data. No project ref is checked in or configured here. The SQL test wraps its
fixtures in a rollback transaction. `supabase start` also starts local Auth,
Storage, and the Edge Runtime; use the API URL and anon/publishable key printed
by `supabase status` for local browser configuration.

To run the Edge Functions locally, create the ignored file
`supabase/functions/.env` with `APP_SITE_URL=http://localhost:5173` and run:

```powershell
npx supabase functions serve
```

The project config disables public Auth signup. For local invite emails, use
the Supabase local email testing UI (Mailpit) and only fixture accounts. Do
not configure production credentials in local files.

To check Edge Function TypeScript without the local runtime, install Deno using
the official [Windows installation instructions](https://docs.deno.com/runtime/getting_started/installation/),
then run:

```powershell
deno check supabase/functions/invite-member/index.ts supabase/functions/review-contribution/index.ts
```

The PowerShell installation command is `irm https://deno.land/install.ps1 | iex`;
open a new terminal afterward and verify with `deno --version`. Type checking
still does not test authorization or HTTP behavior; those require requests
against the disposable local stack.

## Local frontend setup

After the local Supabase stack starts, copy `.env.example` to `.env.local` and
set `VITE_SUPABASE_URL` to the local API URL and
`VITE_SUPABASE_PUBLISHABLE_KEY` to the local publishable key (the legacy
`VITE_SUPABASE_ANON_KEY` is also accepted). These values are public client
credentials; never put a service-role key in a `VITE_` variable. Then run:

```powershell
npm install
npm run dev
```

Open `http://localhost:5173`. The checked-in database seed is empty, and public
signup is disabled. Provision test identities, classrooms, and membership only
inside this disposable local stack before exercising the UI. The trusted first
administrator procedure is in [`README.md`](README.md#schema-and-roles).

## Supabase project and frontend deployment checklist

Use a dedicated development Supabase project before production. Review all
existing data and migration diffs; never use a reset command on a hosted
project. Apply migrations in filename order only after backup and review, then
deploy the Edge Functions. Configure the following in Supabase Auth:

- Set **Site URL** to the deployed frontend origin.
- Add exact allowed redirects for `/login?flow=invite` and
  `/login?flow=recovery` for every environment (including local development).
- Keep public email signup disabled.
- Configure invitation and recovery email templates and a production SMTP
  provider, then test delivery and expiration before inviting users.
- Provision the first classroom and administrator through the trusted
  project-owner procedure; the browser cannot create an administrator.

The `lesson-attachments` bucket is created as private by migration `00004`,
with a 10 MiB size limit and a MIME allowlist. Do not make it public or remove
the Storage policies. Database metadata must be retained when removing stored
objects, and objects must be removed via Storage before deleting metadata.

Deploy `review-contribution` and `invite-member` after migrations `00003` and
`00004`. Hosted Supabase provides its standard `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` secrets to Edge Functions;
set the additional server-only `APP_SITE_URL` to the environment's frontend
origin. Never add the service-role key to frontend build variables. The invite
function checks the caller's authenticated admin membership and permits only
student/teacher invitations. Test denied callers before sending invitations to
real people.

For Vercel or another Vite-compatible static host, configure
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the production
environment, use `npm run build`, and publish the `dist` directory. Configure
SPA history fallback so paths such as `/lessons/:id` serve `index.html`. Build
preview and production environments separately with their matching Supabase
origins and redirects. Verify the built assets contain no privileged secrets.

## Outstanding risks and hosted checks

- pgTAP and migrations have not run against PostgreSQL in this environment.
- Storage upload/download/delete restrictions need real API requests with
  separate identities in two classrooms.
- Auth restoration, password recovery, invite acceptance, and expired links
  need browser tests using local Mailpit or a dedicated test project.
- Edge Function authorization and cleanup behavior need local HTTP tests; no
  function was invoked during this review.
- Database and application behavior are not certified secure by static review
  or a successful frontend build. Re-run the automated and manual plans after
  the local stack is available and before production use.
