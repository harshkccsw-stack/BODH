import { Wrapper } from './components/wrapper';
import { LayoutProvider } from './components/context';

export function Layout32({ children }: { children: React.ReactNode }) {
  return (
    <LayoutProvider
      headerStickyOffset={100}
      style={{
        '--header-height': '60px',
        '--header-height-sticky': '60px',
        '--header-height-mobile': '60px',
      } as React.CSSProperties}
    >
      <Wrapper>
        {children}
      </Wrapper>
    </LayoutProvider>
  );
}
