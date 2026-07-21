import { Wrapper } from './components/wrapper';
import { LayoutProvider } from './components/context';

export function Layout22({ children }: { children: React.ReactNode }) {
  return (
    <LayoutProvider
      headerStickyOffset={100}
      style={{
        '--header-height': '124px',
        '--header-height-sticky': '70px',
        '--header-height-mobile': '124px',
      } as React.CSSProperties}
    >
      <Wrapper>
        {children}
      </Wrapper>
    </LayoutProvider>
  );
}
