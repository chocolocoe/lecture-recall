import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { AssignmentsPage } from '@/features/assignments/AssignmentsPage'
import { ClassroomPage } from '@/features/classrooms/ClassroomPage'
import { ContributionsPage } from '@/features/contributions/ContributionsPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { LoginPage } from '@/features/auth/LoginPage'
import { ProtectedRoute } from '@/features/auth/ProtectedRoute'
import { MembersPage } from '@/features/members/MembersPage'
import { LessonDetailPage } from '@/features/lessons/LessonDetailPage'
import { LessonsPage } from '@/features/lessons/LessonsPage'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { ProfilePage } from '@/features/profile/ProfilePage'
import { ThemeProvider } from '@/features/settings/ThemeProvider'

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute><Layout>{children}</Layout></ProtectedRoute>
}

export default function App() {
  return <BrowserRouter><AuthProvider><ThemeProvider><Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/" element={<ProtectedLayout><DashboardPage /></ProtectedLayout>} />
    <Route path="/lessons" element={<ProtectedLayout><LessonsPage /></ProtectedLayout>} />
    <Route path="/lessons/:lessonId" element={<ProtectedLayout><LessonDetailPage /></ProtectedLayout>} />
    <Route path="/assignments" element={<ProtectedLayout><AssignmentsPage /></ProtectedLayout>} />
    <Route path="/contributions" element={<ProtectedLayout><ContributionsPage /></ProtectedLayout>} />
    <Route path="/classroom" element={<ProtectedLayout><ClassroomPage /></ProtectedLayout>} />
    <Route path="/members" element={<ProtectedLayout><MembersPage /></ProtectedLayout>} />
    <Route path="/profile" element={<ProtectedLayout><ProfilePage /></ProtectedLayout>} />
    <Route path="/settings" element={<Navigate to="/" replace />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></ThemeProvider></AuthProvider></BrowserRouter>
}
