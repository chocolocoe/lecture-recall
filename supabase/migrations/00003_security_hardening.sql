-- Lecture Recall: close the authorization gaps in the original schema.
-- Keep this forward-only: do not edit migrations that may already be recorded
-- in a deployed project's migration history.

-- Preserve the existing enum identifier used by the UI. "admin" is the
-- database role value for the human-facing Administrator role.
COMMENT ON TYPE public.user_role IS
  'Classroom roles: student, teacher, admin (human-facing label: Administrator). Membership roles are assigned by an existing classroom admin or the project owner.';

-- Fail with an actionable message instead of silently choosing a classroom
-- when upgrading data that already violates the one-classroom rule.
DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.memberships
    GROUP BY user_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce one classroom per account: duplicate user_id values exist in public.memberships. Resolve those memberships, then re-run this migration.';
  END IF;
END
$migration$;

ALTER TABLE public.memberships
  DROP CONSTRAINT IF EXISTS memberships_user_id_classroom_id_key;
ALTER TABLE public.memberships
  ADD CONSTRAINT memberships_user_id_key UNIQUE (user_id);
CREATE INDEX IF NOT EXISTS memberships_classroom_role_idx
  ON public.memberships (classroom_id, role);
CREATE INDEX IF NOT EXISTS memberships_classroom_user_role_idx
  ON public.memberships (classroom_id, user_id, role);

-- Composite keys make it impossible to associate a lesson or assignment with
-- a subject/lesson from a different classroom, even through direct SQL APIs.
ALTER TABLE public.subjects
  ADD CONSTRAINT subjects_classroom_id_id_key UNIQUE (classroom_id, id);
ALTER TABLE public.lessons
  ADD CONSTRAINT lessons_classroom_id_id_key UNIQUE (classroom_id, id);
ALTER TABLE public.lessons
  DROP CONSTRAINT IF EXISTS lessons_subject_id_fkey;
ALTER TABLE public.lessons
  ADD CONSTRAINT lessons_classroom_subject_fkey
  FOREIGN KEY (classroom_id, subject_id)
  REFERENCES public.subjects (classroom_id, id)
  ON DELETE CASCADE;

ALTER TABLE public.assignments
  DROP CONSTRAINT IF EXISTS assignments_subject_id_fkey;
ALTER TABLE public.assignments
  DROP CONSTRAINT IF EXISTS assignments_lesson_id_fkey;
ALTER TABLE public.assignments
  ADD CONSTRAINT assignments_classroom_subject_fkey
  FOREIGN KEY (classroom_id, subject_id)
  REFERENCES public.subjects (classroom_id, id)
  ON DELETE SET NULL (subject_id);
ALTER TABLE public.assignments
  ADD CONSTRAINT assignments_classroom_lesson_fkey
  FOREIGN KEY (classroom_id, lesson_id)
  REFERENCES public.lessons (classroom_id, id)
  ON DELETE SET NULL (lesson_id);

ALTER TABLE public.lesson_contributions
  ADD CONSTRAINT lesson_contributions_lesson_id_id_key UNIQUE (lesson_id, id);

ALTER TABLE public.lesson_attachments
  ADD COLUMN classroom_id uuid;
UPDATE public.lesson_attachments AS attachment
SET classroom_id = lesson.classroom_id
FROM public.lessons AS lesson
WHERE lesson.id = attachment.lesson_id;
ALTER TABLE public.lesson_attachments
  ALTER COLUMN classroom_id SET NOT NULL;
ALTER TABLE public.lesson_attachments
  DROP CONSTRAINT IF EXISTS lesson_attachments_lesson_id_fkey;
ALTER TABLE public.lesson_attachments
  DROP CONSTRAINT IF EXISTS lesson_attachments_contribution_id_fkey;
ALTER TABLE public.lesson_attachments
  ADD CONSTRAINT lesson_attachments_classroom_lesson_fkey
  FOREIGN KEY (classroom_id, lesson_id)
  REFERENCES public.lessons (classroom_id, id)
  ON DELETE RESTRICT;
