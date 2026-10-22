-- RLS and the lesson publish trigger provide row-level role and permission
-- checks; this grants only the column needed by the authorized publish UI.
GRANT UPDATE (published) ON public.lessons TO authenticated;
