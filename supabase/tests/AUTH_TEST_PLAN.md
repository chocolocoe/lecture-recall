# Username account and interface checks

The automated local account and Edge Function checks are in
`scripts/test-local-auth.mjs`. Run them against a running local Supabase stack
with `npx supabase functions serve` active:

```powershell
npm.cmd run test:local-auth
```

The script creates uniquely named temporary users and classrooms, exercises
admin, teacher, and student login/logout/login cycles and protected account
operations, private multi-file student note uploads and cleanup, note review and
correction, assignment response persistence across deadline edits, and
cross-classroom attachment denial. It cleans up only test data it created and refuses to run if
the Supabase API URL is not localhost/127.0.0.1. Do not use `supabase db reset`
to run these checks.

## Browser checks

Use separate local test accounts and verify:

- Username/password sign-in, session restoration after refresh, logout, and a
  second login for each role.
- Students can view classroom content, submit notes, and update their own
  assignment responses and completion progress; teachers can manage academic
  content, open pending attachments, and review another member's contribution;
  admins can manage the classroom and its members.
- Students can submit a titled note with multiple private files, remove selected
  files before submission, correct a rejected note, and cannot change a note
  after approval. Teachers can approve the correction and see its authorized
  attachments.
- Members cannot change their own username or role. Admin username changes and
  password resets take effect, and no email address, invitation link, or
  recovery link is displayed.
- The member table is one compact row per account on desktop, scrolls or adapts
  on mobile, filters by name and role, and requires confirmation before delete.
- Profile menu opens and closes with outside click and Escape, navigates to
  Profile and Settings, and signs out to Login.
- Light, dark, and system themes apply to login, protected pages, forms,
  dialogs, tables, and menus; the chosen preference survives refresh and system
  changes while System is selected.
- A classroom admin can edit the existing classroom name/description. A
  teacher and student cannot change those settings.
- The admin-only Permission Manager displays inherited, granted, and denied
  permissions; supports resource-specific grants and role templates; confirms
  sensitive grants; saves and resets overrides; and is unavailable to teachers
  and students. Verify grants and revocations take effect in an already-open
  student session without changing the student's role.
- A teacher can publish/unpublish a lesson. Students immediately lose access
  to unpublished lessons, while an explicit lesson-view grant can authorize a
  selected unpublished lesson.

The browser checks require a browser session and are not covered by the
headless database and Edge Function scripts.
