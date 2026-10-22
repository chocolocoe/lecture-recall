BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(94);
SELECT ok((
  SELECT pg_catalog.bool_and(relation.relrowsecurity)
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = relation.relnamespace
  WHERE nsp.nspname = 'public'
    AND relation.relname = ANY (ARRAY[
      'profiles', 'classrooms', 'memberships', 'subjects', 'lessons',
      'lesson_contributions', 'lesson_attachments', 'assignments', 'assignment_progress'
    ]::text[])
), 'RLS is enabled on every application table');
SELECT ok(NOT has_table_privilege('anon', 'public.profiles', 'SELECT'), 'anon has no direct profile table grant');
SELECT ok(NOT has_column_privilege('authenticated', 'public.profiles', 'email', 'SELECT'), 'authenticated clients cannot select internal Auth identifiers');

-- Unique test identities. The Auth trigger creates each matching profile.
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'student-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Student A"}', now(), now()),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'teacher-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Teacher A"}', now(), now()),
  ('10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'admin-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Admin A"}', now(), now()),
  ('10000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'student-b@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Student B"}', now(), now()),
  ('10000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'invitee@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Invitee"}', now(), now()),
  ('10000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'teacher-invitee@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Teacher Invitee"}', now(), now()),
  ('10000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'unassigned@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Unassigned"}', now(), now());

INSERT INTO public.classrooms (id, name, owner_id) VALUES
  ('20000000-0000-4000-8000-000000000001', 'Test room A', '10000000-0000-4000-8000-000000000003'),
  ('20000000-0000-4000-8000-000000000002', 'Test room B', '10000000-0000-4000-8000-000000000004');
INSERT INTO public.memberships (user_id, classroom_id, role) VALUES
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'student'),
  ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'teacher'),
  ('10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'admin'),
  ('10000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000002', 'student');
INSERT INTO public.subjects (id, classroom_id, name) VALUES
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Biology'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'History');
INSERT INTO public.lessons (id, classroom_id, subject_id, title, description, lesson_date, created_by) VALUES
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Lesson A', 'Official notes A', current_date, '10000000-0000-4000-8000-000000000002'),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'Lesson B', 'Official notes B', current_date, '10000000-0000-4000-8000-000000000004');
INSERT INTO public.lesson_contributions
  (id, lesson_id, submitted_by, content, status, reviewed_by, reviewed_at)
VALUES
  ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Pending note A', 'pending', NULL, NULL),
  ('50000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000004', 'Pending note B', 'pending', NULL, NULL),
  ('50000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Approved note A', 'approved', '10000000-0000-4000-8000-000000000002', now()),
  ('50000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'Teacher-authored note', 'pending', NULL, NULL);
INSERT INTO public.lesson_attachments (id, classroom_id, lesson_id, contribution_id, file_name, file_path, file_size, mime_type, uploaded_by) VALUES
  ('60000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', NULL, 'slides.pdf', '20000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001/60000000-0000-4000-8000-000000000001', 2048, 'application/pdf', '10000000-0000-4000-8000-000000000002'),
  ('60000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'note.png', '20000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001/60000000-0000-4000-8000-000000000002', 2048, 'image/png', '10000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', NULL, 'other.pdf', '20000000-0000-4000-8000-000000000002/40000000-0000-4000-8000-000000000002/60000000-0000-4000-8000-000000000003', 2048, 'application/pdf', '10000000-0000-4000-8000-000000000004');
INSERT INTO public.assignments (id, classroom_id, subject_id, lesson_id, title, due_date, created_by) VALUES
  ('70000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'Assignment A', now(), '10000000-0000-4000-8000-000000000002'),
  ('70000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', 'Assignment B', now(), '10000000-0000-4000-8000-000000000004');
INSERT INTO public.assignment_progress (id, assignment_id, user_id, completed) VALUES
  ('80000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', false),
  ('80000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000004', false);

SELECT throws_ok(
  $$INSERT INTO public.memberships (user_id, classroom_id, role) VALUES ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'student')$$,
  '23505', NULL, 'database enforces one classroom per account'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT is((SELECT count(*) FROM public.profiles WHERE id = '10000000-0000-4000-8000-000000000001'), 1::bigint, 'student reads their own profile');
SELECT is((SELECT username FROM public.profiles WHERE id = auth.uid()), 'student-a', 'student sees their immutable username');
SELECT throws_ok('SELECT email FROM public.profiles WHERE id = auth.uid()', '42501', NULL, 'student cannot read the internal Auth identifier');
SELECT is((SELECT count(*) FROM public.profiles WHERE id = '10000000-0000-4000-8000-000000000002'), 1::bigint, 'student reads a classmate profile');
SELECT is((SELECT count(*) FROM public.profiles WHERE id = '10000000-0000-4000-8000-000000000004'), 0::bigint, 'student cannot read a profile from another classroom');
SELECT is((SELECT count(*) FROM public.classrooms WHERE id = '20000000-0000-4000-8000-000000000001'), 1::bigint, 'student reads their classroom');
SELECT is((SELECT count(*) FROM public.classrooms WHERE id = '20000000-0000-4000-8000-000000000002'), 0::bigint, 'student cannot read another classroom');
UPDATE public.classrooms SET name = 'Student changed classroom' WHERE id = '20000000-0000-4000-8000-000000000001';
SELECT is((SELECT name FROM public.classrooms WHERE id = '20000000-0000-4000-8000-000000000001'), 'Test room A', 'student cannot change classroom settings');
SELECT is((SELECT count(*) FROM public.lessons WHERE id = '40000000-0000-4000-8000-000000000001'), 1::bigint, 'student reads a lesson in their classroom');
SELECT is((SELECT count(*) FROM public.lessons WHERE id = '40000000-0000-4000-8000-000000000002'), 0::bigint, 'student cannot read another classroom lesson');
SELECT is((SELECT count(*) FROM public.lesson_contributions WHERE id = '50000000-0000-4000-8000-000000000001'), 1::bigint, 'student reads their own pending note');
SELECT is((SELECT count(*) FROM public.lesson_contributions WHERE id = '50000000-0000-4000-8000-000000000002'), 0::bigint, 'student cannot read a pending note from another classroom');
SELECT is((SELECT count(*) FROM public.lesson_contributions WHERE id = '50000000-0000-4000-8000-000000000003'), 1::bigint, 'student reads an approved classmate note');
UPDATE public.profiles SET display_name = 'Student A Display' WHERE id = auth.uid();
SELECT is((SELECT display_name FROM public.profiles WHERE id = auth.uid()), 'Student A Display', 'student can change their own display name');
SELECT throws_ok(
  $$UPDATE public.profiles SET username = 'student-renamed' WHERE id = auth.uid()$$,
  '42501', NULL, 'student cannot change their username'
);
UPDATE public.lessons SET description = 'unauthorized' WHERE id = '40000000-0000-4000-8000-000000000001';
SELECT is((SELECT description FROM public.lessons WHERE id = '40000000-0000-4000-8000-000000000001'), 'Official notes A', 'student cannot edit official lesson notes');
SELECT throws_ok(
  $$UPDATE public.lesson_contributions SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() WHERE id = '50000000-0000-4000-8000-000000000001'$$,
  '42501', NULL, 'student cannot approve a note, even their own'
);
SELECT is((SELECT status::text FROM public.lesson_contributions WHERE id = '50000000-0000-4000-8000-000000000001'), 'pending', 'student cannot approve a note');
SET LOCAL ROLE postgres;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
UPDATE public.lesson_contributions SET status = 'rejected', reviewed_by = '10000000-0000-4000-8000-000000000002', reviewed_at = now() WHERE id = '50000000-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$UPDATE public.lesson_contributions SET title = 'Corrected note title', content = 'Corrected note content', status = 'pending', reviewed_by = NULL, reviewed_at = NULL WHERE id = '50000000-0000-4000-8000-000000000001'$$,
  'student can correct a rejected note and resubmit it for review'
);
SELECT is((SELECT status::text FROM public.lesson_contributions WHERE id = '50000000-0000-4000-8000-000000000001'), 'pending', 'corrected note returns to pending review');
SELECT throws_ok(
  $$INSERT INTO public.lessons (classroom_id, subject_id, title, lesson_date, created_by) VALUES ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Student lesson', current_date, auth.uid())$$,
  '42501', NULL, 'student cannot create an official lesson'
);
SELECT throws_ok(
  $$INSERT INTO public.memberships (user_id, classroom_id, role) VALUES (auth.uid(), '20000000-0000-4000-8000-000000000001', 'admin')$$,
  '42501', NULL, 'student cannot grant themselves administrator'
);
SELECT throws_ok(
  $$INSERT INTO public.memberships (user_id, classroom_id, role) VALUES (auth.uid(), '20000000-0000-4000-8000-000000000002', 'student')$$,
  '42501', NULL, 'student cannot move into a second classroom'
);
SELECT throws_ok(
  $$INSERT INTO public.lesson_contributions (lesson_id, submitted_by, content, status, reviewed_by, reviewed_at) VALUES ('40000000-0000-4000-8000-000000000001', auth.uid(), 'Unreviewed student publication', 'approved', auth.uid(), now())$$,
  '42501', NULL, 'student cannot submit a note as already approved'
);
SELECT throws_ok(
  $$INSERT INTO public.assignment_progress (assignment_id, user_id, completed) VALUES ('70000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', true)$$,
  '42501', NULL, 'student cannot create progress for another user'
);
SELECT throws_ok(
  $$SELECT public.delete_academic_item('assignment', '70000000-0000-4000-8000-000000000001')$$,
  '42501', NULL, 'student cannot delete an assignment through the scoped delete function'
);
UPDATE public.memberships SET role = 'admin' WHERE user_id = auth.uid();
SELECT is((SELECT role::text FROM public.memberships WHERE user_id = auth.uid()), 'student', 'student cannot modify their own role');
UPDATE public.memberships SET role = 'admin' WHERE user_id = '10000000-0000-4000-8000-000000000002';
SELECT is((SELECT role::text FROM public.memberships WHERE user_id = '10000000-0000-4000-8000-000000000002'), 'teacher', 'student cannot change another member role');
UPDATE public.assignments SET title = 'Cross-class edit' WHERE id = '70000000-0000-4000-8000-000000000002';
SET LOCAL ROLE postgres;
SELECT is((SELECT title FROM public.assignments WHERE id = '70000000-0000-4000-8000-000000000002'), 'Assignment B', 'student cannot edit an assignment in another classroom');
SET LOCAL ROLE authenticated;
UPDATE public.assignment_progress SET completed = true, completed_at = now() WHERE id = '80000000-0000-4000-8000-000000000001';
SELECT is((SELECT completed FROM public.assignment_progress WHERE id = '80000000-0000-4000-8000-000000000001'), true, 'student updates their own progress');
SELECT throws_ok(
  $$UPDATE public.assignment_progress SET assignment_id = '70000000-0000-4000-8000-000000000002' WHERE id = '80000000-0000-4000-8000-000000000001'$$,
  '42501', NULL, 'student cannot move their progress record to another classroom assignment'
);
SET LOCAL ROLE postgres;
SELECT is((SELECT assignment_id FROM public.assignment_progress WHERE id = '80000000-0000-4000-8000-000000000001'), '70000000-0000-4000-8000-000000000001'::uuid, 'cross-class progress reassignment is not persisted');
SET LOCAL ROLE authenticated;
UPDATE public.assignment_progress SET completed = true, completed_at = now() WHERE id = '80000000-0000-4000-8000-000000000002';
SET LOCAL ROLE postgres;
SELECT is((SELECT completed FROM public.assignment_progress WHERE id = '80000000-0000-4000-8000-000000000002'), false, 'student cannot update another student progress');
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.assignment_progress WHERE id = '80000000-0000-4000-8000-000000000002'), 0::bigint, 'student cannot read another classroom progress');
SELECT is((SELECT count(*) FROM public.lesson_attachments WHERE id = '60000000-0000-4000-8000-000000000002'), 1::bigint, 'student reads their own pending contribution attachment metadata');
SELECT is((SELECT count(*) FROM public.lesson_attachments WHERE id = '60000000-0000-4000-8000-000000000003'), 0::bigint, 'student cannot read another classroom attachment metadata');
SELECT lives_ok(
  $$INSERT INTO public.lesson_attachments (id, classroom_id, lesson_id, contribution_id, file_name, file_path, file_size, mime_type, uploaded_by) VALUES ('60000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'student-note.pdf', '20000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001/60000000-0000-4000-8000-000000000004', 1024, 'application/pdf', auth.uid())$$,
  'student can attach metadata to their own pending note'
);
SELECT throws_ok(
  $$INSERT INTO public.lesson_attachments (classroom_id, lesson_id, contribution_id, file_name, file_path, file_size, mime_type, uploaded_by) VALUES ('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000004', 'other-note.pdf', '20000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001/60000000-0000-4000-8000-000000000005', 1024, 'application/pdf', auth.uid())$$,
  '42501', NULL, 'student cannot attach files to another member''s note'
);
DELETE FROM public.lesson_attachments WHERE id = '60000000-0000-4000-8000-000000000004';
DELETE FROM public.lesson_attachments WHERE id = '60000000-0000-4000-8000-000000000001';
SET LOCAL ROLE postgres;
SELECT is((SELECT count(*) FROM public.lesson_attachments WHERE id = '60000000-0000-4000-8000-000000000004'), 0::bigint, 'student can clean up own pending metadata when no Storage object exists');
SELECT is((SELECT count(*) FROM public.lesson_attachments WHERE id = '60000000-0000-4000-8000-000000000001'), 1::bigint, 'student cannot delete teacher lesson attachment metadata');
SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
SELECT is((SELECT count(*) FROM public.lesson_contributions WHERE status = 'pending'), 2::bigint, 'teacher can read pending notes in their classroom');
UPDATE public.classrooms SET description = 'Teacher changed classroom' WHERE id = '20000000-0000-4000-8000-000000000001';
SELECT is((SELECT description FROM public.classrooms WHERE id = '20000000-0000-4000-8000-000000000001'), NULL, 'teacher cannot change classroom settings');
UPDATE public.memberships SET role = 'admin' WHERE user_id = auth.uid();
SELECT is((SELECT role::text FROM public.memberships WHERE user_id = auth.uid()), 'teacher', 'teacher cannot promote their own role');
UPDATE public.memberships SET role = 'admin' WHERE user_id = '10000000-0000-4000-8000-000000000001';
SELECT is((SELECT role::text FROM public.memberships WHERE user_id = '10000000-0000-4000-8000-000000000001'), 'student', 'teacher cannot change a classroom member role');
UPDATE public.lessons SET title = 'Teacher-edited lesson' WHERE id = '40000000-0000-4000-8000-000000000001';
SELECT is((SELECT title FROM public.lessons WHERE id = '40000000-0000-4000-8000-000000000001'), 'Teacher-edited lesson', 'teacher can edit academic content in their classroom');
UPDATE public.lessons SET title = 'Cross-class edit' WHERE id = '40000000-0000-4000-8000-000000000002';
SET LOCAL ROLE postgres;
SELECT is((SELECT title FROM public.lessons WHERE id = '40000000-0000-4000-8000-000000000002'), 'Lesson B', 'teacher cannot edit a lesson in another classroom');
SET LOCAL ROLE authenticated;
UPDATE public.lesson_contributions SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() WHERE id = '50000000-0000-4000-8000-000000000001';
SELECT is((SELECT status::text FROM public.lesson_contributions WHERE id = '50000000-0000-4000-8000-000000000001'), 'approved', 'teacher reviews a student note');
SELECT throws_ok(
  $$UPDATE public.lesson_contributions SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() WHERE id = '50000000-0000-4000-8000-000000000004'$$,
  '42501', NULL, 'teacher cannot review their own note'
);
SELECT is((SELECT status::text FROM public.lesson_contributions WHERE id = '50000000-0000-4000-8000-000000000004'), 'pending', 'teacher cannot review their own note');
SELECT is((SELECT count(*) FROM public.assignment_progress WHERE id = '80000000-0000-4000-8000-000000000001'), 1::bigint, 'teacher can read classroom progress');
SET LOCAL ROLE postgres;
INSERT INTO public.subjects (id, classroom_id, name) VALUES ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'Deletion fixture');
INSERT INTO public.lessons (id, classroom_id, subject_id, title, lesson_date, created_by) VALUES ('40000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', 'Deletion fixture lesson', current_date, auth.uid());
INSERT INTO public.lesson_contributions (id, lesson_id, submitted_by, content) VALUES ('50000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'Deletion fixture note');
INSERT INTO public.assignments (id, classroom_id, subject_id, lesson_id, title, due_date, created_by) VALUES ('70000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000003', 'Deletion fixture assignment', now(), auth.uid());
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.delete_academic_item('subject', '30000000-0000-4000-8000-000000000003')$$, 'teacher can delete a subject and its dependent lesson records atomically');
SELECT is((SELECT count(*) FROM public.lessons WHERE id = '40000000-0000-4000-8000-000000000003'), 0::bigint, 'subject deletion removes dependent lessons');
SELECT is((SELECT count(*) FROM public.lesson_contributions WHERE id = '50000000-0000-4000-8000-000000000005'), 0::bigint, 'subject deletion removes dependent contribution records');
SELECT is((SELECT subject_id IS NULL AND lesson_id IS NULL FROM public.assignments WHERE id = '70000000-0000-4000-8000-000000000003'), true, 'subject deletion preserves assignments and clears lesson references');
SELECT throws_ok(
  $$INSERT INTO public.memberships (user_id, classroom_id, role) VALUES ('10000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001', 'teacher')$$,
  '42501', NULL, 'teacher cannot manage classroom membership'
);

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
SELECT lives_ok(
  $$INSERT INTO public.memberships (user_id, classroom_id, role) VALUES ('10000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001', 'student')$$,
  'administrator can add a student membership'
);
SELECT lives_ok(
  $$INSERT INTO public.memberships (user_id, classroom_id, role) VALUES ('10000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000001', 'teacher')$$,
  'administrator can add a teacher membership'
);
SELECT lives_ok(
  $$UPDATE public.memberships SET role = 'admin' WHERE user_id = '10000000-0000-4000-8000-000000000006'$$,
  'administrator can promote a member to administrator'
);
UPDATE public.memberships SET role = 'teacher' WHERE user_id = '10000000-0000-4000-8000-000000000006';
UPDATE public.memberships SET role = 'teacher' WHERE user_id = auth.uid();
SELECT is((SELECT role::text FROM public.memberships WHERE user_id = auth.uid()), 'admin', 'administrator cannot demote their own account');
UPDATE public.memberships SET role = 'admin' WHERE user_id = '10000000-0000-4000-8000-000000000001';
SELECT is((SELECT role::text FROM public.memberships WHERE user_id = '10000000-0000-4000-8000-000000000001'), 'admin', 'administrator can promote and manage member roles');
UPDATE public.memberships SET role = 'student' WHERE user_id = '10000000-0000-4000-8000-000000000001';
UPDATE public.profiles SET display_name = 'Updated by administrator' WHERE id = '10000000-0000-4000-8000-000000000002';
SELECT is((SELECT display_name FROM public.profiles WHERE id = '10000000-0000-4000-8000-000000000002'), 'Updated by administrator', 'administrator can manage a classroom member profile');
UPDATE public.profiles SET display_name = NULL WHERE id = '10000000-0000-4000-8000-000000000002';
UPDATE public.classrooms SET description = 'Admin classroom settings' WHERE id = '20000000-0000-4000-8000-000000000001';
SELECT is((SELECT description FROM public.classrooms WHERE id = '20000000-0000-4000-8000-000000000001'), 'Admin classroom settings', 'administrator can edit classroom settings');
UPDATE public.classrooms SET description = NULL WHERE id = '20000000-0000-4000-8000-000000000001';
SELECT throws_ok(
  $$UPDATE public.profiles SET username = 'teacher-renamed' WHERE id = '10000000-0000-4000-8000-000000000002'$$,
  '42501', NULL, 'administrator username changes require the verified admin function'
);
UPDATE public.memberships SET role = 'teacher' WHERE user_id = '10000000-0000-4000-8000-000000000004';
SET LOCAL ROLE postgres;
SELECT is((SELECT role::text FROM public.memberships WHERE user_id = '10000000-0000-4000-8000-000000000004'), 'student', 'administrator cannot change membership in another classroom');
SELECT throws_ok(
  $$UPDATE public.memberships SET role = 'teacher' WHERE user_id = '10000000-0000-4000-8000-000000000003'$$,
  '23514', NULL, 'database prevents removing the last classroom administrator'
);
SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000007', true);
SELECT is((SELECT count(*) FROM public.memberships WHERE user_id = auth.uid()), 0::bigint, 'signed-in account without a membership has no classroom membership');
SELECT is((SELECT count(*) FROM public.classrooms), 0::bigint, 'account without a membership cannot read any classroom');
SELECT is((SELECT count(*) FROM public.lessons), 0::bigint, 'account without a membership cannot read lessons');

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
SET LOCAL ROLE authenticated;
SELECT ok(private.has_permission('20000000-0000-4000-8000-000000000001','permissions.grant'), 'administrator retains permission management access');
SELECT is((SELECT allowed FROM public.classroom_role_permissions WHERE classroom_id='20000000-0000-4000-8000-000000000001' AND role='student' AND permission_key='lessons.view'), true, 'student lesson-view default is explicitly granted');
SELECT is((SELECT allowed FROM public.classroom_role_permissions WHERE classroom_id='20000000-0000-4000-8000-000000000001' AND role='student' AND permission_key='subjects.create'), false, 'student subject-creation default is denied');
SELECT is((SELECT allowed FROM public.classroom_role_permissions WHERE classroom_id='20000000-0000-4000-8000-000000000001' AND role='student' AND permission_key='lessons.publish'), false, 'student publishing default is denied');
SELECT lives_ok(
  $$SELECT public.save_member_permissions('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','[{"permission":"lessons.edit","effect":"allow","resourceId":"40000000-0000-4000-8000-000000000001"}]'::jsonb)$$,
  'administrator can grant a resource-scoped override'
);
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
SELECT is(public.has_effective_permission('20000000-0000-4000-8000-000000000001','lessons.edit','40000000-0000-4000-8000-000000000001'), true, 'scoped grant is immediately effective for the member');
SELECT lives_ok($$UPDATE public.lessons SET description='Authorized scoped student edit' WHERE id='40000000-0000-4000-8000-000000000001'$$, 'resource-scoped permission enables the authorized edit');
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
SELECT lives_ok(
  $$SELECT public.save_member_permissions('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','[{"permission":"lessons.edit","effect":"deny","resourceId":"40000000-0000-4000-8000-000000000001"}]'::jsonb)$$,
  'administrator can replace an allow with an explicit deny'
);
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
SELECT is(public.has_effective_permission('20000000-0000-4000-8000-000000000001','lessons.edit','40000000-0000-4000-8000-000000000001'), false, 'explicit deny overrides the role default and prior grant');
UPDATE public.lessons SET description='Denied scoped edit' WHERE id='40000000-0000-4000-8000-000000000001';
SET LOCAL ROLE postgres;
SELECT is((SELECT description FROM public.lessons WHERE id='40000000-0000-4000-8000-000000000001'), 'Authorized scoped student edit', 'denied update affects zero rows and does not persist');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
SELECT throws_ok(
  $$SELECT public.save_member_permissions('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','[{"permission":"lessons.edit","effect":"allow","resourceId":"40000000-0000-4000-8000-000000000002"}]'::jsonb)$$,
  '42501', NULL, 'admin cannot attach a permission scope from another classroom'
);
SELECT throws_ok(
  $$SELECT public.save_member_permissions('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','[]'::jsonb)$$,
  '42501', NULL, 'admin cannot change their own permission overrides'
);
SELECT throws_ok(
  $$SELECT public.save_member_permissions('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','[{"permission":"permissions.grant","effect":"allow"}]'::jsonb)$$,
  '42501', NULL, 'permission management cannot be delegated'
);
SELECT throws_ok(
  $$UPDATE public.permission_audit_log SET new_effect='deny' WHERE classroom_id='20000000-0000-4000-8000-000000000001'$$,
  '42501', NULL, 'administrator cannot edit permission audit records'
);
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
SELECT throws_ok(
  $$SELECT public.save_member_permissions('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','[]'::jsonb)$$,
  '42501', NULL, 'teacher cannot grant or revoke permissions'
);
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
SELECT lives_ok(
  $$SELECT public.save_role_permission_template('20000000-0000-4000-8000-000000000001','student','[{"permission":"subjects.create","allowed":true}]'::jsonb)$$,
  'administrator can manage a non-admin role template'
);
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
SELECT is(public.has_effective_permission('20000000-0000-4000-8000-000000000001','subjects.create'), true, 'role template updates take effect without session refresh');
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
UPDATE public.lessons SET published=false WHERE id='40000000-0000-4000-8000-000000000001';
SELECT is((SELECT count(*) FROM public.lessons WHERE id='40000000-0000-4000-8000-000000000001'), 1::bigint, 'administrator can view an unpublished lesson');
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
SELECT is((SELECT count(*) FROM public.lessons WHERE id='40000000-0000-4000-8000-000000000001'), 0::bigint, 'student cannot view an unpublished lesson');
UPDATE public.lessons SET published=true WHERE id='40000000-0000-4000-8000-000000000001';
SET LOCAL ROLE postgres;
SELECT is((SELECT published FROM public.lessons WHERE id='40000000-0000-4000-8000-000000000001'), false, 'student publish attempt does not persist');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
UPDATE public.lessons SET published=true WHERE id='40000000-0000-4000-8000-000000000001';
SELECT is((SELECT published FROM public.lessons WHERE id='40000000-0000-4000-8000-000000000001'), true, 'administrator can republish a lesson');

SET LOCAL ROLE anon;
SELECT throws_ok('SELECT * FROM public.profiles', '42501', NULL, 'unauthenticated role has no profile table grant');

SELECT * FROM finish();
ROLLBACK;
