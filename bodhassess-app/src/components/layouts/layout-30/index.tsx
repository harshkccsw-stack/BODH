import { Wrapper } from './components/wrapper';
import { LayoutProvider } from './components/context';

export function Layout30({ children }: { children: React.ReactNode }) {
  return (
    <LayoutProvider
      style={{
        '--header-height': '60px',
        '--sidebar-width': '60px',
        '--sidebar-menu-width': '240px',
      } as React.CSSProperties}
    >
      <Wrapper>
        {children}
      </Wrapper>
    </LayoutProvider>
  );
}
