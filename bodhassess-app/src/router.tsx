import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  type RouteObject,
} from 'react-router';
import { ScreenLoader } from '@/components/screen-loader';

type PageModule = { default: ComponentType };
type LayoutModule = { default: ComponentType<{ children: ReactNode }> };

const pageLoaders = import.meta.glob<PageModule>('/app/**/page.tsx');
const layoutLoaders = import.meta.glob<LayoutModule>('/app/**/layout.tsx');

function fsPathToUrl(fsPath: string): string {
  const url = fsPath
    .replace(/^\/app/, '')
    .replace(/\/page\.tsx$/, '')
    .replace(/\/\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]/g, ':$1');
  return url || '/';
}

function layoutKeyForPage(pageKey: string): string | null {
  // Find the nearest layout.tsx that is an ancestor of this page.tsx
  // We prefer the deepest ancestor layout.
  const pageDir = pageKey.replace(/\/page\.tsx$/, '');
  const candidates = Object.keys(layoutLoaders)
    .map((k) => ({ key: k, dir: k.replace(/\/layout\.tsx$/, '') }))
    .filter(({ dir }) => pageDir === dir || pageDir.startsWith(dir + '/'))
    .sort((a, b) => b.dir.length - a.dir.length);
  return candidates[0]?.key ?? null;
}

function LazyPage({ loader }: { loader: () => Promise<PageModule> }) {
  const Component = lazy(loader);
  return (
    <Suspense fallback={<ScreenLoader />}>
      <Component />
    </Suspense>
  );
}

function LazyLayoutWrapper({
  loader,
}: {
  loader: () => Promise<LayoutModule>;
}) {
  const Component = lazy(async () => {
    const mod = await loader();
    const Layout = mod.default;
    const Wrapper = () => (
      <Layout>
        <Outlet />
      </Layout>
    );
    return { default: Wrapper };
  });
  return (
    <Suspense fallback={<ScreenLoader />}>
      <Component />
    </Suspense>
  );
}

// Build a layout tree: group pages by their chain of ancestor layouts.
type Node = {
  layoutKey: string | null; // null for leaf pages with no wrapping layout
  path?: string;
  element?: ReactNode;
  children: Node[];
};

function buildRoutes(): RouteObject[] {
  // Build an ordered list of (pageKey, url, [ancestorLayoutKeys from root down])
  const entries = Object.keys(pageLoaders).map((pageKey) => {
    const url = fsPathToUrl(pageKey);
    const pageDir = pageKey.replace(/\/page\.tsx$/, '');
    const ancestors = Object.keys(layoutLoaders)
      .map((k) => ({ key: k, dir: k.replace(/\/layout\.tsx$/, '') }))
      .filter(({ dir }) => pageDir === dir || pageDir.startsWith(dir + '/'))
      .sort((a, b) => a.dir.length - b.dir.length)
      .map(({ key }) => key);
    return { pageKey, url, ancestors };
  });

  // Root node groups top-level routes
  const root: RouteObject[] = [];

  function insert(
    bucket: RouteObject[],
    ancestors: string[],
    pageKey: string,
    url: string,
    usedLayouts: Map<string, RouteObject>,
  ) {
    if (ancestors.length === 0) {
      bucket.push({
        path: url,
        element: (
          <LazyPage loader={pageLoaders[pageKey]} />
        ),
      });
      return;
    }
    const [next, ...rest] = ancestors;
    let layoutRoute = usedLayouts.get(next);
    if (!layoutRoute) {
      layoutRoute = {
        element: (
          <LazyLayoutWrapper loader={layoutLoaders[next]} />
        ),
        children: [],
      };
      usedLayouts.set(next, layoutRoute);
      bucket.push(layoutRoute);
    }
    const childMap = (layoutRoute as { _usedLayouts?: Map<string, RouteObject> })
      ._usedLayouts ?? new Map<string, RouteObject>();
    (layoutRoute as { _usedLayouts?: Map<string, RouteObject> })._usedLayouts =
      childMap;
    insert(layoutRoute.children as RouteObject[], rest, pageKey, url, childMap);
  }

  const topLevelLayouts = new Map<string, RouteObject>();
  for (const { pageKey, url, ancestors } of entries) {
    insert(root, ancestors, pageKey, url, topLevelLayouts);
  }

  // Clean up internal tracking properties
  function cleanup(routes: RouteObject[]) {
    for (const r of routes) {
      delete (r as { _usedLayouts?: unknown })._usedLayouts;
      if (r.children) cleanup(r.children as RouteObject[]);
    }
  }
  cleanup(root);

  // Add a catch-all that redirects unknown URLs to /dashboard
  root.push({ path: '*', element: <Navigate to="/dashboard" replace /> });

  return root;
}

export const router = createBrowserRouter(buildRoutes(), {
  basename: import.meta.env.VITE_BASE_PATH || '/',
});
