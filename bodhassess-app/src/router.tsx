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

// Stable lazy components per loader. Must NOT be created inside a render —
// otherwise every parent re-render produces a new component identity, which
// makes React unmount the subtree and re-trigger Suspense on every navigation.
const lazyPages = new Map<string, ComponentType>();
for (const key of Object.keys(pageLoaders)) {
  lazyPages.set(key, lazy(pageLoaders[key]));
}

const lazyLayouts = new Map<string, ComponentType>();
for (const key of Object.keys(layoutLoaders)) {
  lazyLayouts.set(
    key,
    lazy(async () => {
      const mod = await layoutLoaders[key]();
      const Layout = mod.default;
      const Wrapper = () => (
        <Layout>
          <Outlet />
        </Layout>
      );
      return { default: Wrapper };
    }),
  );
}

function fsPathToUrl(fsPath: string): string {
  const url = fsPath
    .replace(/^\/app/, '')
    .replace(/\/page\.tsx$/, '')
    .replace(/\/\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]/g, ':$1');
  return url || '/';
}

function PageElement({ pageKey }: { pageKey: string }) {
  const Component = lazyPages.get(pageKey)!;
  return (
    <Suspense fallback={<ScreenLoader />}>
      <Component />
    </Suspense>
  );
}

function LayoutElement({ layoutKey }: { layoutKey: string }) {
  const Component = lazyLayouts.get(layoutKey)!;
  return (
    <Suspense fallback={<ScreenLoader />}>
      <Component />
    </Suspense>
  );
}

function buildRoutes(): RouteObject[] {
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
        element: <PageElement pageKey={pageKey} />,
      });
      return;
    }
    const [next, ...rest] = ancestors;
    let layoutRoute = usedLayouts.get(next);
    if (!layoutRoute) {
      layoutRoute = {
        element: <LayoutElement layoutKey={next} />,
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

  function cleanup(routes: RouteObject[]) {
    for (const r of routes) {
      delete (r as { _usedLayouts?: unknown })._usedLayouts;
      if (r.children) cleanup(r.children as RouteObject[]);
    }
  }
  cleanup(root);

  root.push({ path: '*', element: <Navigate to="/dashboard" replace /> });

  return root;
}

export const router = createBrowserRouter(buildRoutes(), {
  basename: import.meta.env.VITE_BASE_PATH || '/',
});
