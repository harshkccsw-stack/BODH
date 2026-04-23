import { Wrapper } from './components/wrapper';
import { LayoutProvider } from './components/context';

export function Layout27({ children }: { children: React.ReactNode }) {
  return (
    <LayoutProvider
      style={{
        '--header-height': '60px',
        '--sidebar-width': '60px',
        '--sidebar-menu-width': '300px',
      } as React.CSSProperties}
    >
      <Wrapper>
        {children}
      </Wrapper>
    </LayoutProvider>
  );
}
