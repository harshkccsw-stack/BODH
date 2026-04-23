import { Wrapper } from './components/wrapper';
import { LayoutProvider } from './components/context';

export function Layout25({ children }: { children: React.ReactNode }) {
  return (
    <LayoutProvider
      style={{
        '--sidebar-width': '260px',
        '--sidebar-width-mobile': '100px',
        '--header-height': '70px',
        '--header-height-mobile': '60px',
      } as React.CSSProperties}
    >
      <Wrapper>
        {children}
      </Wrapper>
    </LayoutProvider>
  );
}
