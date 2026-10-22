# Lecture Recall

**Turn missed lessons into learning you can catch up on.**

Lecture Recall is an open-source, self-hosted classroom web app. Teachers and
administrators maintain a dated lesson archive and assignments. Students can
review class materials, submit notes for staff review, and track their own
assignment progress.

> **Status:** In development. This repository contains the frontend, Supabase
> migrations, and Edge Functions. A configured Supabase backend is required to
> use the app with saved classroom data.

## What it does

- Organizes lessons by date and subject, with draft and published visibility.
- Lets students submit titled notes and optional attachments for review.
- Lets staff approve or reject notes; students can revise unapproved notes.
- Provides assignment deadlines, student completion tracking, and text responses.
- Supports classroom subjects, member accounts, roles, and admin-managed
  permissions.
- Stores lesson and note attachments in a private Supabase Storage bucket.
- Includes profile/password settings, themes, text-size, contrast, and motion
  preferences.

Lesson content and student notes are entered as text. The app does not record,
transcribe, or summarize lecture audio or video, and does not provide
spaced-repetition quizzes.

## Stack

- React 18, TypeScript, Vite, and React Router
- Tailwind CSS, PostCSS, and custom CSS
- Supabase Auth, PostgreSQL, and private Supabase Storage
- Supabase Edge Functions for username login, account administration, and note
  review
- `@supabase/supabase-js`, `date-fns`, `clsx`, and `lucide-react`

## Roles and access

The database roles are `admin`, `teacher`, and `student` (the interface labels
`admin` as Administrator). A user belongs to one classroom. Classroom data is
protected by PostgreSQL Row Level Security, explicit grants, constraints, and
triggers. Migrations also define role permission templates and per-member
allow/deny overrides, including resource-scoped overrides.

The interface hides actions based on role, but UI checks are not the security
boundary. Database policies and trusted Edge Functions enforce access. Some
screens still show controls based on broad role checks, so a custom permission
grant may not expose the corresponding control in the UI.

## Using Lecture Recall

This guide assumes the app is connected to a configured Supabase project. The
app has no public sign-up page: an administrator account and classroom must
exist before members can use it.

### 1. Set up the first administrator

- **Local development:** start the local Supabase stack, apply the migrations,
  serve the Edge Functions, and run
  `supabase/scripts/bootstrap-local-admin.ps1` from the repository root. On a
  new local database this creates the development-only `admin` account. Change
  its password immediately in Settings. The bootstrap does nothing if an admin
  already exists and refuses non-local Supabase URLs.
- **Hosted project:** a trusted Supabase project owner must create the first
  Auth user, classroom, and administrator membership using the instructions in
  [`supabase/README.md`](supabase/README.md). Do not use the local bootstrap
  credentials or function on a hosted project.

### 2. Sign in and set up member accounts

Open the app and sign in with the username and password provided by the
classroom administrator. There is no self-service registration, email
invitation, or email password recovery. If the account is missing its profile,
membership, or classroom assignment, ask the administrator to complete setup.

An administrator opens **Members → Create account** to add a student, teacher,
or administrator with a username and temporary password. Share temporary
passwords privately. Members can change their own password and display name in
**Settings → Profile**. An administrator can edit another member's username,
name, or role, set a temporary password, or delete the member from the Members
page. Member controls do not allow an administrator to manage their own
account there; the last classroom administrator and classroom owner are
protected from deletion.

### 3. Configure the classroom

Open **Classroom** to view its details and subjects. Teachers and administrators
can add or edit subjects and choose a color. Administrators can also change the
classroom name and description. Add at least one subject before creating a
lesson. Deleting a subject also deletes its lessons, notes, and associated
attachment records/files; assignments remain with their subject and lesson
links cleared.

Administrators can open **Members → Permission Manager** to edit teacher or
student role defaults and set per-member allow or deny overrides. Some
permissions can be scoped to a specific subject, lesson, assignment, note, or
attachment. Changes are saved explicitly and enforced by the database on later
requests. The UI currently uses broad role checks for some controls, so a
custom backend grant may not make a control appear in the interface.

### 4. Add and publish lessons

Teachers and administrators open **Lessons → Add lesson**, enter a title,
summary, subject, and date, and save. Lessons can be edited, unpublished, or
deleted from the Lessons page. Published lessons are available to students;
unpublished lessons are hidden unless a specific lesson-view permission allows
access. Open a lesson to view approved class notes and available attachments.

Staff can upload private lesson files from the lesson detail page. Supported
types are PDF, JPEG, PNG, TXT, and DOCX; each file must be no larger than 10
MiB. Files are downloaded through the authenticated app and are not public
links.

### 5. Submit and review notes

Students open a lesson, write a titled note, and optionally attach one or more
supported files. They can preview the note and remove selected files before
submission. Select **Submit for review**; the note and its attachments remain
private to the author and staff while pending.

