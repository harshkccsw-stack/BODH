import { Wrapper } from './components/wrapper';
import { LayoutProvider } from './components/context';

export function Layout34({ children }: { children: React.ReactNode }) {
  return (
    <LayoutProvider
      style={{
        '--sidebar-width': '240px',
        '--sidebar-collapsed-width': '0',
        '--header-height': '60px',
        '--header-height-mobile': '60px',
      } as React.CSSProperties}
    >
      <Wrapper>
        {children}
      </Wrapper>
    </LayoutProvider>
  );
}
