import { createBrowserRouter, RouterProvider } from 'react-router'
import { AppShell } from './layout/AppShell.tsx'
import { MapLayout } from './layout/MapLayout.tsx'
import { DashboardPage } from './pages/DashboardPage.tsx'
import { NotFoundPage } from './pages/NotFoundPage.tsx'
import { RestroomFormPage } from './pages/RestroomFormPage.tsx'
import { RestroomPage } from './pages/RestroomPage.tsx'
import { SearchPage } from './pages/SearchPage.tsx'
import { ResetPasswordPage, SignInPage, SignUpPage } from './pages/AuthPages.tsx'

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      {
        element: <MapLayout />,
        children: [
          { index: true, element: <SearchPage /> },
          { path: 'restroom/:id', element: <RestroomPage /> },
          { path: 'restroom/:id/edit', element: <RestroomFormPage /> },
          { path: 'add', element: <RestroomFormPage /> },
        ],
      },
      { path: 'signin', element: <SignInPage /> },
      { path: 'signup', element: <SignUpPage /> },
      { path: 'reset-password', element: <ResetPasswordPage /> },
      { path: 'dashboard/*', element: <DashboardPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
