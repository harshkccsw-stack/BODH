import { Wrapper } from './components/wrapper';
import { LayoutProvider } from './components/context';

export function Layout38({ children }: { children: React.ReactNode }) {
  return (
    <LayoutProvider
      bodyClassName="bg-muted"
      style={{
        '--sidebar-width': '255px',
        '--sidebar-header-height': '60px',
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
