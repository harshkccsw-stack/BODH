import { Wrapper } from './components/wrapper';
import { LayoutProvider } from './components/context';

export function Layout23({ children }: { children: React.ReactNode }) {
  return (
    <LayoutProvider
      bodyClassName="bg-zinc-950 lg:overflow-hidden"
      style={{
        '--sidebar-width': '240px',
        '--sidebar-width-mobile': '100px',
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
