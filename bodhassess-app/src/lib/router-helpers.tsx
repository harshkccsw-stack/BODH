// Thin React-Router wrappers used throughout the app. Names match what
// most React-Router examples use; the only "translation" we do is for the
// historical Link API (which used `href` like a Next.js Link). Everything
// else just re-exports react-router primitives.

import { forwardRef, type AnchorHTMLAttributes, type ReactNode } from 'react';
import {
  Link as RouterLink,
  useLocation,
  useNavigate,
  useSearchParams as useRouterSearchParams,
  useParams as useRouterParams,
} from 'react-router';

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string | { pathname: string; query?: Record<string, string> };
  replace?: boolean;
  scroll?: boolean;
  prefetch?: boolean;
  children?: ReactNode;
};

function resolveHref(href: LinkProps['href']): string {
  if (typeof href === 'string') return href;
  const qs = href.query
    ? '?' + new URLSearchParams(href.query).toString()
    : '';
  return href.pathname + qs;
}

const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, replace, scroll: _scroll, prefetch: _prefetch, ...rest },
  ref,
) {
  return <RouterLink ref={ref} to={resolveHref(href)} replace={replace} {...rest} />;
});

export default Link;
export { Link };

/** Return only the pathname portion of the current location. */
export function usePathname(): string {
  return useLocation().pathname;
}

/** Returns the URLSearchParams object (read-only convenience over react-router's tuple). */
export function useSearchParams(): URLSearchParams {
  const [sp] = useRouterSearchParams();
  return sp;
}

/** Typed wrapper around react-router's useParams. */
export function useParams<T extends Record<string, string | undefined> = Record<string, string | undefined>>(): T {
  return useRouterParams() as T;
}

/** Imperative-navigation helpers in a small object — matches the API many of
 *  our pages already call (push/replace/back/forward/refresh). */
export function useRouter() {
  const navigate = useNavigate();
  return {
    push: (to: string) => navigate(to),
    replace: (to: string) => navigate(to, { replace: true }),
    back: () => navigate(-1),
    forward: () => navigate(1),
    refresh: () => window.location.reload(),
    prefetch: (_to: string) => {},
  };
}

/** Hard-redirect via window.location (useful in event handlers / API errors). */
export function redirect(to: string): never {
  window.location.replace(to);
  throw new Error(`REDIRECT:${to}`);
}

export function notFound(): never {
  throw new Error('NOT_FOUND');
}
