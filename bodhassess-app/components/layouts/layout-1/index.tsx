import { LayoutProvider } from './components/context';
import { Main } from './components/main';

export function Layout1({ children }: { children: React.ReactNode }) {
  return (
    <LayoutProvider>
      <Main>
        {children}
      </Main>
    </LayoutProvider>
  );
}