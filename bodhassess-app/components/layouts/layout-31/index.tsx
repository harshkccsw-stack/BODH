import { Wrapper } from './components/wrapper';
import { LayoutProvider } from './components/context';

export function Layout31({ children }: { children: React.ReactNode }) {
  return (
    <LayoutProvider
      bodyClassName="lg:overflow-hidden"
      style={{
        '--sidebar-width': '60px',
        '--sidebar-width-mobile': '60px',
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
