export type PermissionKey =
  | 'subjects.view' | 'subjects.create' | 'subjects.edit' | 'subjects.delete'
  | 'lessons.view' | 'lessons.create' | 'lessons.edit' | 'lessons.delete' | 'lessons.publish'
  | 'contributions.view' | 'contributions.create' | 'contributions.edit' | 'contributions.delete' | 'contributions.review' | 'contributions.approve' | 'contributions.reject'
  | 'attachments.view' | 'attachments.upload' | 'attachments.replace' | 'attachments.delete'
  | 'assignments.view' | 'assignments.create' | 'assignments.edit' | 'assignments.delete' | 'assignments.manage_deadlines'
  | 'progress.view_own' | 'progress.view_classroom' | 'progress.create' | 'progress.edit_own' | 'progress.manage'
  | 'members.view' | 'members.create' | 'members.edit' | 'members.delete' | 'members.change_roles' | 'members.reset_passwords'
  | 'classroom.view' | 'classroom.manage_settings'
  | 'permissions.view' | 'permissions.grant' | 'permissions.revoke' | 'permissions.manage_templates'

export type PermissionCategory = 'Subjects' | 'Lessons' | 'Notes' | 'Attachments' | 'Assignments' | 'Submissions' | 'Members' | 'Classroom' | 'Permissions'
export type PermissionDefinition = { key: PermissionKey; category: PermissionCategory; label: string; description: string; sensitive?: boolean; adminOnly?: boolean }

export const permissionRegistry: PermissionDefinition[] = [
  { key: 'subjects.view', category: 'Subjects', label: 'View subjects', description: 'Read classroom subjects' },
  { key: 'subjects.create', category: 'Subjects', label: 'Create subjects', description: 'Create classroom subjects' },
  { key: 'subjects.edit', category: 'Subjects', label: 'Edit subjects', description: 'Edit classroom subjects' },
  { key: 'subjects.delete', category: 'Subjects', label: 'Delete subjects', description: 'Delete subjects and dependent academic content', sensitive: true },
  { key: 'lessons.view', category: 'Lessons', label: 'View lessons', description: 'Read classroom lessons' },
  { key: 'lessons.create', category: 'Lessons', label: 'Create lessons', description: 'Create lessons' },
  { key: 'lessons.edit', category: 'Lessons', label: 'Edit lessons', description: 'Edit lessons' },
  { key: 'lessons.delete', category: 'Lessons', label: 'Delete lessons', description: 'Delete lessons and dependent records', sensitive: true },
  { key: 'lessons.publish', category: 'Lessons', label: 'Publish lessons', description: 'Publish and unpublish lessons', sensitive: true },
  { key: 'contributions.view', category: 'Notes', label: 'View contributions', description: 'Read notes allowed by their visibility rules' },
  { key: 'contributions.create', category: 'Notes', label: 'Submit contributions', description: 'Submit a student note for review' },
  { key: 'contributions.edit', category: 'Notes', label: 'Edit contributions', description: 'Edit permitted own note content' },
  { key: 'contributions.delete', category: 'Notes', label: 'Delete contributions', description: 'Delete contributions', sensitive: true },
  { key: 'contributions.review', category: 'Notes', label: 'Review contributions', description: 'Review notes from other members', sensitive: true },
  { key: 'contributions.approve', category: 'Notes', label: 'Approve contributions', description: 'Approve notes from other members', sensitive: true },
  { key: 'contributions.reject', category: 'Notes', label: 'Reject contributions', description: 'Reject notes from other members', sensitive: true },
  { key: 'attachments.view', category: 'Attachments', label: 'View attachments', description: 'Read attachments allowed by resource visibility' },
  { key: 'attachments.upload', category: 'Attachments', label: 'Upload attachments', description: 'Upload files to permitted classroom resources' },
  { key: 'attachments.replace', category: 'Attachments', label: 'Replace attachments', description: 'Replace attachments on permitted resources' },
  { key: 'attachments.delete', category: 'Attachments', label: 'Delete attachments', description: 'Delete attachment files and metadata', sensitive: true },
  { key: 'assignments.view', category: 'Assignments', label: 'View assignments', description: 'Read classroom assignments' },
  { key: 'assignments.create', category: 'Assignments', label: 'Create assignments', description: 'Create assignments' },
  { key: 'assignments.edit', category: 'Assignments', label: 'Edit assignments', description: 'Edit assignments and due dates' },
  { key: 'assignments.delete', category: 'Assignments', label: 'Delete assignments', description: 'Delete assignments and progress', sensitive: true },
  { key: 'assignments.manage_deadlines', category: 'Assignments', label: 'Manage deadlines', description: 'Change assignment due dates' },
  { key: 'progress.view_own', category: 'Submissions', label: 'View own progress', description: 'Read own assignment progress' },
  { key: 'progress.view_classroom', category: 'Submissions', label: 'View classroom progress', description: 'Read student assignment submissions' },
  { key: 'progress.create', category: 'Submissions', label: 'Submit progress', description: 'Create assignment responses' },
  { key: 'progress.edit_own', category: 'Submissions', label: 'Edit own progress', description: 'Edit own assignment responses' },
  { key: 'progress.manage', category: 'Submissions', label: 'Manage progress', description: 'Manage student progress records', sensitive: true },
  { key: 'members.view', category: 'Members', label: 'View members', description: 'View the classroom directory' },
  { key: 'members.create', category: 'Members', label: 'Create members', description: 'Create classroom accounts', sensitive: true, adminOnly: true },
  { key: 'members.edit', category: 'Members', label: 'Edit members', description: 'Edit member profiles', sensitive: true, adminOnly: true },
  { key: 'members.delete', category: 'Members', label: 'Delete members', description: 'Delete classroom accounts', sensitive: true, adminOnly: true },
  { key: 'members.change_roles', category: 'Members', label: 'Change roles', description: 'Change classroom roles', sensitive: true, adminOnly: true },
  { key: 'members.reset_passwords', category: 'Members', label: 'Reset passwords', description: 'Set a member temporary password', sensitive: true, adminOnly: true },
  { key: 'classroom.view', category: 'Classroom', label: 'View classroom', description: 'View classroom details' },
  { key: 'classroom.manage_settings', category: 'Classroom', label: 'Manage settings', description: 'Edit classroom settings', sensitive: true, adminOnly: true },
  { key: 'permissions.view', category: 'Permissions', label: 'View permissions', description: 'View assigned and effective permissions', sensitive: true, adminOnly: true },
  { key: 'permissions.grant', category: 'Permissions', label: 'Grant permissions', description: 'Grant individual permissions', sensitive: true, adminOnly: true },
  { key: 'permissions.revoke', category: 'Permissions', label: 'Revoke permissions', description: 'Revoke permission overrides', sensitive: true, adminOnly: true },
  { key: 'permissions.manage_templates', category: 'Permissions', label: 'Manage templates', description: 'Manage role defaults', sensitive: true, adminOnly: true },
]

export type PermissionEffect = 'allow' | 'deny'
export type PermissionOverride = { permission: PermissionKey; effect: PermissionEffect; resourceId?: string | null }
