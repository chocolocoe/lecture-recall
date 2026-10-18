-- Lecture Recall Row Level Security Policies
-- This migration enables RLS and creates security policies for all tables

-- Enable Row Level Security on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE classrooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_progress ENABLE ROW LEVEL SECURITY;

-- Helper function: Check if user is member of classroom with specific role
CREATE OR REPLACE FUNCTION is_classroom_member(classroom_uuid UUID, min_role user_role DEFAULT 'student')
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM memberships
    WHERE classroom_id = classroom_uuid
    AND user_id = auth.uid()
    AND CASE min_role
      WHEN 'admin' THEN role = 'admin'
      WHEN 'teacher' THEN role IN ('admin', 'teacher')
      WHEN 'student' THEN role IN ('admin', 'teacher', 'student')
    END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Profiles policies
-- Users can read their own profile
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Classrooms policies
-- Users can read classrooms they are members of
CREATE POLICY "Members can read their classroom"
  ON classrooms FOR SELECT
  USING (is_classroom_member(id));

-- Only admins can update classroom
CREATE POLICY "Admins can update classroom"
  ON classrooms FOR UPDATE
  USING (is_classroom_member(id, 'admin'));

-- Memberships policies
-- Users can read memberships in their classroom
CREATE POLICY "Members can read classroom memberships"
  ON memberships FOR SELECT
  USING (is_classroom_member(classroom_id));

-- Only admins can manage memberships
CREATE POLICY "Admins can insert memberships"
  ON memberships FOR INSERT
  WITH CHECK (is_classroom_member(classroom_id, 'admin'));

CREATE POLICY "Admins can update memberships"
  ON memberships FOR UPDATE
  USING (is_classroom_member(classroom_id, 'admin'));

CREATE POLICY "Admins can delete memberships"
  ON memberships FOR DELETE
  USING (is_classroom_member(classroom_id, 'admin'));

-- Subjects policies
-- Members can read subjects in their classroom
CREATE POLICY "Members can read classroom subjects"
  ON subjects FOR SELECT
  USING (is_classroom_member(classroom_id));

-- Teachers and admins can manage subjects
CREATE POLICY "Teachers can insert subjects"
  ON subjects FOR INSERT
  WITH CHECK (is_classroom_member(classroom_id, 'teacher'));

CREATE POLICY "Teachers can update subjects"
  ON subjects FOR UPDATE
  USING (is_classroom_member(classroom_id, 'teacher'));

CREATE POLICY "Teachers can delete subjects"
  ON subjects FOR DELETE
  USING (is_classroom_member(classroom_id, 'teacher'));

-- Lessons policies
-- Members can read lessons in their classroom
CREATE POLICY "Members can read classroom lessons"
  ON lessons FOR SELECT
  USING (is_classroom_member(classroom_id));

-- Teachers and admins can manage lessons
CREATE POLICY "Teachers can insert lessons"
  ON lessons FOR INSERT
  WITH CHECK (is_classroom_member(classroom_id, 'teacher'));

CREATE POLICY "Teachers can update lessons"
  ON lessons FOR UPDATE
  USING (is_classroom_member(classroom_id, 'teacher'));

CREATE POLICY "Teachers can delete lessons"
  ON lessons FOR DELETE
  USING (is_classroom_member(classroom_id, 'teacher'));

-- Lesson contributions policies
-- Members can read approved contributions in their classroom
CREATE POLICY "Members can read approved contributions"
  ON lesson_contributions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM lessons
      WHERE lessons.id = lesson_contributions.lesson_id
      AND is_classroom_member(lessons.classroom_id)
    )
    AND (status = 'approved' OR submitted_by = auth.uid())
  );

-- Students can submit contributions
CREATE POLICY "Students can insert contributions"
  ON lesson_contributions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM lessons
      WHERE lessons.id = lesson_id
      AND is_classroom_member(lessons.classroom_id)
    )
    AND submitted_by = auth.uid()
  );

-- Teachers can review contributions
CREATE POLICY "Teachers can update contributions"
  ON lesson_contributions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM lessons
      WHERE lessons.id = lesson_contributions.lesson_id
      AND is_classroom_member(lessons.classroom_id, 'teacher')
    )
  );

-- Lesson attachments policies
-- Members can read attachments for lessons in their classroom
CREATE POLICY "Members can read lesson attachments"
  ON lesson_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM lessons
      WHERE lessons.id = lesson_attachments.lesson_id
      AND is_classroom_member(lessons.classroom_id)
    )
  );

-- Members can upload attachments
CREATE POLICY "Members can insert attachments"
  ON lesson_attachments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM lessons
      WHERE lessons.id = lesson_id
      AND is_classroom_member(lessons.classroom_id)
    )
    AND uploaded_by = auth.uid()
  );

-- Teachers can delete attachments
CREATE POLICY "Teachers can delete attachments"
  ON lesson_attachments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM lessons
      WHERE lessons.id = lesson_attachments.lesson_id
      AND is_classroom_member(lessons.classroom_id, 'teacher')
    )
  );

-- Assignments policies
-- Members can read assignments in their classroom
CREATE POLICY "Members can read classroom assignments"
  ON assignments FOR SELECT
  USING (is_classroom_member(classroom_id));

-- Teachers can manage assignments
CREATE POLICY "Teachers can insert assignments"
  ON assignments FOR INSERT
  WITH CHECK (is_classroom_member(classroom_id, 'teacher'));

CREATE POLICY "Teachers can update assignments"
  ON assignments FOR UPDATE
  USING (is_classroom_member(classroom_id, 'teacher'));

CREATE POLICY "Teachers can delete assignments"
  ON assignments FOR DELETE
  USING (is_classroom_member(classroom_id, 'teacher'));

-- Assignment progress policies
-- Users can read their own progress
CREATE POLICY "Users can read own assignment progress"
  ON assignment_progress FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM assignments
      WHERE assignments.id = assignment_progress.assignment_id
      AND is_classroom_member(assignments.classroom_id, 'teacher')
    )
  );

-- Users can update their own progress
CREATE POLICY "Users can insert own progress"
  ON assignment_progress FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own progress"
  ON assignment_progress FOR UPDATE
  USING (user_id = auth.uid());