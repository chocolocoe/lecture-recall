-- Add immutable-by-default usernames and complete classroom administrator
-- management without changing existing Auth identities or classroom data.

ALTER TABLE public.profiles ADD COLUMN username text;

-- Derive legacy usernames from the existing email local part. Preserve the
-- familiar value where possible, and append a stable suffix for collisions.
WITH source AS (
  SELECT
    profile.id,
    COALESCE(NULLIF(left(lower(regexp_replace(split_part(profile.email, '@', 1), '[^a-zA-Z0-9_.-]', '', 'g')), 32), ''), 'user') AS base_name
  FROM public.profiles AS profile
), ranked AS (
  SELECT
    source.id,
    source.base_name,
    row_number() OVER (PARTITION BY source.base_name ORDER BY source.id) AS duplicate_number
  FROM source
)
UPDATE public.profiles AS profile
SET username = CASE
  WHEN ranked.duplicate_number = 1
    AND length(ranked.base_name) BETWEEN 3 AND 32
    AND ranked.base_name ~ '^[a-z0-9][a-z0-9._-]*[a-z0-9]$'
  THEN ranked.base_name
  ELSE left(ranked.base_name, 23) || '_' || left(replace(ranked.id::text, '-', ''), 8)
END
FROM ranked
WHERE ranked.id = profile.id;

ALTER TABLE public.profiles ALTER COLUMN username SET NOT NULL;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_username_format_check
  CHECK (username ~ '^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$');
CREATE UNIQUE INDEX profiles_username_lower_key ON public.profiles (lower(username));

CREATE OR REPLACE FUNCTION private.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  requested_username text;
  safe_username text;
BEGIN
  requested_username := lower(btrim(COALESCE(NEW.raw_user_meta_data ->> 'username', split_part(COALESCE(NEW.email, ''), '@', 1))));
  IF requested_username !~ '^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$'
    OR EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = requested_username)
  THEN
    safe_username := 'user_' || left(replace(NEW.id::text, '-', ''), 8);
  ELSE
    safe_username := requested_username;
  END IF;

  INSERT INTO public.profiles (id, email, username, full_name, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    safe_username,
    COALESCE(NULLIF(btrim(NEW.raw_user_meta_data ->> 'full_name'), ''), split_part(COALESCE(NEW.email, ''), '@', 1)),
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'display_name'), ''),
    NULLIF(NEW.raw_user_meta_data ->> 'avatar_url', '')
  );
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.handle_new_auth_user() OWNER TO postgres;

-- The Data API cannot change a username. Only the authenticated, server-side
-- service role used by the admin Edge Function may do so.
CREATE OR REPLACE FUNCTION private.guard_username_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF OLD.username IS DISTINCT FROM NEW.username
    AND current_user NOT IN ('postgres', 'supabase_admin')
    AND (SELECT auth.role()) IS DISTINCT FROM 'service_role'
  THEN
    RAISE EXCEPTION 'Usernames can only be changed by a verified classroom administrator.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER profiles_guard_username_change
  BEFORE UPDATE OF username ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.guard_username_change();

CREATE OR REPLACE FUNCTION private.has_another_classroom_admin(
  p_classroom_id uuid,
  p_user_id uuid
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
      AND membership.user_id <> p_user_id
      AND membership.role = 'admin'
  );
$function$;
REVOKE ALL ON FUNCTION private.has_another_classroom_admin(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.has_another_classroom_admin(uuid, uuid) TO authenticated;
ALTER FUNCTION private.has_another_classroom_admin(uuid, uuid) OWNER TO postgres;

-- Serialize administrator demotions and removals so concurrent requests
-- cannot remove the last administrator.
CREATE OR REPLACE FUNCTION private.protect_last_classroom_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF OLD.role = 'admin'
    AND (TG_OP = 'DELETE' OR NEW.role IS DISTINCT FROM 'admin')
  THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(OLD.classroom_id::text, 0));
    IF NOT private.has_another_classroom_admin(OLD.classroom_id, OLD.user_id) THEN
      RAISE EXCEPTION 'A classroom must keep at least one administrator.'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;
ALTER FUNCTION private.protect_last_classroom_admin() OWNER TO postgres;
CREATE TRIGGER memberships_protect_last_admin
  BEFORE UPDATE OF role OR DELETE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION private.protect_last_classroom_admin();

GRANT UPDATE (role) ON public.memberships TO authenticated;

DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
CREATE POLICY profiles_update_self_or_admin
  ON public.profiles FOR UPDATE TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.memberships AS target_membership
      WHERE target_membership.user_id = profiles.id
        AND private.has_classroom_role(target_membership.classroom_id, ARRAY['admin']::public.user_role[])
    )
  )
  WITH CHECK (
    id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.memberships AS target_membership
      WHERE target_membership.user_id = profiles.id
        AND private.has_classroom_role(target_membership.classroom_id, ARRAY['admin']::public.user_role[])
    )
  );

DROP POLICY IF EXISTS memberships_insert_student_or_teacher_by_admin ON public.memberships;
CREATE POLICY memberships_insert_by_admin
  ON public.memberships FOR INSERT TO authenticated
  WITH CHECK (
    user_id <> (SELECT auth.uid())
    AND private.has_classroom_role(classroom_id, ARRAY['admin']::public.user_role[])
  );

