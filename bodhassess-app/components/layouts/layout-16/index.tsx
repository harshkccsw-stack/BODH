import { Wrapper } from './components/wrapper';
import { LayoutProvider } from './components/context';

export function Layout16({ children }: { children: React.ReactNode }) {
  return (
    <LayoutProvider
      style={{
        '--sidebar-width': '350px',
        '--sidebar-collapsed-width': '70px',
        '--sidebar-header-height': '54px',
        '--header-height': '80px',
        '--header-height-mobile': '60px',
        '--toolbar-height': '0px',
      } as React.CSSProperties}
    >
      <Wrapper>
        {children}
      </Wrapper>
    </LayoutProvider>
  );
}
