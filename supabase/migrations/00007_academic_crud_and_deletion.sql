-- Complete academic record permissions and provide an atomic, scoped delete
-- operation for content with dependent rows. Storage bytes are removed by the
-- authenticated client first, while the metadata still authorizes Storage RLS.

DROP POLICY IF EXISTS contributions_update_own_pending ON public.lesson_contributions;
CREATE POLICY contributions_update_own_pending
  ON public.lesson_contributions FOR UPDATE TO authenticated
  USING (submitted_by = (SELECT auth.uid()) AND status = 'pending')
  WITH CHECK (submitted_by = (SELECT auth.uid()) AND status = 'pending');

CREATE POLICY contributions_delete_own_pending
  ON public.lesson_contributions FOR DELETE TO authenticated
  USING (submitted_by = (SELECT auth.uid()) AND status = 'pending');

CREATE OR REPLACE FUNCTION private.guard_student_contribution_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF OLD.submitted_by = (SELECT auth.uid())
     AND NOT private.has_classroom_role(
       (SELECT lesson.classroom_id FROM public.lessons AS lesson WHERE lesson.id = OLD.lesson_id),
       ARRAY['teacher', 'admin']::public.user_role[]
     ) THEN
    IF NEW.lesson_id IS DISTINCT FROM OLD.lesson_id
       OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
       OR NEW.status IS DISTINCT FROM 'pending'::public.contribution_status
       OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Students may edit only their own pending contribution content.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.guard_student_contribution_update() FROM PUBLIC, anon, authenticated;
ALTER FUNCTION private.guard_student_contribution_update() OWNER TO postgres;
DROP TRIGGER IF EXISTS contributions_guard_student_update ON public.lesson_contributions;
CREATE TRIGGER contributions_guard_student_update
  BEFORE UPDATE ON public.lesson_contributions
  FOR EACH ROW EXECUTE FUNCTION private.guard_student_contribution_update();

-- Single transaction for subject/lesson dependent academic rows. Subject
-- removal deliberately removes lessons, contributions and attachment metadata;
-- assignments survive with their subject/lesson references cleared by FK rules.
CREATE OR REPLACE FUNCTION public.delete_academic_item(p_kind text, p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  target_classroom uuid;
  target_lesson uuid;
BEGIN
  IF p_kind = 'subject' THEN
    SELECT classroom_id INTO target_classroom FROM public.subjects WHERE id = p_id;
  ELSIF p_kind = 'lesson' THEN
    SELECT classroom_id INTO target_classroom FROM public.lessons WHERE id = p_id;
  ELSIF p_kind = 'assignment' THEN
    SELECT classroom_id INTO target_classroom FROM public.assignments WHERE id = p_id;
  ELSIF p_kind = 'contribution' THEN
    SELECT lesson_id INTO target_lesson FROM public.lesson_contributions WHERE id = p_id;
    SELECT classroom_id INTO target_classroom FROM public.lessons WHERE id = target_lesson;
  ELSE
    RAISE EXCEPTION 'Unsupported academic item.' USING ERRCODE = '22023';
  END IF;

  IF target_classroom IS NULL THEN
    RAISE EXCEPTION 'Academic item not found.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT private.has_classroom_role(target_classroom, ARRAY['teacher', 'admin']::public.user_role[]) THEN
    RAISE EXCEPTION 'Classroom teacher or administrator access is required.' USING ERRCODE = '42501';
  END IF;

  IF p_kind = 'subject' AND EXISTS (
    SELECT 1 FROM public.lesson_attachments AS attachment
    JOIN public.lessons AS lesson ON lesson.id = attachment.lesson_id
    WHERE lesson.subject_id = p_id AND private.lesson_storage_object_exists(attachment.file_path)
  ) OR p_kind = 'lesson' AND EXISTS (
    SELECT 1 FROM public.lesson_attachments AS attachment
    WHERE attachment.lesson_id = p_id AND private.lesson_storage_object_exists(attachment.file_path)
  ) OR p_kind = 'contribution' AND EXISTS (
    SELECT 1 FROM public.lesson_attachments AS attachment
    WHERE attachment.contribution_id = p_id AND private.lesson_storage_object_exists(attachment.file_path)
  ) THEN
    RAISE EXCEPTION 'Remove lesson attachment files from private Storage before deleting this item.' USING ERRCODE = '23514';
  END IF;

  IF p_kind = 'subject' THEN
    DELETE FROM public.lesson_attachments AS attachment
      USING public.lessons AS lesson
      WHERE attachment.lesson_id = lesson.id AND lesson.subject_id = p_id;
    DELETE FROM public.lesson_contributions AS contribution
      USING public.lessons AS lesson
      WHERE contribution.lesson_id = lesson.id AND lesson.subject_id = p_id;
    DELETE FROM public.lessons WHERE subject_id = p_id;
    DELETE FROM public.subjects WHERE id = p_id;
  ELSIF p_kind = 'lesson' THEN
    DELETE FROM public.lesson_attachments WHERE lesson_id = p_id;
    DELETE FROM public.lesson_contributions WHERE lesson_id = p_id;
    DELETE FROM public.lessons WHERE id = p_id;
  ELSIF p_kind = 'contribution' THEN
    DELETE FROM public.lesson_attachments WHERE contribution_id = p_id;
    DELETE FROM public.lesson_contributions WHERE id = p_id;
  ELSE
    DELETE FROM public.assignments WHERE id = p_id;
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.delete_academic_item(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_academic_item(text, uuid) TO authenticated;

-- Students may only submit/edit/delete their own progress within their
-- classroom. Staff retains read access and admins may manage progress rows.
DROP POLICY IF EXISTS progress_insert_admin ON public.assignment_progress;
CREATE POLICY progress_insert_own_classroom
  ON public.assignment_progress FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.assignments AS assignment
      WHERE assignment.id = assignment_progress.assignment_id
        AND private.has_classroom_role(assignment.classroom_id, ARRAY['student', 'teacher', 'admin']::public.user_role[])
    )
  );
CREATE POLICY progress_delete_own_or_admin
  ON public.assignment_progress FOR DELETE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.assignments AS assignment
      WHERE assignment.id = assignment_progress.assignment_id
        AND private.has_classroom_role(assignment.classroom_id, ARRAY['admin']::public.user_role[])
    )
  );
