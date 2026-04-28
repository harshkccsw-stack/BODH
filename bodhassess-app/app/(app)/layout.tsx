import { Layout1 } from '@/components/layouts/layout-1';
import { ReactNode } from 'react';

export default function AppLayout({ children }: { children: ReactNode }) {
  return <Layout1>{children}</Layout1>;
}
