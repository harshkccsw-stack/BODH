import { Suspense } from 'react';
import { RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { ScreenLoader } from '@/components/screen-loader';
import { router } from './router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, staleTime: 30_000 },
  },
});

export default function App() {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      storageKey="bodhassess-theme"
      enableSystem
      disableTransitionOnChange
      enableColorScheme
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={0}>
          <Suspense fallback={<ScreenLoader />}>
            <RouterProvider router={router} />
          </Suspense>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
