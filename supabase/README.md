# Supabase database and security setup

The migrations in this directory define the database security boundary for the
application. Supabase Auth and verified profile/classroom membership are
connected. Lesson, subject, assignment, contribution, member-directory, and
private attachment pages issue live Supabase requests. The dashboard now reads
its metrics and activity from the current classroom; failures display an error
instead of substitute sample data.

## Schema and roles

The `public` schema contains `profiles`, `classrooms`, `memberships`,
`subjects`, `lessons`, `lesson_contributions`, `lesson_attachments`,
`assignments`, and `assignment_progress`. Every one has RLS enabled. The
migrations also explicitly revoke browser table grants from `anon` and give
`authenticated` only the operations needed by its policies.

`public.user_role` uses the existing values `student`, `teacher`, and `admin`.
`admin` is the stored identifier for the human-facing **Administrator** role;
the TypeScript `UserRole` type uses the same identifiers. Membership is globally
unique on `user_id`, so one account cannot join two classrooms.

The Data API cannot create classrooms or assign the `admin` role. A project
owner must provision the first classroom administrator from the Supabase SQL
Editor (or another trusted database session) after inviting/creating that Auth
user. The Auth trigger creates the profile automatically. Public signup is
disabled in the checked-in local Auth configuration. New accounts have no
classroom membership until an administrator provisions one. Only a trusted
project owner can provision an administrator:

```sql
-- Replace the UUID with the invited user's auth.users.id.
-- Run as the trusted project owner, never from browser code.
WITH new_classroom AS (
  INSERT INTO public.classrooms (name, description, owner_id)
  VALUES ('Room 204 · Class 10A', 'Classroom description', '00000000-0000-0000-0000-000000000000')
  RETURNING id, owner_id
)
INSERT INTO public.memberships (user_id, classroom_id, role)
SELECT owner_id, id, 'admin'::public.user_role
FROM new_classroom;
```

Classroom administrators can add students and teachers, but cannot add or
promote anyone to administrator. They cannot change an existing membership's
`user_id`, `classroom_id`, or `role` through UPDATE. To replace a student with a
teacher, an administrator can remove the non-admin membership and add the
teacher membership. Assigning another administrator remains a trusted project
owner action. Removing the last administrator is intentionally unavailable to
classroom admins to avoid an accidental lockout.

## Applying migrations

No project ref or database connection is configured in this checkout. The
migrations have **not** been applied to any database.

For a fresh, disposable local Supabase stack, install the Supabase CLI and
Docker Desktop, then run from the repository root:

```sh
supabase start
supabase db reset   # local only: recreates the local database and applies migrations
supabase test db
```

`supabase db reset` is destructive to local database contents. Do not point it
at a linked/remote project or use it where local data must be kept.

For an existing project, first take a database backup and inspect existing
memberships, cross-classroom references, contribution review fields, progress
timestamps, and attachment metadata. Migration `00003` deliberately stops if existing rows
violate the one-classroom rule, new composite foreign keys, review-state checks,
file-size/type constraints, or opaque attachment path convention. Resolve
those records and verify the proposed changes before applying. Then link the
intended project and preview/apply the migrations:

```sh
supabase login
supabase link --project-ref <project-ref>
supabase db push --dry-run
supabase db push
```

Do not use a linked database reset command. Review the CLI's dry-run output and
migration diff before applying any migration to a live project.

The original `00001` and `00002` files are retained as historical migrations.
`00003` drops their public membership helper and replaces all policies on the
nine application tables because PostgreSQL combines permissive policies with
OR. `00004` provisions the private Storage bucket and its object policies.

## Attachment storage

Migration `00004` creates the private `lesson-attachments` bucket with a 10 MiB
per-file limit and these allowed content types:

- `application/pdf`
- `image/jpeg`
- `image/png`
- `text/plain`
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document`

Object keys must have this exact shape:

```text
{classroom UUID}/{lesson UUID}/{attachment UUID}
```

The browser workflow first inserts the authorized `lesson_attachments`
metadata row (including its UUID path), then uploads the object using the same
user's JWT. Storage RLS requires a matching,
RLS-visible metadata row for upload and read. No overwrite policy is provided.
For deletion, remove the object through the Storage API before deleting its
metadata or parent lesson; SQL deletion of metadata does not delete Storage
bytes. Use authenticated downloads or short-lived signed URLs. Never make this
bucket public.

The bucket checks the supplied MIME type and byte size, but it does not inspect
file signatures or scan content. A later upload workflow should validate file
contents and use safe download headers before production use.

## Authentication and invitations

The frontend uses Supabase Auth password sign-in, session restoration, sign
out, password recovery, and invite-link password setup. Set
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the app environment;
the legacy `VITE_SUPABASE_ANON_KEY` is accepted. Only the public/publishable key
belongs in Vite variables.

For each deployed app origin, add `/login?flow=invite` and
`/login?flow=recovery` to Supabase Auth's allowed redirect URLs and set the
Auth Site URL appropriately. Local development uses
`http://localhost:5173/login?flow=invite` and
`http://localhost:5173/login?flow=recovery`. Configure email templates and an
SMTP provider before sending real invitations or recovery emails.

`functions/invite-member` is the only app invitation sender. It validates the
caller with Auth, verifies the caller's `admin` membership for the requested
classroom using that caller's JWT, accepts only student/teacher roles, then
uses the Edge Function's server-only `SUPABASE_SERVICE_ROLE_KEY` to invite the
account and assign its one classroom membership. Set the server-only
`APP_SITE_URL` Edge Function secret to the deployed frontend origin. Never add
either secret to `VITE_` variables. Deploy this function only after migrations
00003 and 00004 have been applied. The members page reads classroom
memberships and profiles; invitation submission uses this function.

Disable public signup in the hosted Supabase Auth settings as well as in the
local `config.toml`. Supabase Dashboard invitations and the app's checked
Edge Function are invitation paths; the browser has no public signup UI.
The first administrator must still be provisioned by the trusted project
owner procedure above.

## Edge Function

`functions/review-contribution` validates the bearer session, payload, classroom
role, pending state, and author/reviewer difference. It uses the caller's
publishable/anon key and JWT, not a service-role key. The database RLS policy
and column grants remain authoritative. Deploy it only after applying the
migrations and configuring the standard Edge Function `SUPABASE_URL` and
`SUPABASE_ANON_KEY` secrets. No privileged credential belongs in `VITE_`
variables.

## Security tests and limits

Run `supabase test db` against a disposable local stack to execute
`tests/database/security_rls.test.sql`. It covers student, teacher,
administrator, unauthenticated, and cross-classroom database access, including
role escalation, note review, progress updates, metadata visibility, and the
one-classroom constraint.

The pgTAP suite does not upload or download real Storage objects. Follow the
manual API checks in `tests/SECURITY_TEST_PLAN.md` with separate test accounts
and the local Storage endpoint before treating file access as verified. SQL
review and a successful build alone do not establish that the policies are
secure. Run the manual authentication checks in `tests/AUTH_TEST_PLAN.md` and
authenticated end-to-end tests against a running Supabase stack. The Phase 3
checklist is not yet executed against this project.
