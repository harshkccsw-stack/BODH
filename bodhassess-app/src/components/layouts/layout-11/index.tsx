import { Wrapper } from './components/wrapper';
import { LayoutProvider } from './components/context';

export function Layout11({ children }: { children: React.ReactNode }) {
  return (
    <LayoutProvider
      bodyClassName="bg-muted overflow-hidden"
      style={{
        '--sidebar-width': '240px',
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
