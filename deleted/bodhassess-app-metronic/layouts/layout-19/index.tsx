import { Wrapper } from './components/wrapper';
import { LayoutProvider } from './components/context';

export function Layout19({ children }: { children: React.ReactNode }) {
  return (
    <LayoutProvider
      bodyClassName="lg:overflow-hidden"
      style={{
        '--sidebar-width': '240px',
        '--sidebar-width-mobile': '240px',
        '--header-height': '112px',
        '--header-height-mobile': '100px',
      } as React.CSSProperties}
    >
      <Wrapper>
        {children}
      </Wrapper>
    </LayoutProvider>
  );
}
