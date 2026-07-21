import { Wrapper } from './components/wrapper';
import { LayoutProvider } from './components/context';

export function Layout35({ children }: { children: React.ReactNode }) {
  return (
    <LayoutProvider
      headerStickyOffset={100}
      style={{
        '--header-height': '90px',
        '--header-height-sticky': '70px',
        '--header-height-mobile': '70px',
      } as React.CSSProperties}
    >
      <Wrapper>
        {children}
      </Wrapper>
    </LayoutProvider>
  );
}
