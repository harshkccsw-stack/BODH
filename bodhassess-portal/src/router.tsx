import { lazy, Suspense, type ComponentType } from 'react';
import { createBrowserRouter, Navigate, Outlet, type RouteObject } from 'react-router';
import { ScreenLoader } from '@/components/screen-loader';
import { AuthProvider, RequireAuth } from '@/lib/auth';
import { config } from '@/config';

// Mount the auth provider once, above every route, so auth state survives
// navigation. Lives inside the router because RequireAuth uses router hooks.
function Root() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

function lazyPage(loader: () => Promise<{ default: ComponentType }>) {
  const Component = lazy(loader);
  return (
    <Suspense fallback={<ScreenLoader />}>
      <Component />
    </Suspense>
  );
}

const Login = () => lazyPage(() => import('@/pages/login'));
const Register = () => lazyPage(() => import('@/pages/register'));
const RegisterToken = () => lazyPage(() => import('@/pages/register-token'));
const Assessments = () => lazyPage(() => import('@/pages/assessments'));
const Take = () => lazyPage(() => import('@/pages/take/take'));

// Four routes total. The take flow's gates (terms / demographics /
// instructions / questions / completion) are internal steps of the single
// /portal/assessment/:sessionId route — not separate pages.
const routes: RouteObject[] = [
  {
    element: <Root />,
    children: [
      // Public
      { path: '/portal/login', element: <Login /> },
      { path: '/portal/register', element: <Register /> },

      // Self-registration from a shared link. Mounted at the bare /register
      // as well as under /portal, because this is the one URL that gets
      // printed, QR-coded and pasted into messages — the short form is what
      // people will be given, and the /portal form keeps it consistent with
      // every other route here.
      { path: '/register/:token', element: <RegisterToken /> },
      { path: '/portal/register/:token', element: <RegisterToken /> },

      // Authenticated respondent surface
      {
        element: (
          <RequireAuth>
            <Outlet />
          </RequireAuth>
        ),
        children: [
          { path: '/portal/assessment', element: <Assessments /> },
          { path: '/portal/assessment/:sessionId', element: <Take /> },
        ],
      },

      // Entry + catch-all → the list (which bounces anon visitors to login).
      { path: '/', element: <Navigate to="/portal/assessment" replace /> },
      { path: '*', element: <Navigate to="/portal/assessment" replace /> },
    ],
  },
];

export const router = createBrowserRouter(routes, {
  basename: config.basePath || '/',
});
