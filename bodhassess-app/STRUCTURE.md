# bodhassess-app — Proposed Restructure

Status: **implemented (all 4 phases, 2026-07-21).** Every phase ended with a
clean `npm run typecheck && npm run build`. Deviations from the original
proposal, found during execution:

- `config/types.ts` exists and is live — kept alongside the three configs.
- `components/data-grid/` stayed shared (imported by both the admin
  data-grid page and data-studio's SheetView), so it was NOT colocated.
- Phase 4 colocated `components/data-studio` → `pages/data-studio/components`
  AND `lib/data-studio` → `pages/data-studio/lib` (its only importer was
  data-studio's own useDerivedColumns).

The sections below are the original proposal, kept as the map of what moved
where and the conventions to follow.

## The problems today

1. **Two roots.** Source is split between root-level Metronic dirs
   (`components/`, `config/`, `hooks/`, `lib/`, `styles/`) and `src/`
   (`pages/`, `routes/`, its own `components/`, its own `lib/`). The alias
   `@` maps to the repo root, which is why imports look inconsistent:
   `@/components/ui/button` (root) but `@/src/pages/login` (src). Two
   `components/` dirs and two `lib/` dirs mean every "where does this go?"
   has two answers.

2. **Dead template weight.** Metronic ships 39 demo layouts; the app uses
   exactly one (`layout-1`, mounted by `app-shell`):
   - `components/layouts/` — 577 files, of which **layout-1 uses 82**;
     ~495 files belong to the 38 unused layouts.
   - `config/` — 33 files, 30 of which are `layout-N.config.tsx`; only
     `layout-1.config.tsx` is referenced outside its own layout folder
     (the other 29 are imported only by their own dead layout).
   - `styles/demos/` — already pruned to `demo1.css` (used; keep).

## Target structure

Everything under `src/`, alias `@` → `./src`. Flat "layers", domain folders
inside each — the same philosophy as the backend's
`model/<domain>`, `repository/<domain>`.

```
bodhassess-app/
├── index.html, vite.config.ts, tsconfig*, package.json, .env*, docker…   (unchanged)
├── public/
└── src/
    ├── main.tsx                  # entry (unchanged)
    ├── App.tsx                   # providers (unchanged)
    ├── routes/
    │   └── index.tsx             # the router (already moved here)
    ├── pages/                    # one folder per domain — already correct
    │   ├── admin/  assessments/  clinical/  …
    │   └── (page-specific widgets → pages/<domain>/components/)
    ├── components/               # ONE shared-components home
    │   ├── ui/                   # design-system primitives (77 files, from /components/ui)
    │   ├── layout/               # the real layout (82 files, from /components/layouts/layout-1)
    │   ├── guards/               # private-route.tsx, public-route.tsx
    │   ├── data-grid/            # from src/components/data-grid
    │   ├── data-studio/          # from src/components/data-studio
    │   ├── app-shell.tsx
    │   ├── screen-loader.tsx     # from /components
    │   └── loading.tsx           # from /components
    ├── hooks/                    # 8 files, from /hooks (unchanged inside)
    ├── lib/                      # ONE lib: api.ts, practitioner-auth.tsx,
    │   │                         #   practitioner-auth-utils.ts, data-store.ts,
    │   │                         #   helpers.ts, utils.ts, dom.ts, config.ts,
    │   │                         #   instrument-overrides.ts, router-helpers.tsx,
    │   └── data-studio/          #   + the data-studio lib subfolder
    ├── config/                   # ONLY: bodhassess.config.tsx, general.config.ts,
    │                             #       layout-1.config.tsx (→ rename layout.config.tsx)
    └── styles/                   # globals.css, config.metronic.css,
                                  #   components/, demos/demo1.css
```

Parked, not deleted (repo convention — `../deleted/bodhassess-app-metronic/`):

```
deleted/bodhassess-app-metronic/
├── layouts/        # the 38 unused layout folders (~495 files)
└── config/         # the 29 unused layout-N.config.tsx files
```

## Old → new mapping

| Today (alias `@` = root)               | Target (alias `@` = src)               |
|----------------------------------------|----------------------------------------|
| `components/ui/*`                      | `src/components/ui/*` — import string **unchanged** (`@/components/ui/*`) |
| `components/layouts/layout-1/*`        | `src/components/layout/*`              |
| `components/layouts/layout-{2..39}`    | parked                                 |
| `components/screen-loader.tsx`, `loading.tsx` | `src/components/`               |
| `config/layout-1.config.tsx`           | `src/config/layout.config.tsx`         |
| `config/layout-{2..39}.config.tsx`     | parked                                 |
| `config/bodhassess.config.tsx`, `general.config.ts` | `src/config/`             |
| `hooks/*`                              | `src/hooks/*` — import string unchanged |
| `lib/*` (root)                         | `src/lib/*` — import string unchanged  |
| `src/lib/router-helpers.tsx`           | `src/lib/router-helpers.tsx` (already home) |
| `src/components/{private,public}-route.tsx` | `src/components/guards/`          |
| `src/components/app-shell.tsx`         | `src/components/app-shell.tsx` (stays) |
| `styles/*`                             | `src/styles/*`                         |
| `@/src/pages/…`, `@/src/components/…`  | `@/pages/…`, `@/components/…` (drop the `/src`) |

Key point: because `@` flips from root to `./src`, everything that lives in a
root dir today keeps its **exact import string** after moving into `src/` —
only the `@/src/…` imports need a mechanical `@/src/` → `@/` rewrite, plus
the handful touching `layouts/layout-1` and `layout-1.config`.

## Migration plan (each phase ends green: `npm run typecheck && npm run build`)

- **Phase 0 — baseline.** Commit current state; confirm build green.
- **Phase 1 — one root.** `git mv` the five root dirs into `src/`; flip the
  alias in `vite.config.ts` + `tsconfig.app.json` (`"@/*": ["./src/*"]`,
  include just `["src"]`); rewrite `@/src/` → `@/` across the codebase
  (mechanical sed). Biggest visible win, zero behavior change.
- **Phase 2 — park the dead layouts.** Verify each `layout-N` (N≠1) and its
  config has no importer outside its own folder (grep), then move the 38
  layouts + 29 configs to `deleted/bodhassess-app-metronic/`.
- **Phase 3 — naming tidy.** `layouts/layout-1` → `components/layout`;
  `layout-1.config.tsx` → `config/layout.config.tsx`; guards into
  `components/guards/`; update the few importers (app-shell, routes).
- **Phase 4 (later, optional).** If pages keep growing: colocate
  page-specific components/hooks under `pages/<domain>/`, leaving
  `components/` for genuinely shared pieces only.

## Conventions going forward

- Files kebab-case (`entity-registration.tsx`), components PascalCase — as now.
- Pages `export default`; shared components named exports.
- New shared thing? `components/` (visual), `hooks/` (stateful logic),
  `lib/` (pure logic / API) — never a new root dir.
- API payload types live beside the client in `lib/api.ts` (or a
  `lib/api/` folder once it outgrows one file) and mirror the backend DTOs
  1:1 — relevant for the controller work starting now.

## Risks / notes

- `dist/` is git-tracked: rebuild after each phase so the committed bundle
  matches source.
- `styles/globals.css` imports Metronic css by relative path — verify after
  Phase 1 (it moves with everything else, so paths stay relative-correct).
- Vite dev server must be restarted after the alias flip.
- Nothing in `node_modules/`, `public/`, docker or env files moves.
