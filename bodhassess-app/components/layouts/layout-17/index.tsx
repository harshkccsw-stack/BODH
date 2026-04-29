import { Wrapper } from './components/wrapper';
import { LayoutProvider } from './components/context';

export function Layout17({ children }: { children: React.ReactNode }) {
  return (
    <LayoutProvider
      style={{
        '--sidebar-width': '80px',
        '--header-height': '80px',
        '--header-height-mobile': '60px',
      } as React.CSSProperties}
    >
      <Wrapper>
        {children}
      </Wrapper>
    </LayoutProvider>
  );
}
