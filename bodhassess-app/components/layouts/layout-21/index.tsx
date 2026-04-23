import { Wrapper } from './components/wrapper';
import { LayoutProvider } from './components/context';

export function Layout21({ children }: { children: React.ReactNode }) {
  return (
    <LayoutProvider
      bodyClassName="lg:bg-muted lg:[&_.container-fluid]:px-7.5 lg:overflow-hidden"
      style={{
        '--page-margin': '10px',
        '--sidebar-width': '300px',
        '--sidebar-collapsed-width': '60px',
        '--sidebar-header-height': '54px',
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
