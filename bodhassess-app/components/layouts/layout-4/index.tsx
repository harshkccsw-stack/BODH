import { LayoutProvider } from '@/components/layouts/layout-1/components/context';
import { Main } from './components/main';

export function Layout4({ children }: { children: React.ReactNode }) {
  return (
    <>
      <LayoutProvider>
        <Main>
          {children}
        </Main>
      </LayoutProvider>
    </>
  );
}