ALTER TABLE public.lesson_attachments
  ADD CONSTRAINT lesson_attachments_lesson_contribution_fkey
  FOREIGN KEY (lesson_id, contribution_id)
  REFERENCES public.lesson_contributions (lesson_id, id)
  ON DELETE RESTRICT;
ALTER TABLE public.lesson_attachments
  ADD CONSTRAINT lesson_attachments_file_size_check
  CHECK (file_size > 0 AND file_size <= 10485760);
ALTER TABLE public.lesson_attachments
  ADD CONSTRAINT lesson_attachments_file_path_check
  CHECK (file_path = classroom_id::text || '/' || lesson_id::text || '/' || id::text);
ALTER TABLE public.lesson_attachments
  ADD CONSTRAINT lesson_attachments_mime_type_check
  CHECK (mime_type IN (
    'application/pdf',
    'image/jpeg',
    'image/png',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ));
CREATE UNIQUE INDEX lesson_attachments_file_path_key
  ON public.lesson_attachments (file_path);
CREATE INDEX lesson_attachments_classroom_lesson_idx
  ON public.lesson_attachments (classroom_id, lesson_id);

-- Reject empty/whitespace-only text and cap untrusted input sizes at the DB.
ALTER TABLE public.classrooms
  ADD CONSTRAINT classrooms_name_nonempty CHECK (length(btrim(name)) BETWEEN 1 AND 120);
ALTER TABLE public.subjects
  ADD CONSTRAINT subjects_name_nonempty CHECK (length(btrim(name)) BETWEEN 1 AND 80);
ALTER TABLE public.lessons
  ADD CONSTRAINT lessons_title_nonempty CHECK (length(btrim(title)) BETWEEN 1 AND 160);
ALTER TABLE public.lesson_contributions
  ADD CONSTRAINT lesson_contributions_content_nonempty CHECK (length(btrim(content)) BETWEEN 1 AND 20000);
