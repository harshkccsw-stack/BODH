// The list of pages a role can grant, derived from MENU_SIDEBAR rather than
// hand-written. Typing paths free-hand was the old way and it rots silently:
// "/admin/practitioner" (missing the s) grants nothing and nobody finds out
// until someone complains they cannot see the page.
//
// Each section offers two granularities, which is why the shape carries both:
//   prefix — one tick for the whole section ("/admin/*"), derived from the
//            deepest path segment its children share. Null when the children
//            do not share one (Questionnaire Library mixes /questionnaires
//            with /question-bank/create), and the section is then leaf-only.
//   pages  — the exact paths, for finer control.
//
// Routes that take a parameter cannot appear as themselves — a stored
// "/assessments/edit" never matches "/assessments/edit/7" — so the sections
// that own them are listed in EXTRA_SECTIONS as prefixes.

import { MENU_SIDEBAR } from '@/config/bodhassess.config';
import type { MenuConfig, MenuItem } from '@/config/types';
import { isSuperAdminOnlyPath } from '@/lib/practitioner-auth-utils';

export interface CatalogPage {
  label: string;
  path: string;
}

export interface CatalogSection {
  label: string;
  /** One tick for everything below, e.g. "/admin/*". Null when not derivable. */
  prefix: string | null;
  pages: CatalogPage[];
}

/** The deepest directory every path shares, as a wildcard — or null. */
function sharedPrefix(paths: string[]): string | null {
  if (paths.length === 0) return null;
  const split = paths.map((p) => p.split('/').filter(Boolean));
  const first = split[0];
  let shared = 0;
  for (let i = 0; i < first.length; i++) {
    // A path that IS the candidate directory (/questionnaires alongside
    // /questionnaires/demographics) still shares it — the wildcard matcher
    // treats "/x/*" as covering "/x" itself.
    if (split.every((segs) => segs[i] === first[i])) shared = i + 1;
    else break;
  }
  if (shared === 0) return null;
  return '/' + first.slice(0, shared).join('/') + '/*';
}

/** Menu leaves worth offering: has a path, and is not superadmin-reserved. */
function grantablePages(items: MenuConfig): CatalogPage[] {
  const out: CatalogPage[] = [];
  const walk = (list: MenuConfig) => {
    for (const item of list) {
      if (item.children) walk(item.children);
      else if (item.path && item.title && !isSuperAdminOnlyPath(item.path)) {
        out.push({ label: item.title, path: item.path });
      }
    }
  };
  walk(items);
  return out;
}

/**
 * Sections built from the sidebar. A menu group becomes one section; loose
 * top-level entries are collected under the heading that precedes them, so
 * "Dashboard", "Organizations" and the rest still have a home.
 */
function buildMenuSections(): CatalogSection[] {
  const sections: CatalogSection[] = [];
  let heading = 'General';
  let loose: CatalogPage[] = [];

  const flushLoose = () => {
    if (loose.length === 0) return;
    sections.push({ label: heading, prefix: null, pages: loose });
    loose = [];
  };

  for (const item of MENU_SIDEBAR as MenuItem[]) {
    if (item.heading) {
      flushLoose();
      heading = item.heading;
      continue;
    }
    if (item.children) {
      const pages = grantablePages(item.children);
      if (pages.length === 0) continue;
      flushLoose();
      sections.push({
        label: item.title ?? heading,
        prefix: sharedPrefix(pages.map((p) => p.path)),
        pages,
      });
      continue;
    }
    if (item.path && item.title && !isSuperAdminOnlyPath(item.path)) {
      loose.push({ label: item.title, path: item.path });
    }
  }
  flushLoose();
  return sections;
}

/**
 * Pages the sidebar does not list but routes still serve — the assessment
 * workflow (every one of whose screens takes an id), Data Studio workbooks,
 * and the vertical suites, which are only reachable from the mega menu.
 * Prefixes, because their children are parameterised.
 */
const EXTRA_SECTIONS: CatalogSection[] = [
  {
    label: 'Not in the menu',
    prefix: null,
    pages: [
      { label: 'Assessment workflow (edit, invite, respondents, take)', path: '/assessments/*' },
      { label: 'Data Studio workbooks', path: '/data-studio/*' },
      { label: 'Clinical psychology', path: '/clinical/*' },
      { label: 'Counselling & child', path: '/counselling/*' },
      { label: 'Industrial psychology', path: '/industrial/*' },
      { label: 'Designing experiments', path: '/experiments/*' },
      { label: 'Every page (full dashboard access)', path: '/*' },
    ],
  },
];

export const PAGE_CATALOG: CatalogSection[] = [...buildMenuSections(), ...EXTRA_SECTIONS];

/** Every path the catalog offers — used to flag stored paths it cannot explain. */
export const CATALOG_PATHS: string[] = PAGE_CATALOG.flatMap((s) => [
  ...(s.prefix ? [s.prefix] : []),
  ...s.pages.map((p) => p.path),
]);

/** Human label for a stored path, falling back to the path itself. */
export function labelForPath(path: string): string {
  for (const section of PAGE_CATALOG) {
    if (section.prefix === path) return `All ${section.label}`;
    const page = section.pages.find((p) => p.path === path);
    if (page) return page.label;
  }
  return path;
}
