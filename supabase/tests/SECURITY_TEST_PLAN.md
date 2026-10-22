# Security verification plan

The pgTAP fixture inserts Auth users inside a transaction and rolls back. It is
safe to run against the preserved local database and does not reset it.

## Automated database checks

Start the local stack, apply migrations, then run:

```sh
npx supabase test db
```

`database/security_rls.test.sql` exercises the following identities:

| Identity | Expected access |
|---|---|
| Student A, classroom A | Own profile and classmates; classroom A lessons, assignments, approved notes, own pending/rejected notes, own progress, and own pending/rejected attachment metadata. Can correct rejected notes and manage their own private files. Cannot edit official notes, approve a note, read classroom B, update another student's progress, or grant roles. |
| Teacher A, classroom A | Classroom A content, pending notes and progress. Can review another student's pending note. Cannot manage memberships. |
| Administrator A, classroom A | Classroom A content and progress. Can manage other members, assign any supported role, edit classroom settings, and manage profiles. Cannot alter their own role through member controls or bypass last-admin protection. |
| Student B, classroom B | Only classroom B records; no classroom A reads or writes. |
| Unauthenticated `anon` | No grant to application tables. |
| Trusted database owner | Used only for fixture setup and the global membership uniqueness assertion; never represents browser access. |

The 94 pgTAP assertions include a duplicate-membership constraint check,
cross-classroom profile/classroom/lesson/note/progress/attachment metadata
reads and lesson/assignment writes, unauthorized lesson and note writes,
username immutability, rejected-note correction and resubmission, own-pending
attachment metadata insert/delete, private Auth identifier grants, self-promotion and
classroom movement attempts, student-owned progress mutation and forged
progress denial, teacher review, admin membership/profile/settings management,
last-admin protection, unassigned-account access, and unauthenticated access.
Granular permission checks cover seeded role defaults, resource-scoped grants,
explicit denies, immediate changes, cross-classroom scope rejection, admin-only
permission management, role templates, immutable audit records, and lesson
publish/unpublish visibility.

The authenticated local integration suite is run separately with
`npm.cmd run test:local-auth`; it verifies login/logout/login cycles for each
role, account creation/edit/role update/password reset/deletion, subject/lesson/
assignment CRUD, assignment response persistence, note correction and review,
multi-file student uploads, actual Storage rejection and cleanup, staff downloads,
cross-classroom file denial, dependent deletion, unauthorized requests, and
classroom isolation. It also checks an administrator-approved student subject
creation and a student Storage grant scoped to one lesson, without changing the
student's role.

## Storage API checks

The authenticated local integration suite exercises upload/download/delete
against Supabase Storage. Additional pre-production checks should verify:

1. Student A uploads a file only after inserting metadata for a pending note in
   classroom A; upload succeeds at the exact `{classroom}/{lesson}/{attachment}`
   key. A different classroom UUID, lesson UUID, or attachment UUID is denied.
2. Student A can download their own pending contribution attachment and an
   approved attachment in classroom A, but cannot download another student's
   pending file.
3. Student A cannot upload an official lesson attachment by default. After an
   administrator grants upload on one lesson, upload succeeds there and fails
   on another lesson. Verify size and MIME restrictions remain in force.
4. Student A cannot list, download, overwrite, move, or delete a classroom B
   object, even when given or guessing its exact key.
5. Teacher A and administrator A can upload/delete allowed classroom A files
   but cannot access classroom B objects.
6. An unauthenticated request cannot list, upload, or download anything in the
   private bucket. A short-lived signed URL works only for its intended object
   and expires as configured.
7. Delete the object through Storage before deleting its metadata. Confirm a
   metadata-only SQL delete leaves no assumption that the underlying bytes were
   removed.
8. In the disposable local database only, temporarily add a permissive
   `storage.objects` policy using `USING (true)` for `authenticated` and verify
   the restrictive bucket guard still denies classroom B access. Repeat with
   `anon` and verify the private bucket remains inaccessible, then remove both
   temporary test policies.

Record the caller identity, HTTP status, object key, and result for every
positive and negative case. Also inspect `storage.objects` policies and bucket
configuration in the local database. Repeat after any change to policies,
bucket MIME rules, path conventions, or the upload workflow.

## Before production

- Run the SQL suite and authenticated Edge Function suite against the existing
  local stack without resetting it; run the Storage checks with separate
  temporary accounts.
- Repeat critical negative checks against the deployed project with dedicated
  test accounts in two isolated classrooms.
- Verify RLS and grants on all application tables and private bucket
  access; check that no broad Storage policies grant access to this bucket.
- Review migration output and pre-existing rows before applying on any project.
- Review actual uploaded content validation, malware handling, signed URL
  lifetime, backups, Auth configuration, Edge Function logs, and
  application error handling. These aspects are not verified by pgTAP.
