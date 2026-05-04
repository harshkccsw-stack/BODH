import { Outlet } from 'react-router';
import { Layout1 } from '@/components/layouts/layout-1';

// AppShell wraps the practitioner-dashboard layout (sidebar, header, footer,
// etc.) and renders the matched child route inside it via <Outlet />.
//
// Auth is handled separately by <PrivateRoute>; this component is purely
// presentational chrome.
export function AppShell() {
  return (
    <Layout1>
      <Outlet />
    </Layout1>
  );
}
