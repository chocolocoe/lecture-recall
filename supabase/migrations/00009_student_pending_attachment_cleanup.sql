-- Let a student remove only files they uploaded to their own pending note.
-- Files must still have visible matching metadata for Storage RLS to authorize
-- the delete; metadata itself can be removed only after bytes are gone.
ALTER TABLE public.lesson_contributions ADD COLUMN title text;
ALTER TABLE public.lesson_contributions
  ADD CONSTRAINT lesson_contributions_title_check
  CHECK (title IS NULL OR length(btrim(title)) BETWEEN 1 AND 160);
GRANT UPDATE (title) ON public.lesson_contributions TO authenticated;

CREATE POLICY attachments_delete_own_unapproved
  ON public.lesson_attachments FOR DELETE TO authenticated
  USING (
    uploaded_by = (SELECT auth.uid())
    AND contribution_id IS NOT NULL
    AND NOT private.lesson_storage_object_exists(file_path)
    AND EXISTS (
      SELECT 1 FROM public.lesson_contributions AS contribution
      WHERE contribution.id = lesson_attachments.contribution_id
        AND contribution.lesson_id = lesson_attachments.lesson_id
        AND contribution.submitted_by = (SELECT auth.uid())
        AND contribution.status IN ('pending', 'rejected')
    )
  );

DROP POLICY IF EXISTS lecture_recall_attachment_delete ON storage.objects;
CREATE POLICY lecture_recall_attachment_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'lesson-attachments'
    AND EXISTS (
      SELECT 1 FROM public.lesson_attachments AS attachment
      WHERE attachment.file_path = storage.objects.name
        AND (
          private.has_classroom_role(attachment.classroom_id, ARRAY['teacher', 'admin']::public.user_role[])
          OR (
            attachment.uploaded_by = (SELECT auth.uid())
            AND attachment.contribution_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM public.lesson_contributions AS contribution
              WHERE contribution.id = attachment.contribution_id
                AND contribution.lesson_id = attachment.lesson_id
                AND contribution.submitted_by = (SELECT auth.uid())
                AND contribution.status IN ('pending', 'rejected')
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS lecture_recall_attachment_delete_guard ON storage.objects;
CREATE POLICY lecture_recall_attachment_delete_guard
  ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    bucket_id <> 'lesson-attachments'
    OR EXISTS (
      SELECT 1 FROM public.lesson_attachments AS attachment
      WHERE attachment.file_path = storage.objects.name
        AND (
          private.has_classroom_role(attachment.classroom_id, ARRAY['teacher', 'admin']::public.user_role[])
          OR (
            attachment.uploaded_by = (SELECT auth.uid())
            AND attachment.contribution_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM public.lesson_contributions AS contribution
              WHERE contribution.id = attachment.contribution_id
                AND contribution.lesson_id = attachment.lesson_id
                AND contribution.submitted_by = (SELECT auth.uid())
                AND contribution.status IN ('pending', 'rejected')
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS contributions_update_own_pending ON public.lesson_contributions;
CREATE POLICY contributions_update_own_unapproved
  ON public.lesson_contributions FOR UPDATE TO authenticated
  USING (submitted_by = (SELECT auth.uid()) AND status IN ('pending', 'rejected'))
  WITH CHECK (
    submitted_by = (SELECT auth.uid())
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
  );

DROP POLICY IF EXISTS contributions_delete_own_pending ON public.lesson_contributions;
CREATE POLICY contributions_delete_own_unapproved
  ON public.lesson_contributions FOR DELETE TO authenticated
  USING (submitted_by = (SELECT auth.uid()) AND status IN ('pending', 'rejected'));

DROP POLICY IF EXISTS attachments_insert_owner_or_staff ON public.lesson_attachments;
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
          AND contribution.status IN ('pending', 'rejected')
      )
    )
  );
