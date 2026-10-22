ALTER TABLE public.lessons ADD COLUMN published boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.lessons.published IS 'Visible to students when true; existing lessons default to published to preserve current visibility.';

CREATE POLICY permission_gate_published_lessons ON public.lessons AS RESTRICTIVE FOR SELECT TO authenticated USING (
  published OR private.has_classroom_role(classroom_id,ARRAY['teacher','admin']::public.user_role[])
  OR private.has_permission_override(classroom_id,'lessons.view',id)
);

CREATE OR REPLACE FUNCTION private.guard_lesson_scope_and_publish()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF NEW.classroom_id IS DISTINCT FROM OLD.classroom_id OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Lesson classroom and creator cannot be reassigned.' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.subjects s WHERE s.id=NEW.subject_id AND s.classroom_id=NEW.classroom_id) THEN
    RAISE EXCEPTION 'Lesson subject must belong to the same classroom.' USING ERRCODE='23514';
  END IF;
  IF NEW.published IS DISTINCT FROM OLD.published AND NOT private.has_permission(OLD.classroom_id,'lessons.publish',OLD.id) THEN
    RAISE EXCEPTION 'Publish permission is required to change lesson visibility.' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.guard_lesson_scope_and_publish() FROM PUBLIC,anon,authenticated;
ALTER FUNCTION private.guard_lesson_scope_and_publish() OWNER TO postgres;
CREATE TRIGGER lessons_guard_scope_and_publish BEFORE UPDATE ON public.lessons
  FOR EACH ROW EXECUTE FUNCTION private.guard_lesson_scope_and_publish();
