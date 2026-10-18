BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(40);
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
INSERT INTO public.lessons (id, classroom_id, subject_id, title, lesson_date, created_by) VALUES
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Lesson A', current_date, '10000000-0000-4000-8000-000000000002'),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'Lesson B', current_date, '10000000-0000-4000-8000-000000000004');
INSERT INTO public.lesson_contributions (id, lesson_id, submitted_by, content) VALUES
  ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Pending note A'),
  ('50000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000004', 'Pending note B'),
  ('50000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Approved note A', 'approved', '10000000-0000-4000-8000-000000000002', now()),
  ('50000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'Teacher-authored note');
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
SELECT is((SELECT count(*) FROM public.profiles WHERE id = '10000000-0000-4000-8000-000000000002'), 1::bigint, 'student reads a classmate profile');
SELECT is((SELECT count(*) FROM public.profiles WHERE id = '10000000-0000-4000-8000-000000000004'), 0::bigint, 'student cannot read a profile from another classroom');
SELECT is((SELECT count(*) FROM public.classrooms WHERE id = '20000000-0000-4000-8000-000000000001'), 1::bigint, 'student reads their classroom');
SELECT is((SELECT count(*) FROM public.classrooms WHERE id = '20000000-0000-4000-8000-000000000002'), 0::bigint, 'student cannot read another classroom');
SELECT is((SELECT count(*) FROM public.lessons WHERE id = '40000000-0000-4000-8000-000000000001'), 1::bigint, 'student reads a lesson in their classroom');
SELECT is((SELECT count(*) FROM public.lessons WHERE id = '40000000-0000-4000-8000-000000000002'), 0::bigint, 'student cannot read another classroom lesson');
SELECT is((SELECT count(*) FROM public.lesson_contributions WHERE id = '50000000-0000-4000-8000-000000000001'), 1::bigint, 'student reads their own pending note');
SELECT is((SELECT count(*) FROM public.lesson_contributions WHERE id = '50000000-0000-4000-8000-000000000002'), 0::bigint, 'student cannot read a pending note from another classroom');
SELECT is((SELECT count(*) FROM public.lesson_contributions WHERE id = '50000000-0000-4000-8000-000000000003'), 1::bigint, 'student reads an approved classmate note');
SELECT is((WITH changed AS (UPDATE public.lessons SET description = 'unauthorized' WHERE id = '40000000-0000-4000-8000-000000000001' RETURNING id) SELECT count(*) FROM changed), 0::bigint, 'student cannot edit official lesson notes');
SELECT is((WITH changed AS (UPDATE public.lesson_contributions SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() WHERE id = '50000000-0000-4000-8000-000000000001' RETURNING id) SELECT count(*) FROM changed), 0::bigint, 'student cannot approve a note');
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
  $$UPDATE public.memberships SET role = 'admin' WHERE user_id = auth.uid()$$,
  '42501', NULL, 'student cannot modify their own role'
);
SELECT is((WITH changed AS (UPDATE public.assignments SET title = 'Cross-class edit' WHERE id = '70000000-0000-4000-8000-000000000002' RETURNING id) SELECT count(*) FROM changed), 0::bigint, 'student cannot edit an assignment in another classroom');
SELECT is((WITH changed AS (UPDATE public.assignment_progress SET completed = true, completed_at = now() WHERE id = '80000000-0000-4000-8000-000000000001' RETURNING id) SELECT count(*) FROM changed), 1::bigint, 'student updates their own progress');
SELECT is((WITH changed AS (UPDATE public.assignment_progress SET completed = true, completed_at = now() WHERE id = '80000000-0000-4000-8000-000000000002' RETURNING id) SELECT count(*) FROM changed), 0::bigint, 'student cannot update another student progress');
SELECT is((SELECT count(*) FROM public.assignment_progress WHERE id = '80000000-0000-4000-8000-000000000002'), 0::bigint, 'student cannot read another classroom progress');
SELECT is((SELECT count(*) FROM public.lesson_attachments WHERE id = '60000000-0000-4000-8000-000000000002'), 1::bigint, 'student reads their own pending contribution attachment metadata');
SELECT is((SELECT count(*) FROM public.lesson_attachments WHERE id = '60000000-0000-4000-8000-000000000003'), 0::bigint, 'student cannot read another classroom attachment metadata');

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
SELECT is((SELECT count(*) FROM public.lesson_contributions WHERE status = 'pending'), 2::bigint, 'teacher can read pending notes in their classroom');
SELECT is((WITH changed AS (UPDATE public.lessons SET title = 'Cross-class edit' WHERE id = '40000000-0000-4000-8000-000000000002' RETURNING id) SELECT count(*) FROM changed), 0::bigint, 'teacher cannot edit a lesson in another classroom');
SELECT is((WITH changed AS (UPDATE public.lesson_contributions SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() WHERE id = '50000000-0000-4000-8000-000000000001' RETURNING id) SELECT count(*) FROM changed), 1::bigint, 'teacher reviews a student note');
SELECT is((WITH changed AS (UPDATE public.lesson_contributions SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() WHERE id = '50000000-0000-4000-8000-000000000004' RETURNING id) SELECT count(*) FROM changed), 0::bigint, 'teacher cannot review their own note');
SELECT is((SELECT count(*) FROM public.assignment_progress WHERE id = '80000000-0000-4000-8000-000000000001'), 1::bigint, 'teacher can read classroom progress');
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
SELECT throws_ok(
  $$INSERT INTO public.memberships (user_id, classroom_id, role) VALUES ('10000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000001', 'admin')$$,
  '42501', NULL, 'administrator cannot grant another administrator role through membership insert'
);

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000007', true);
SELECT is((SELECT count(*) FROM public.memberships WHERE user_id = auth.uid()), 0::bigint, 'signed-in account without a membership has no classroom membership');
SELECT is((SELECT count(*) FROM public.classrooms), 0::bigint, 'account without a membership cannot read any classroom');
SELECT is((SELECT count(*) FROM public.lessons), 0::bigint, 'account without a membership cannot read lessons');

SET LOCAL ROLE anon;
SELECT throws_ok('SELECT * FROM public.profiles', '42501', NULL, 'unauthenticated role has no profile table grant');

SELECT * FROM finish();
ROLLBACK;
