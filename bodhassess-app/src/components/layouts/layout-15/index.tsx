import { LayoutProvider } from './components/layout-context';
import { MAIN_NAV } from '@/config/layout-15.config';
import { Layout } from './components/layout';

export function Layout15({ children }: { children: React.ReactNode }) {
  return (
    <LayoutProvider sidebarNavItems={MAIN_NAV}>
      <Layout>
        {children}
      </Layout>
    </LayoutProvider>
  );
}
