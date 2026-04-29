import { Wrapper } from './components/wrapper';
import { LayoutProvider } from './components/context';

export function Layout13({ children }: { children: React.ReactNode }) {
  return (
    <LayoutProvider
      style={{
        '--sidebar-width': '240px',
        '--sidebar-right-width': '320px',
        '--sidebar-header-height': '60px',
        '--sidebar-width-mobile': '240px',
        '--header-height': '54px',
        '--header-height-mobile': '54px',
      } as React.CSSProperties}
    >
      <Wrapper>
        {children}
      </Wrapper>
    </LayoutProvider>
  );
}
