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

Classroom administrators can create and promote student, teacher, and admin
members. Membership operations are classroom-scoped; members cannot change
their own role or assign themselves to a classroom. A classroom must retain at
least one admin, and the current admin cannot use member controls on their own
account.

## Applying migrations

For local development, keep the existing database and apply only pending
migrations from the repository root:

```sh
npx supabase start
npx supabase migration up --local
npx supabase test db
```

The migration command applies pending migrations without recreating the local
database. The database test suite is transactional and does not reset it.

For a deployed project, first take a database backup and inspect existing
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
Students can attach files only to their own pending or rejected notes. They can
remove those files only while the note remains unapproved; teachers and
administrators can open classroom review attachments. Migration `00009` also
adds note titles and allows an author to correct a rejected note by resubmitting
it as pending.
For deletion, remove the object through the Storage API before deleting its
metadata or parent lesson; SQL deletion of metadata does not delete Storage
bytes. Use authenticated downloads or short-lived signed URLs. Never make this
bucket public.

The bucket checks the supplied MIME type and byte size, but it does not inspect
file signatures or scan content. A later upload workflow should validate file
contents and use safe download headers before production use.

## Username accounts and classroom administration

The frontend uses Supabase Auth sessions, with username/password sign-in through
the `username-login` Edge Function. Migration `00005` derives usernames for
existing profiles from the local part of the stored Auth identifier; new
accounts receive an administrator-selected username. Supabase Auth retains an
internal email-shaped identifier, but migration `00006` removes browser access
to the profile email column and the app never displays it. Members can change
their display name and password, while their username is read-only. Classroom
admins can change other members' usernames and set a temporary password through
an authenticated server-side operation. No email delivery or recovery link is
used.

Apply pending migrations to a running local database without resetting it:

```sh
npx supabase migration up --local
```

Start the local stack and functions with `npx supabase start` and
`npx supabase functions serve`. To create a default account on a fresh local
installation, run `.\supabase\scripts\bootstrap-local-admin.ps1` from the
repository root. It creates `admin` / `admin` and a local classroom only when no
administrator exists. If an admin already exists, it reports that and makes no
changes. Change the default password immediately in Settings. These credentials
are for local development only and must never be used in a deployed project.
The bootstrap Edge Function refuses non-local Supabase URLs. Never put a
service-role key in a `VITE_` variable; the Supabase CLI provides it only to
Edge Functions.

If an administrator already exists, its account and classroom are preserved.
Sign in with its migrated username (the existing local admin is `admin.local`)
and use Settings to change its password. For a username change, create a second
administrator account, sign in as that administrator, and edit the original
account from Members; self-renaming is blocked to reduce lockout risk. A second
administrator can also set a temporary password if the existing password is
unknown.

Run authenticated login and account-management checks from a second terminal
while `functions serve` is running:

```powershell
npm.cmd run test:local-auth
```

The test creates temporary accounts and classrooms with unique names, exercises
all three role sessions and protected Edge Function actions, then deletes only
the temporary records it created. It reads the local service-role key from the
Supabase CLI process output without printing or storing it.

`admin-create-member` lets a verified classroom admin create student, teacher,
or admin accounts with a username and temporary password. `admin-member-action`
lets admins update another member's profile/role, set a temporary password, or
delete that account. These functions validate the caller's role and classroom
membership before using server-side Auth administration. Database RLS still
protects classroom data and membership changes. Migrations `00005` and `00006`
preserve existing Auth identities, classroom memberships, and content.

Set
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the app environment;
the legacy `VITE_SUPABASE_ANON_KEY` is accepted. Only the public/publishable key
belongs in Vite variables.

Set the Auth Site URL to the app origin. There are no invitation, verification,
or recovery email flows; administrators create accounts and reset passwords
inside the application.

Deploy `username-login`, `admin-create-member`, `admin-member-action`, and
`review-contribution` after applying the current migrations through `00018`.
Keep `bootstrap-local-admin` local; do not
deploy it to a hosted project. The `username-login` function is public by design and
uses Auth password verification with generic failure messages and server-side
rate limiting. The admin functions verify the caller's Auth session and
classroom admin membership. Never add a service-role key to `VITE_` variables.

Keep global signup disabled in hosted Supabase Auth settings as well as in the
local `config.toml`. New application accounts are created by an authenticated
classroom admin through the checked Edge Function; there is no public signup
UI. The first administrator must still be provisioned by the trusted project
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

Run `npx supabase test db` against the local stack to execute
`tests/database/security_rls.test.sql`. It covers student, teacher,
administrator, unauthenticated, and cross-classroom database access, including
role escalation, note review, progress updates, username immutability, private
Auth identifiers, metadata visibility, and the one-classroom constraint. The
tests run transactionally; do not reset the database to run them.

The pgTAP suite does not upload or download real Storage objects. Follow the
manual API checks in `tests/SECURITY_TEST_PLAN.md` with separate test accounts
and the local Storage endpoint before treating file access as verified. SQL
review and a successful build alone do not establish that the policies are
secure. Run the manual authentication checks in `tests/AUTH_TEST_PLAN.md` and
authenticated end-to-end tests against a running Supabase stack.

## Granular classroom permissions

Migrations `00010`–`00018` add a typed permission registry, explicit classroom
role defaults, per-member allow/deny overrides, protected role templates, and
an append-only audit log. Defaults preserve the existing Admin, Teacher, and
Student role boundaries; new classrooms receive the same defaults. Admin role
checks remain authoritative for account, role, classroom-settings, and
permission-management operations.

For a non-admin member, an override on one resource takes precedence over a
classroom-wide override, which takes precedence over the role template. At the
same scope, an explicit deny wins over the role default. The effective
permission function fails closed for invalid permissions and missing
membership. Permission changes use the authenticated `save_member_permissions`
and `save_role_permission_template` RPCs; direct writes to permission and audit
tables are revoked. Record-scoped grants are checked against the target
classroom. Permission changes are evaluated on each database request, so active
sessions do not need token edits or reauthentication.

RLS and Storage policies enforce these permissions alongside classroom and
resource constraints. Some grants remain narrower than their name: for
example, a note author can still only edit their own unreviewed note, and a
student upload grant applies only to the selected lesson. Admin-only member,
classroom, role, and permission-management capabilities cannot be delegated.
Lesson publishing is enforced by a database trigger and the `published` column;
existing lessons default to published to preserve visibility.

The admin-only Permission Manager is available from Members. It supports role
templates, inherited/granted/denied states, resource scopes, category changes,
and resetting member overrides. Changes are saved explicitly and audited with
actor, target, key, old/new effects, and timestamp.