ALTER TABLE public.lesson_contributions
  ADD CONSTRAINT lesson_contributions_review_fields_check CHECK (
    (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status IN ('approved', 'rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  );
ALTER TABLE public.assignments
  ADD CONSTRAINT assignments_title_nonempty CHECK (length(btrim(title)) BETWEEN 1 AND 160);
ALTER TABLE public.assignment_progress
  ADD CONSTRAINT assignment_progress_completion_timestamp_check CHECK (
    (completed = false AND completed_at IS NULL)
    OR (completed = true AND completed_at IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS lessons_classroom_date_idx
  ON public.lessons (classroom_id, lesson_date DESC);
CREATE INDEX IF NOT EXISTS contributions_lesson_status_created_idx
  ON public.lesson_contributions (lesson_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS assignments_classroom_due_idx
  ON public.assignments (classroom_id, due_date);
CREATE INDEX IF NOT EXISTS assignments_classroom_subject_idx
  ON public.assignments (classroom_id, subject_id) WHERE subject_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS assignments_classroom_lesson_idx
  ON public.assignments (classroom_id, lesson_id) WHERE lesson_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS progress_user_assignment_idx
  ON public.assignment_progress (user_id, assignment_id);

-- Private, non-API-exposed predicates avoid membership RLS recursion. These
-- functions only answer a question about auth.uid(); they accept no caller id.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.has_classroom_role(
  p_classroom_id uuid,
  p_allowed_roles public.user_role[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships AS membership
    WHERE membership.classroom_id = p_classroom_id
      AND membership.user_id = (SELECT auth.uid())
      AND membership.role = ANY (p_allowed_roles)
  );
$function$;

CREATE OR REPLACE FUNCTION private.can_view_profile(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT p_profile_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.memberships AS viewer_membership
      JOIN public.memberships AS target_membership
        ON target_membership.classroom_id = viewer_membership.classroom_id
      WHERE viewer_membership.user_id = (SELECT auth.uid())
        AND target_membership.user_id = p_profile_id
    );
$function$;

CREATE OR REPLACE FUNCTION private.lesson_storage_object_exists(p_file_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM storage.objects AS object
    WHERE object.bucket_id = 'lesson-attachments'
      AND object.name = p_file_path
  );
$function$;

REVOKE ALL ON FUNCTION private.has_classroom_role(uuid, public.user_role[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.can_view_profile(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.lesson_storage_object_exists(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.has_classroom_role(uuid, public.user_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_view_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.lesson_storage_object_exists(text) TO authenticated;

-- Profile rows are created by Auth, never by a browser-supplied user id.
CREATE OR REPLACE FUNCTION private.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NULLIF(btrim(NEW.raw_user_meta_data ->> 'full_name'), ''), split_part(COALESCE(NEW.email, ''), '@', 1)),
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'display_name'), ''),
    NULLIF(NEW.raw_user_meta_data ->> 'avatar_url', '')
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.sync_auth_user_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  UPDATE public.profiles
  SET email = NEW.email, updated_at = pg_catalog.now()
  WHERE id = NEW.id;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.handle_new_auth_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.sync_auth_user_email() FROM PUBLIC, anon, authenticated;
ALTER FUNCTION private.has_classroom_role(uuid, public.user_role[]) OWNER TO postgres;
ALTER FUNCTION private.can_view_profile(uuid) OWNER TO postgres;
ALTER FUNCTION private.lesson_storage_object_exists(text) OWNER TO postgres;
ALTER FUNCTION private.handle_new_auth_user() OWNER TO postgres;
ALTER FUNCTION private.sync_auth_user_email() OWNER TO postgres;
DROP TRIGGER IF EXISTS lecture_recall_create_profile ON auth.users;
CREATE TRIGGER lecture_recall_create_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.handle_new_auth_user();
DROP TRIGGER IF EXISTS lecture_recall_sync_profile_email ON auth.users;
CREATE TRIGGER lecture_recall_sync_profile_email
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION private.sync_auth_user_email();

-- Backfill profiles for Auth accounts created before this trigger existed.
INSERT INTO public.profiles (id, email, full_name, display_name, avatar_url)
SELECT
  auth_user.id,
  auth_user.email,
  COALESCE(NULLIF(btrim(auth_user.raw_user_meta_data ->> 'full_name'), ''), split_part(COALESCE(auth_user.email, ''), '@', 1)),
  NULLIF(btrim(auth_user.raw_user_meta_data ->> 'display_name'), ''),
  NULLIF(auth_user.raw_user_meta_data ->> 'avatar_url', '')
FROM auth.users AS auth_user
WHERE auth_user.email IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- Remove the permissive legacy policies before installing the complete policy
-- set below. Supabase combines permissive policies with OR, so old policies
-- must not remain alongside hardened policies.
DO $policies$
DECLARE
  existing_policy record;
BEGIN
  FOR existing_policy IN
    SELECT schemaname, tablename, policyname
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'profiles', 'classrooms', 'memberships', 'subjects', 'lessons',
        'lesson_contributions', 'lesson_attachments', 'assignments', 'assignment_progress'
      )
  LOOP
    EXECUTE pg_catalog.format(
      'DROP POLICY %I ON %I.%I',
      existing_policy.policyname,
      existing_policy.schemaname,
      existing_policy.tablename
    );
  END LOOP;
END;
$policies$;

-- Retire the old public SECURITY DEFINER membership predicate. Policies now
-- use pinned, non-exposed helpers in the private schema.
DROP FUNCTION IF EXISTS public.is_classroom_member(uuid, public.user_role);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classrooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_progress ENABLE ROW LEVEL SECURITY;

-- Explicit table grants are part of the boundary too; RLS alone does not
-- remove default anon/authenticated privileges on a Supabase project.
REVOKE ALL ON TABLE
  public.profiles,
  public.classrooms,
  public.memberships,
  public.subjects,
  public.lessons,
  public.lesson_contributions,
  public.lesson_attachments,
  public.assignments,
  public.assignment_progress
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.profiles, public.classrooms, public.memberships,
  public.subjects, public.lessons, public.lesson_contributions,
  public.lesson_attachments, public.assignments, public.assignment_progress
TO authenticated;
GRANT UPDATE (full_name, display_name, avatar_url) ON public.profiles TO authenticated;
GRANT UPDATE (name, description) ON public.classrooms TO authenticated;
GRANT INSERT, DELETE ON public.memberships TO authenticated;
GRANT INSERT, DELETE ON public.subjects TO authenticated;
GRANT UPDATE (name, color) ON public.subjects TO authenticated;
GRANT INSERT, DELETE ON public.lessons TO authenticated;
GRANT UPDATE (subject_id, title, description, lesson_date) ON public.lessons TO authenticated;
GRANT INSERT ON public.lesson_contributions TO authenticated;
GRANT UPDATE (status, reviewed_by, reviewed_at) ON public.lesson_contributions TO authenticated;
GRANT INSERT, DELETE ON public.lesson_attachments TO authenticated;
GRANT INSERT, DELETE ON public.assignments TO authenticated;
GRANT UPDATE (subject_id, lesson_id, title, description, due_date) ON public.assignments TO authenticated;
GRANT INSERT ON public.assignment_progress TO authenticated;
GRANT UPDATE (completed, completed_at, notes) ON public.assignment_progress TO authenticated;
GRANT USAGE ON TYPE public.user_role, public.contribution_status TO authenticated;

-- Profiles: private by default; classmates and staff can read names/contact
-- details needed for the existing class directory. Email and id are immutable
-- from the Data API; Auth owns email changes through the trigger above.
CREATE POLICY profiles_read_permitted
  ON public.profiles FOR SELECT TO authenticated
  USING (private.can_view_profile(id));
CREATE POLICY profiles_update_self
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- Classrooms have no client insert/delete path. Project owners bootstrap the
-- first classroom and administrator using the documented trusted SQL steps.
CREATE POLICY classrooms_read_members
  ON public.classrooms FOR SELECT TO authenticated
  USING (private.has_classroom_role(id, ARRAY['student', 'teacher', 'admin']::public.user_role[]));
CREATE POLICY classrooms_update_admin
  ON public.classrooms FOR UPDATE TO authenticated
  USING (private.has_classroom_role(id, ARRAY['admin']::public.user_role[]))
  WITH CHECK (private.has_classroom_role(id, ARRAY['admin']::public.user_role[]));

-- Account membership is globally unique. Client admins can add/remove only
-- non-admin members; administrator grants remain a trusted provisioning task.
CREATE POLICY memberships_read_self_or_classmates
  ON public.memberships FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR private.has_classroom_role(classroom_id, ARRAY['student', 'teacher', 'admin']::public.user_role[])
  );
CREATE POLICY memberships_insert_student_or_teacher_by_admin
  ON public.memberships FOR INSERT TO authenticated
  WITH CHECK (
    user_id <> (SELECT auth.uid())
    AND role IN ('student', 'teacher')
    AND private.has_classroom_role(classroom_id, ARRAY['admin']::public.user_role[])
  );
CREATE POLICY memberships_delete_non_admin_by_admin
  ON public.memberships FOR DELETE TO authenticated
  USING (
    role <> 'admin'
    AND user_id <> (SELECT auth.uid())
    AND private.has_classroom_role(classroom_id, ARRAY['admin']::public.user_role[])
  );

-- Subjects and lessons are readable by classroom members and writable only by
-- teachers/administrators. Column grants prevent moving rows between rooms or
-- changing their creator.
CREATE POLICY subjects_read_members
  ON public.subjects FOR SELECT TO authenticated
  USING (private.has_classroom_role(classroom_id, ARRAY['student', 'teacher', 'admin']::public.user_role[]));
CREATE POLICY subjects_insert_staff
  ON public.subjects FOR INSERT TO authenticated
  WITH CHECK (private.has_classroom_role(classroom_id, ARRAY['teacher', 'admin']::public.user_role[]));
CREATE POLICY subjects_update_staff
  ON public.subjects FOR UPDATE TO authenticated
  USING (private.has_classroom_role(classroom_id, ARRAY['teacher', 'admin']::public.user_role[]))
  WITH CHECK (private.has_classroom_role(classroom_id, ARRAY['teacher', 'admin']::public.user_role[]));
CREATE POLICY subjects_delete_staff
  ON public.subjects FOR DELETE TO authenticated
  USING (private.has_classroom_role(classroom_id, ARRAY['teacher', 'admin']::public.user_role[]));

CREATE POLICY lessons_read_members
  ON public.lessons FOR SELECT TO authenticated
  USING (private.has_classroom_role(classroom_id, ARRAY['student', 'teacher', 'admin']::public.user_role[]));
CREATE POLICY lessons_insert_staff
  ON public.lessons FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND private.has_classroom_role(classroom_id, ARRAY['teacher', 'admin']::public.user_role[])
  );
CREATE POLICY lessons_update_staff
  ON public.lessons FOR UPDATE TO authenticated
  USING (private.has_classroom_role(classroom_id, ARRAY['teacher', 'admin']::public.user_role[]))
  WITH CHECK (private.has_classroom_role(classroom_id, ARRAY['teacher', 'admin']::public.user_role[]));
CREATE POLICY lessons_delete_staff
  ON public.lessons FOR DELETE TO authenticated
  USING (private.has_classroom_role(classroom_id, ARRAY['teacher', 'admin']::public.user_role[]));

-- Student notes can only be submitted by their author, initially pending and
-- without reviewer fields. Only another teacher/admin may review a pending row.
CREATE POLICY contributions_read_author_approved_or_staff
  ON public.lesson_contributions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.lessons AS lesson
      WHERE lesson.id = lesson_id
        AND private.has_classroom_role(lesson.classroom_id, ARRAY['student', 'teacher', 'admin']::public.user_role[])
    )
    AND (
      status = 'approved'
      OR submitted_by = (SELECT auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.lessons AS lesson
        WHERE lesson.id = lesson_contributions.lesson_id
          AND private.has_classroom_role(lesson.classroom_id, ARRAY['teacher', 'admin']::public.user_role[])
      )
    )
  );
CREATE POLICY contributions_insert_student_pending
  ON public.lesson_contributions FOR INSERT TO authenticated
  WITH CHECK (
    submitted_by = (SELECT auth.uid())
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.lessons AS lesson
      WHERE lesson.id = lesson_contributions.lesson_id
        AND private.has_classroom_role(lesson.classroom_id, ARRAY['student']::public.user_role[])
    )
  );
CREATE POLICY contributions_review_by_other_staff
  ON public.lesson_contributions FOR UPDATE TO authenticated
  USING (
    status = 'pending'
    AND submitted_by <> (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.lessons AS lesson
      WHERE lesson.id = lesson_contributions.lesson_id
        AND private.has_classroom_role(lesson.classroom_id, ARRAY['teacher', 'admin']::public.user_role[])
    )
  )
  WITH CHECK (
    status IN ('approved', 'rejected')
    AND submitted_by <> (SELECT auth.uid())
    AND reviewed_by = (SELECT auth.uid())
    AND reviewed_at IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.lessons AS lesson
      WHERE lesson.id = lesson_contributions.lesson_id
        AND private.has_classroom_role(lesson.classroom_id, ARRAY['teacher', 'admin']::public.user_role[])
    )
  );

-- Attachment metadata references the classroom and exact opaque Storage key.
-- Members can read official/approved files; authors and staff can read pending
-- contribution files. Only staff upload official lesson resources.
CREATE POLICY attachments_read_permitted
  ON public.lesson_attachments FOR SELECT TO authenticated
  USING (
    private.has_classroom_role(classroom_id, ARRAY['student', 'teacher', 'admin']::public.user_role[])
    AND (
      contribution_id IS NULL
      OR uploaded_by = (SELECT auth.uid())
      OR private.has_classroom_role(classroom_id, ARRAY['teacher', 'admin']::public.user_role[])
      OR EXISTS (
        SELECT 1 FROM public.lesson_contributions AS contribution
        WHERE contribution.id = lesson_attachments.contribution_id
          AND contribution.lesson_id = lesson_attachments.lesson_id
          AND contribution.status = 'approved'
      )
    )
  );
CREATE POLICY attachments_insert_owner_or_staff
  ON public.lesson_attachments FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = (SELECT auth.uid())
    AND file_path = classroom_id::text || '/' || lesson_id::text || '/' || id::text
    AND private.has_classroom_role(classroom_id, ARRAY['student', 'teacher', 'admin']::public.user_role[])
    AND EXISTS (
      SELECT 1 FROM public.lessons AS lesson
      WHERE lesson.id = lesson_attachments.lesson_id
        AND lesson.classroom_id = lesson_attachments.classroom_id
    )
    AND (
      (contribution_id IS NULL AND private.has_classroom_role(classroom_id, ARRAY['teacher', 'admin']::public.user_role[]))
      OR EXISTS (
        SELECT 1 FROM public.lesson_contributions AS contribution
        WHERE contribution.id = lesson_attachments.contribution_id
          AND contribution.lesson_id = lesson_attachments.lesson_id
          AND contribution.submitted_by = (SELECT auth.uid())
          AND contribution.status = 'pending'
      )
    )
  );
CREATE POLICY attachments_delete_staff
  ON public.lesson_attachments FOR DELETE TO authenticated
  USING (
    private.has_classroom_role(classroom_id, ARRAY['teacher', 'admin']::public.user_role[])
    AND NOT private.lesson_storage_object_exists(file_path)
  );

CREATE POLICY assignments_read_members
  ON public.assignments FOR SELECT TO authenticated
  USING (private.has_classroom_role(classroom_id, ARRAY['student', 'teacher', 'admin']::public.user_role[]));
CREATE POLICY assignments_insert_staff
  ON public.assignments FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND private.has_classroom_role(classroom_id, ARRAY['teacher', 'admin']::public.user_role[])
  );