DROP POLICY IF EXISTS memberships_delete_non_admin_by_admin ON public.memberships;
CREATE POLICY memberships_delete_by_admin
  ON public.memberships FOR DELETE TO authenticated
  USING (
    user_id <> (SELECT auth.uid())
    AND private.has_classroom_role(classroom_id, ARRAY['admin']::public.user_role[])
    AND (role <> 'admin' OR private.has_another_classroom_admin(classroom_id, user_id))
  );

CREATE POLICY memberships_update_role_by_admin
  ON public.memberships FOR UPDATE TO authenticated
  USING (
    user_id <> (SELECT auth.uid())
    AND private.has_classroom_role(classroom_id, ARRAY['admin']::public.user_role[])
    AND (role <> 'admin' OR private.has_another_classroom_admin(classroom_id, user_id))
  )
  WITH CHECK (
    user_id <> (SELECT auth.uid())
    AND private.has_classroom_role(classroom_id, ARRAY['admin']::public.user_role[])
  );

DROP POLICY IF EXISTS contributions_review_by_other_staff ON public.lesson_contributions;
CREATE POLICY contributions_review_by_staff
  ON public.lesson_contributions FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.lessons AS lesson
      WHERE lesson.id = lesson_contributions.lesson_id
        AND private.has_classroom_role(lesson.classroom_id, ARRAY['teacher', 'admin']::public.user_role[])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.lessons AS lesson
      WHERE lesson.id = lesson_contributions.lesson_id
        AND private.has_classroom_role(lesson.classroom_id, ARRAY['teacher', 'admin']::public.user_role[])
    )
  );
CREATE OR REPLACE FUNCTION private.guard_teacher_contribution_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  contribution_classroom_id uuid;
BEGIN
  SELECT lesson.classroom_id INTO contribution_classroom_id
  FROM public.lessons AS lesson
  WHERE lesson.id = OLD.lesson_id;

  IF NOT private.has_classroom_role(contribution_classroom_id, ARRAY['admin']::public.user_role[])
    AND private.has_classroom_role(contribution_classroom_id, ARRAY['teacher']::public.user_role[])
  THEN
    IF OLD.status IN ('approved', 'rejected')
      AND (NEW.status IS DISTINCT FROM OLD.status
        OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
        OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at)
    THEN
      RAISE EXCEPTION 'Teachers cannot alter a completed review.' USING ERRCODE = '42501';
    END IF;
    IF OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected')
      AND (OLD.submitted_by = (SELECT auth.uid())
        OR NEW.reviewed_by IS DISTINCT FROM (SELECT auth.uid())
        OR NEW.reviewed_at IS NULL)
    THEN
      RAISE EXCEPTION 'Teachers may review only another member''s contribution.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.guard_teacher_contribution_update() FROM PUBLIC, anon, authenticated;
ALTER FUNCTION private.guard_teacher_contribution_update() OWNER TO postgres;
CREATE TRIGGER contributions_guard_teacher_review
  BEFORE UPDATE ON public.lesson_contributions
  FOR EACH ROW EXECUTE FUNCTION private.guard_teacher_contribution_update();
CREATE POLICY contributions_delete_by_staff
  ON public.lesson_contributions FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.lessons AS lesson
      WHERE lesson.id = lesson_contributions.lesson_id
        AND private.has_classroom_role(lesson.classroom_id, ARRAY['teacher', 'admin']::public.user_role[])
    )
  );
CREATE POLICY contributions_insert_by_admin
  ON public.lesson_contributions FOR INSERT TO authenticated
  WITH CHECK (
    submitted_by = (SELECT auth.uid())
    AND (
      status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL
      OR status IN ('approved', 'rejected')
        AND reviewed_by = (SELECT auth.uid()) AND reviewed_at IS NOT NULL
    )
    AND EXISTS (
      SELECT 1 FROM public.lessons AS lesson
      WHERE lesson.id = lesson_contributions.lesson_id
        AND private.has_classroom_role(lesson.classroom_id, ARRAY['admin']::public.user_role[])
    )
  );
GRANT INSERT ON public.lesson_contributions TO authenticated;
GRANT UPDATE (content, status, reviewed_by, reviewed_at) ON public.lesson_contributions TO authenticated;
GRANT DELETE ON public.lesson_contributions TO authenticated;

CREATE POLICY progress_update_admin
  ON public.assignment_progress FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assignments AS assignment
      WHERE assignment.id = assignment_progress.assignment_id
        AND private.has_classroom_role(assignment.classroom_id, ARRAY['admin']::public.user_role[])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assignments AS assignment
      WHERE assignment.id = assignment_progress.assignment_id
        AND private.has_classroom_role(assignment.classroom_id, ARRAY['admin']::public.user_role[])
    )
  );
CREATE POLICY progress_insert_admin
  ON public.assignment_progress FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assignments AS assignment
      WHERE assignment.id = assignment_progress.assignment_id
        AND private.has_classroom_role(assignment.classroom_id, ARRAY['admin']::public.user_role[])
    )
  );
CREATE POLICY progress_delete_admin
  ON public.assignment_progress FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assignments AS assignment
      WHERE assignment.id = assignment_progress.assignment_id
        AND private.has_classroom_role(assignment.classroom_id, ARRAY['admin']::public.user_role[])
    )
  );
GRANT DELETE ON public.assignment_progress TO authenticated;
