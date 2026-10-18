# Security verification plan

Run database tests only against a disposable local Supabase project or a
dedicated non-production project. Never run the tests against a live classroom
database. The pgTAP fixture inserts Auth users and its transaction rolls back;
the test suite does not reset the database.

## Automated database checks

Start the local stack, apply migrations, then run:

```sh
supabase test db
```

`database/security_rls.test.sql` exercises the following identities:

| Identity | Expected access |
|---|---|
| Student A, classroom A | Own profile and classmates; classroom A lessons, assignments, approved notes, own pending notes, own progress, and own pending attachment metadata. Cannot edit official notes, approve a note, create lessons, read classroom B, update another student's progress, or grant roles. |
| Teacher A, classroom A | Classroom A content, pending notes and progress. Can review another student's pending note. Cannot manage memberships. |
| Administrator A, classroom A | Classroom A content and progress. Can add a student/teacher membership. Cannot grant an administrator role through the Data API. |
| Student B, classroom B | Only classroom B records; no classroom A reads or writes. |
| Unauthenticated `anon` | No grant to application tables. |
| Trusted database owner | Used only for fixture setup and the global membership uniqueness assertion; never represents browser access. |

The automated assertions include a duplicate-membership constraint check,
cross-classroom profile/classroom/lesson/note/progress/attachment metadata
reads, unauthorized lesson and note writes, self-promotion and classroom
movement attempts, student-owned progress mutation, teacher review, admin
membership creation, denied admin-role assignment, and an unauthenticated table
access check.

## Storage API checks

The SQL tests check attachment metadata policies. They do not exercise Supabase
Storage's upload/download API. With local Storage running and two classrooms
provisioned, use a signed-in user JWT for each request and verify:

1. Student A uploads a file only after inserting metadata for a pending note in
   classroom A; upload succeeds at the exact `{classroom}/{lesson}/{attachment}`
   key. A different classroom UUID, lesson UUID, or attachment UUID is denied.
2. Student A can download their own pending contribution attachment and an
   approved attachment in classroom A, but cannot download another student's
   pending file.
3. Student A cannot upload an official lesson attachment, exceed 10 MiB, or
   upload a content type outside the bucket allowlist.
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

- Run the SQL suite and Storage checks against a fresh local Supabase stack.
- Repeat critical negative checks against the deployed project with dedicated
  test accounts in two isolated classrooms.
- Verify RLS and grants on all nine application tables and private bucket
  access; check that no broad Storage policies grant access to this bucket.
- Review migration output and pre-existing rows before applying on any project.
- Review actual uploaded content validation, malware handling, signed URL
  lifetime, backups, Auth invitation settings, Edge Function logs, and
  application error handling. These aspects are not verified by pgTAP.