CREATE POLICY assignments_update_staff
  ON public.assignments FOR UPDATE TO authenticated
  USING (private.has_classroom_role(classroom_id, ARRAY['teacher', 'admin']::public.user_role[]))
  WITH CHECK (private.has_classroom_role(classroom_id, ARRAY['teacher', 'admin']::public.user_role[]));
CREATE POLICY assignments_delete_staff
  ON public.assignments FOR DELETE TO authenticated
  USING (private.has_classroom_role(classroom_id, ARRAY['teacher', 'admin']::public.user_role[]));

-- Students can see/change only their own progress for assignments in their
-- one classroom. Teachers/admins may read the class overview but cannot edit it.
CREATE POLICY progress_read_self_or_staff
  ON public.assignment_progress FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assignments AS assignment
      WHERE assignment.id = assignment_progress.assignment_id
        AND (
          (user_id = (SELECT auth.uid())
            AND private.has_classroom_role(assignment.classroom_id, ARRAY['student']::public.user_role[]))
          OR private.has_classroom_role(assignment.classroom_id, ARRAY['teacher', 'admin']::public.user_role[])
        )
    )
  );
CREATE POLICY progress_insert_self
  ON public.assignment_progress FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.assignments AS assignment
      WHERE assignment.id = assignment_progress.assignment_id
        AND private.has_classroom_role(assignment.classroom_id, ARRAY['student']::public.user_role[])
    )
  );
CREATE POLICY progress_update_self
  ON public.assignment_progress FOR UPDATE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.assignments AS assignment
      WHERE assignment.id = assignment_progress.assignment_id
        AND private.has_classroom_role(assignment.classroom_id, ARRAY['student']::public.user_role[])
    )
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.assignments AS assignment
      WHERE assignment.id = assignment_progress.assignment_id
        AND private.has_classroom_role(assignment.classroom_id, ARRAY['student']::public.user_role[])
    )
  );