Teachers and administrators open **Note review** to filter submissions and
approve or reject pending notes. Approval publishes the note to classroom
members on that lesson. Students can find their submissions in **My notes**;
they can edit or delete notes that are pending or rejected, and resubmitting a
correction returns it to pending review. Approved notes cannot be edited by the
student.

### 6. Manage and complete assignments

Teachers and administrators open **Assignments → Create assignment**, enter a
title, description, optional subject, and due date, then save. Staff can edit or
delete assignments and see student completion counts and saved responses.

Students open **Assignments** to see deadlines, toggle an assignment's
completion status, and save a text response. Their progress and response are
associated with their account; staff can read classroom progress but student
accounts can change only their own records.

### 7. Use profile and appearance settings

Open the profile menu in the top-right corner to visit **Profile**, **Settings**,
or sign out. Settings include password and display-name changes, light/dark/
system themes, palette and density choices, text size, higher contrast, and
reduced motion. Appearance preferences are saved in that browser on the
current device.

## Run locally

Requirements: Node.js 18 or later, npm, and a local or hosted Supabase project.
For local database, Auth, Storage, and Edge Function development, install and
run the [Supabase CLI](https://supabase.com/docs/guides/cli) and Docker.

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env.local` and set the Supabase project URL and
   publishable (or legacy anon) key:

   ```dotenv
   VITE_SUPABASE_URL=http://127.0.0.1:54321
   VITE_SUPABASE_PUBLISHABLE_KEY=your-public-key
   ```

   These are browser-visible public credentials. **Never put a service-role
   key, database password, or other secret in a `VITE_` variable.**

3. Start the local Supabase services and apply pending migrations, following
   [`supabase/README.md`](supabase/README.md). For a fresh local stack, the
   repository includes a local-only administrator bootstrap script. It creates
   a weak development password; change it immediately and never use it on a
   hosted project.

4. Start the frontend:

   ```sh
   npm run dev
   ```

5. Build the frontend:

   ```sh
   npm run build
   ```

Other available scripts are `npm run type-check`, `npm run lint`, and
`npm run test:local-auth`. The local auth integration script requires a running
local Supabase stack and served Edge Functions. Database tests use
`npx supabase test db`. Test plans and setup instructions are in
[`supabase/tests`](supabase/tests/).

## Authentication and account setup

There is no public sign-up, invitation email, or email recovery flow. Users
sign in with an administrator-created username and password. The
`username-login` Edge Function maps the username to Supabase Auth internally
and returns an Auth session. Administrators can create accounts, change other
members' profiles and roles, and set temporary passwords. Users can update
their own password in Settings.

The first hosted classroom administrator must be provisioned by the trusted
Supabase project owner. Follow the procedure in [`supabase/README.md`](supabase/README.md).
The local bootstrap function is restricted to local Supabase URLs and must not
be deployed.

## Data and file storage

Supabase migrations create profiles, classrooms, memberships, subjects, lessons,
student contributions, attachment metadata, assignments, assignment progress,
permission templates, and permission audit records. The checked-in
`supabase/seed.sql` is empty; it does not create sample classroom data.

The `lesson-attachments` bucket is private. Uploads are limited to 10 MiB and
PDF, JPEG, PNG, plain text, or DOCX MIME types. Object access requires matching
metadata and classroom/lesson/attachment identifiers in the object path.
Uploads check declared MIME type and size; the app does not inspect file
signatures or scan file contents. Delete stored objects through the Storage API
before deleting their database metadata or parent content.

## Security and deployment

Read [`supabase/README.md`](supabase/README.md) for schema, migrations, account
provisioning, and backend setup. Read
[`supabase/DEPLOYMENT_READINESS.md`](supabase/DEPLOYMENT_READINESS.md) for
local verification and deployment notes, and
[`supabase/tests/SECURITY_TEST_PLAN.md`](supabase/tests/SECURITY_TEST_PLAN.md)
for database and Storage checks.

Apply migrations in order and review them against existing data before using a
hosted project. Do not run local database reset commands against linked or
hosted projects. Deploy `username-login`, `admin-create-member`,
`admin-member-action`, and `review-contribution` after applying the migrations.
Keep `bootstrap-local-admin` local. Configure the frontend with only public
Supabase credentials; keep service-role credentials in the Edge Function
environment.

A successful frontend build does not verify database policies, Storage access,
or Edge Function authorization. The repository includes automated test code
and manual test plans; consult current test output before claiming the checks
have passed. The deployment guide records that backend checks were unavailable
at its last review.

## Project layout

```text
src/                 React app, feature pages, components, types, and styles
supabase/migrations/ PostgreSQL schema, RLS, permissions, and Storage policies
supabase/functions/  Username login, account actions, note review, local bootstrap
supabase/tests/      pgTAP suite and manual verification plans
```

## License

MIT. See [`LICENSE`](LICENSE).
