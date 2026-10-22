-- Prevent a member from moving their own progress record to an assignment
-- outside the classroom where they hold a membership.
DROP POLICY IF EXISTS "Users can update own progress" ON public.assignment_progress;
CREATE POLICY progress_update_own_classroom
  ON public.assignment_progress FOR UPDATE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.assignments AS assignment
      WHERE assignment.id = assignment_progress.assignment_id
        AND private.has_classroom_role(assignment.classroom_id, ARRAY['student', 'teacher', 'admin']::public.user_role[])
    )
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.assignments AS assignment
      WHERE assignment.id = assignment_progress.assignment_id
        AND private.has_classroom_role(assignment.classroom_id, ARRAY['student', 'teacher', 'admin']::public.user_role[])
    )
  );
