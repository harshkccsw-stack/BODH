import { Layout1 } from '@/components/layouts/layout-1';
import { ReactNode, useEffect, useState } from 'react';
import { ScreenLoader } from '@/components/screen-loader';

export default function AppLayout({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return <ScreenLoader />;
  }

  return <Layout1>{children}</Layout1>;
}
