import { Wrapper } from './components/wrapper';
import { LayoutProvider } from './components/context';

export function Layout18({ children }: { children: React.ReactNode }) {
  return (
    <LayoutProvider
      bodyClassName="bg-muted lg:overflow-hidden"
      style={{
        '--sidebar-width': '260px',
        '--sidebar-width-mobile': '260px',
        '--header-height': '136px',
        '--header-height-mobile': '108px',
      } as React.CSSProperties}
    >
      <Wrapper>
        {children}
      </Wrapper>
    </LayoutProvider>
  );
}
