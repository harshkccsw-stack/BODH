I'll start by enumerating all files in the target directory.
82 files to read. Let me batch-read them efficiently, starting with the core structural files.
Now the remaining core components. The sidebar menu pulls from `@/config/bodhassess.config` MENU_SIDEBAR — I'll need to read that too for the nav map.
Now the config file that defines all menus (load-bearing for the nav map), plus the topbar components.
Now the load-bearing auth/menu helpers that the layout depends on.
Now the remaining shared files. Reading the dialogs group.
Reading the remaining search components and share-profile group.
Reading share-profile, avatar-group, and dropdown-menus.
Reading dropdown-menus and mega-menu subs.
Reading mega-menu subs and navbar.
Reading navbar and the notification items.
Reading the remaining notification items.
Reading the final notification items (15-20).
Let me verify which shared components are actually referenced (dead-code check) and confirm the auth storage key.
I have now read all 82 files in the layout-1 directory plus the load-bearing config/auth/menu helpers. Here is the complete structured report.

---

# LAYOUT-1 FILE-BY-FILE REPORT (bodhassess-app)

Root: `/home/babayaga/Projects/bodh/bodhassess-app/components/layouts/layout-1/`
Cross-cutting deps read for context: `config/bodhassess.config.tsx`, `config/types.ts`, `config/general.config.ts`, `lib/practitioner-auth.tsx`, `lib/practitioner-auth-utils.ts`, `hooks/use-menu.ts`, `lib/config.ts`.

## A. ACTIVE SHELL — `components/` (all rendered in layout-1)

**`index.tsx`** — Purpose: layout entry. Exports `Layout1({children})`. Renders `<LayoutProvider><Main>{children}</Main></LayoutProvider>`. Consumed by `src/components/private-route.tsx` and `src/components/app-shell.tsx` (this IS the active app shell). No auth/API/localStorage.

**`components/context.tsx`** — Purpose: layout UI state. Exports `LayoutProvider`, `useLayout()`. Context `LayoutState`: `sidebarCollapse`/`setSidebarCollapse` (bool, default false), `sidebarTheme`/`setSidebarTheme` (`'dark'|'light'`, default `'light'`). Pure React state, no persistence. NOT the auth context.

**`components/main.tsx`** — Purpose: shell skeleton. Exports `Main`. Renders `{!isMobile && <Sidebar/>}` + `.wrapper > <Header/> + <main>{children}</main>`. Side effects via `useEffect` on `document.body.classList`: toggles `sidebar-collapse` from `useLayout().sidebarCollapse`; on mount adds `demo1 sidebar-fixed header-fixed`, then `layout-initialized` after 1s. Uses `useIsMobile()` (`@/hooks/use-mobile`). NOTE: does NOT render Footer, Toolbar, or Breadcrumb — those are page-level.

**`components/header.tsx`** — Role: top header bar (fixed). Exports `Header`. Contents: mobile mini-logo (`/media/app/mini-logo.svg` → Link `/`); mobile-only Sheets for `SidebarMenu` (Menu icon) and `MegaMenuMobile` (SquareChevronRight icon); desktop `<MegaMenu/>`; right topbar cluster: `SearchDialog`, `NotificationsSheet`, `ChatSheet`, `AppsDropdownMenu`, `UserDropdownMenu`. Header sticky border toggled by `useScrollPosition()>0`. Closes Sheets on `usePathname()` change. QUIRK: user avatar in trigger is HARDCODED `toAbsoluteUrl('/media/avatars/300-2.png')` with green border — NOT from auth (inconsistent with UserDropdownMenu which uses real auth data).

**`components/sidebar.tsx`** — Role: desktop sidebar container. Exports `Sidebar`. Renders `<SidebarHeader/>` + `<SidebarMenu/>` inside width `var(--sidebar-default-width)`. Dark class applied when `sidebarTheme==='dark'` OR `pathname.includes('dark-sidebar')` (stock Metronic demo hook).

**`components/sidebar-header.tsx`** — Role: sidebar brand + collapse toggle. Exports `SidebarHeader`. BODH CUSTOMIZATION: replaced Metronic logo images with inline badge `<div>B</div>` + text "BodhAssess" (default-logo) and small-logo "B". Brand links to `/dashboard`. Collapse button calls `useLayout().setSidebarCollapse(!collapse)`.

**`components/sidebar-menu.tsx`** — Role: PRIMARY nav. Exports `SidebarMenu`. Menu source: `MENU_SIDEBAR` from `@/config/bodhassess.config`. Auth: `usePractitionerAuth()` + `canAccess()` from `@/lib/practitioner-auth-utils`. HEAVILY BODH-CUSTOMIZED — three logic blocks: (1) `allowedMenu` (useMemo) filters MENU_SIDEBAR by `auth.me.url_paths` RBAC — a group kept iff ≥1 child accessible; leaf kept iff `canAccess(item.path, urlPaths)`; drops headings whose following section is empty. (2) `bestMatch`/`covers`/`matchPath` — computes the single longest menu path covering current URL (boundary-checked so `/reports` ≠ `/reports-archive`) so only the most-specific item is highlighted. (3) `buildMenu` recursion → `AccordionMenu` from `@/components/ui/accordion-menu`. Disabled items render a "Soon" Badge. `'use client'`. Links via `@/src/lib/router-helpers` Link.

**`components/toolbar.tsx`** — Role: page toolbar (page-level, not auto-rendered). Exports `Toolbar, ToolbarActions, ToolbarBreadcrumbs, ToolbarHeading, ToolbarPageTitle, ToolbarDescription`. `ToolbarBreadcrumbs` + `ToolbarPageTitle` derive from `MENU_SIDEBAR` via `useMenu(pathname).getBreadcrumb()`/`.getCurrentItem()`. PageTitle falls back to `'Untitled'`.

**`components/footer.tsx`** — Role: footer (page-level). Exports `Footer`. STOCK Metronic: `{year} © Keenthemes Inc.` + nav links Docs/Purchase/FAQ/Support/License from `generalSettings` (`@/config/general.config`). QUIRK: `docsLink`/`licenseLink` are empty strings in config → those links resolve to `""`. Not bodh-branded.

**`components/breadcrumb.tsx`** — Role: standalone breadcrumb. Exports `Breadcrumb`. Same `useMenu(pathname).getBreadcrumb(MENU_SIDEBAR)` logic as toolbar; renders titles + ChevronRight; non-linked spans (unlike ToolbarBreadcrumbs which links).

**`components/mega-menu.tsx`** — Role: desktop horizontal mega menu in header. Exports `MegaMenu`. Menu source: `MENU_MEGA` from `@/config/bodhassess.config`. BODH-CUSTOMIZED/SIMPLIFIED: uses `@/components/ui/navigation-menu`; top items with children render dropdown via local `flattenMenuChildren()` (walks 3 levels deep collecting `path` leaves). Active state via `useMenu().isActive/hasActiveChild`. Does NOT use the `shared/mega-menu/mega-menu-sub-*` components (those are for layout-7/9).

**`components/mega-menu-mobile.tsx`** — Role: mobile mega menu (in Header Sheet). Exports `MegaMenuMobile` + re-declares a local `MenuItem`/`MenuConfig` interface. Menu source: `MENU_MEGA_MOBILE` (= `MENU_MEGA`). Accordion-based build similar to SidebarMenu but no RBAC filtering, supports `badge`/`collapse`/`disabled`.

## B. TOPBAR — `shared/topbar/`

**`user-dropdown-menu.tsx`** — Role: user/profile dropdown (header). Exports `UserDropdownMenu({trigger})`. BODH-CUSTOMIZED auth: `usePractitionerAuth()` → header shows `me.name` (fallback 'Practitioner'), `me.email` (mailto:), Badge = `me.id` (fallback 'Guest'). Logout button → `auth.logout()`. Dark mode `Switch` via `useTheme()` (next-themes). Language submenu (`I18N_LANGUAGES`: en/ar/fr/zh w/ flag svgs) is DISPLAY-ONLY, hardcoded to English, no i18n wiring. STOCK/non-functional links (all `href="#"`): Public Profile, My Profile, My Account submenu (Get Started, My Profile, Billing, Security, Members & Roles, Integrations), Dev Forum → `devs.keenthemes.com`. Avatar hardcoded `/media/avatars/300-2.png`.

**`topbar.tsx`** — Exports `StoreClientTopbar` (e-commerce demo: search shop, wishlist, cart $94.56). NOT used by layout-1 — imported only by `layout-4`. Uses `useStoreClient()`.

**`context.tsx`** — Exports `StoreClientProvider`, `useStoreClient` (cart/wishlist/product-sheet reducer). E-commerce demo state; used with `StoreClientTopbar` (layout-4). Unused by layout-1's active shell.

**`apps-dropdown-menu.tsx`** — Exports `AppsDropdownMenu({trigger})`. STOCK: hardcoded apps list (Jira/Inferno/Evernote/Gitlab/Google-webdev) with Switches; "Go to Apps" → `#`. Brand logos from `/media/brand-logos/`.

**`chat-sheet.tsx`** — Exports `ChatSheet({trigger})`. STOCK: hardcoded messages array (HR Team, avatars 300-x), `dangerouslySetInnerHTML` for message text, join-request footer, message input. Uses `AvatarGroup`. No API.

**`notifications-sheet.tsx`** — Exports `NotificationsSheet({trigger})`. STOCK: Tabs All/Inbox/Team/Following; composes hardcoded `Item1..Item20` (note Item7/8/9/12 imported? — actually imports Items 1-6,10,11,13-20; Item7/8/9/12 exist but not wired). All demo data passed as props. Footer Archive all / Mark all as read (non-functional).

**`notifications/item-1.tsx … item-20.tsx`** (20 files) — All STOCK Metronic demo notification cards. Default-exported `ItemN`. Hardcoded avatars/names/text (Joe Lincoln, Leslie Alexander, etc.), all links `href="#"`. Some take props (Item1,3,5), most fully hardcoded. Use `Avatar`, `Card`, `Badge`, `Button`, `AvatarGroup`, file-type/brand svgs. No auth/API. No bodh content.

## C. DIALOGS — `shared/dialogs/`

**`welcome-message-dialog.tsx`** — Exports `WelcomeMessageDialog`. STOCK "Welcome to Metronic". UNUSED (no importer found).
**`account-deactivated-dialog.tsx`** — Exports `AccountDeactivatedDialog`. STOCK. UNUSED.
**`give-award-dialog.tsx`** — Exports `GiveAwardDialog`. STOCK; composes share-profile sub-forms. Used by `DropdownMenu9`.
**`report-user-dialog.tsx`** — Exports `ReportUserDialog`. STOCK (report reasons: Impersonation/Spammy/etc.; "Jenny Klabber"). Used by `DropdownMenu9`.

**`dialogs/search/`** — `search-dialog.tsx` (exports `SearchDialog`, used in Header) + supporting: `search-docs/mixed/settings/settings-items/integrations/empty/users/no-results.tsx`, `types.ts`, `index.ts` (barrel). All STOCK demo search UI with hardcoded users (Tyler Hero, Esther Howard…), docs, integrations. Uses `DropdownMenu4`. No real search backend.

**`dialogs/share-profile/`** — `share-profile-dialog.tsx` (`ShareProfileDialog`), `share-profile-via-link/via-email/users/settings.tsx`, `types.ts`, `index.ts`. STOCK (KeenThemes, metronic.com links, hardcoded users). Used by `DropdownMenu9`.

## D. DROPDOWN-MENU — `shared/dropdown-menu/dropdown-menu-1..9.tsx`

All STOCK generic action menus (View/Edit/Export/Delete/Share/etc., all `href="#"`). `DropdownMenu4` used by search-dialog; `DropdownMenu9` (Share Profile/Give Award/Report User) wires the three dialogs but is itself UNUSED (no importer). `DropdownMenu1,2,3,5,6,7,8` appear unused in-app.

## E. MEGA-MENU (shared) — `shared/mega-menu/`

`mega-menu-sub-account/auth/network/profiles/store.tsx` + `components/` (`mega-menu-footer`, `mega-menu-sub-default`, `mega-menu-sub-highlighted`, `index.ts`). STOCK Metronic mega-menu builders that index `MENU_MEGA[N]` at fixed positions. USED BY `layout-7` and `layout-9` mega-menus, NOT by layout-1 (layout-1 uses its own simplified `components/mega-menu.tsx`). Within layout-1 scope these are library code for other layouts.

## F. NAVBAR — `shared/navbar/`

`navbar.tsx` (`Navbar`, `NavbarActions`), `navbar-menu.tsx` (`NavbarMenu` — Menubar from MenuConfig), `scrollspy-menu.tsx` (`ScrollspyMenu`). Generic. Layout-1's copies appear UNUSED (layouts 2/3/5 have their own `navbar-menu`). Dead within layout-1.

## G. COMMON — `shared/common/avatar-group.tsx`

Exports `AvatarGroup`, types `Avatar`/`Avatars`/`AvatarGroupProp`. Generic stacked-avatar component. Widely imported (chat, search, notifications). Uses `toAbsoluteUrl`.

---

# SYNTHESIS

### (a) Active component tree (what actually renders)
```
Layout1 (index.tsx)
└─ LayoutProvider (context.tsx: sidebarCollapse, sidebarTheme)
   └─ Main (main.tsx; body classes: demo1/sidebar-fixed/header-fixed)
      ├─ Sidebar   (desktop only, !isMobile)
      │   ├─ SidebarHeader  → "B / BodhAssess" brand, link /dashboard, collapse toggle
      │   └─ SidebarMenu    → MENU_SIDEBAR, RBAC-filtered by url_paths, AccordionMenu
      └─ .wrapper
          ├─ Header
          │   ├─ (mobile) mini-logo + Sheet[SidebarMenu] + Sheet[MegaMenuMobile]
          │   ├─ (desktop) MegaMenu  → MENU_MEGA
          │   └─ Topbar cluster: SearchDialog · NotificationsSheet · ChatSheet ·
          │                      AppsDropdownMenu · UserDropdownMenu(auth)
          └─ <main>{page children}</main>
```
Footer, Toolbar(+Breadcrumbs/PageTitle), Breadcrumb are EXPORTED but page-level — Main does not render them.

### (b) Navigation map (from `config/bodhassess.config.tsx`)

SIDEBAR (`MENU_SIDEBAR`) — item → route:
- Dashboard → `/dashboard`
- [Assessments heading]
- Assessments (group): All Assessments `/assessments` · Create Assessment `/assessments/create` · Batch Upload `/assessments/batch`
- Questionnaire Library (group): All Questionnaires `/questionnaires` · Demographic Fields `/questionnaires/demographics`
- Question Bank (group): Item Explorer `/question-bank` · Measured Qualities `/question-bank/qualities` · Create Questionnaire `/question-bank/create` · IRT Calibration `/question-bank/calibration` · Norm Tables `/question-bank/norms`
- Reports (group): All Reports `/reports` · Response Sheets `/reports/responses`
- [Entity Management heading]
- Entity Registration → `/admin/entity-registrations`
- [Platform heading]
- BodhLens Analytics → `/analytics`
- Data Studio → `/data-studio`
- BodhSurvey → `/survey`
- White-Label (group): Tenant Management `/white-label/tenants` · Branding Config `/white-label/branding` · BPaaS API Keys `/white-label/api`
- [Administration heading]
- Live Tracking → `/admin/live-tracking`
- Data Grid → `/admin/data-grid`
- Users (group): Practitioners `/admin/practitioners` · Respondents `/admin/respondents` · Groups `/admin/groups`
- Roles (group): Roles & Permissions `/admin/permissions` · Permissions `/admin/roles`  ← NOTE swapped labels: "Roles & Permissions" points to `/admin/permissions`, "Permissions" points to `/admin/roles`
- DPDP Compliance (group): Consent Records `/compliance/consent` · Erasure Requests `/compliance/erasure` · Audit Trail `/compliance/audit` · Data Principal Portal `/compliance/portal`
- Settings (group): Organization Settings `/settings/tenant` · Tier Configuration `/settings/tiers` · Integrations `/settings/integrations`

MEGA MENU (`MENU_MEGA`, also mobile):
- Dashboard → `/dashboard`
- Assessments ▸ All Assessments `/assessments` · Create Assessment `/assessments/create` · Questionnaire Library `/questionnaires` · Question Bank `/question-bank` · Reports `/reports`
- Verticals ▸ Clinical Psychology `/clinical/clients` · Industrial Psychology `/industrial/cohorts` · Counselling & Child `/counselling/students` · Designing Experiments `/experiments/builder` · White-Label `/white-label/tenants`
- Analytics ▸ BodhLens `/analytics` · BodhSurvey `/survey`

User dropdown, footer, all shared demo components: links are `#` or external keenthemes URLs (non-navigational).

### (c) Where the layout gets user/session data
Single source: `usePractitionerAuth()` (`lib/practitioner-auth.tsx`, `PractitionerAuthProvider`, wraps dashboard above Layout1). On mount reads token from `localStorage[key]` where key = `config.practitionerAuthStorageKey` (`lib/config.ts` → env `VITE_PRACTITIONER_AUTH_STORAGE_KEY`, default `'bodhassess.practitioner.token'`), calls `authApi.me(token)` → `authUserToPractitionerMe` → `{id,name,email,roles,verticals,status,url_paths}`. Super admin carries `url_paths:['/*']`.
- Consumed in layout by: `UserDropdownMenu` (name/email/id + `auth.logout()`), `SidebarMenu` (`auth.me.url_paths` + `canAccess()` for RBAC menu trimming).
- Menu access gating: `canAccess`/`pathMatchesPattern` in `lib/practitioner-auth-utils.ts` (`/*` all, `/x/*` prefix, else exact; public prefixes `/login /portal /register /select-vertical /entity`).
- localStorage: only via token helpers (get/set/clearDashboardToken). No direct localStorage in layout components.
- API calls: none directly in layout files; auth resolution happens in the provider (`authApi.me/logout`). All topbar demo widgets (search/chat/notifications/apps) are static, no fetch.

### (d) Customizations vs stock Metronic (demo1/layout-1)
1. Brand: `SidebarHeader` inline "B / BodhAssess" badge replaces Metronic image logos; links `/dashboard`.
2. `SidebarMenu`: added RBAC filtering (`url_paths`+`canAccess`) and best-match single-active-path logic — significant custom code over stock.
3. Menu configs: `config/bodhassess.config.tsx` is fully bodh domain (assessments, question bank/IRT, DPDP compliance, white-label, verticals) — replaces Metronic demo menus.
4. `mega-menu.tsx`: rewritten to a simple `NavigationMenu` + `flattenMenuChildren` (abandons the stock `mega-menu-sub-*` account/auth/network/profiles/store system, which now only serve layouts 7/9).
5. `UserDropdownMenu`: header + logout wired to real practitioner auth (name/email/id/logout); rest of items still stock `#`.

### (e) Odd / noteworthy
- INCONSISTENCY: Header trigger avatar and UserDropdownMenu header avatar are hardcoded `/media/avatars/300-2.png` (green border) — not from `me`, while name/email/id ARE from auth.
- `Roles` group label/route mismatch: "Roles & Permissions" → `/admin/permissions`; "Permissions" → `/admin/roles` (looks swapped).
- Footer is unbranded stock (Keenthemes Inc.) and `generalSettings.docsLink`/`licenseLink` are `''` → dead links.
- Language switcher is cosmetic only (fixed to English, no i18n effect).
- `sidebarTheme` dark also triggered by `pathname.includes('dark-sidebar')` (leftover Metronic demo routing hook).
- Large amount of dead/foreign code physically under `layout-1/shared/`: `topbar/topbar.tsx`+`topbar/context.tsx` (layout-4 only), `mega-menu/mega-menu-sub-*` (layouts 7/9 only), `navbar/*` (unused; other layouts have own copies), `dropdown-menu-1/2/3/5/6/7/8/9` and `welcome-message-dialog`/`account-deactivated-dialog` (no importers). `layout-1/shared/` effectively doubles as a shared component library for all layouts, so not everything under it is part of the active BodhAssess shell.
- `Main` mounts a 1s `setTimeout` to add `layout-initialized` body class (animation gate).
- All navigation uses a custom router adapter: `@/src/lib/router-helpers` (`Link` default export, `usePathname`, `useRouter` wrapping react-router) — not Next.js despite Next-like naming.
- `mega-menu-mobile.tsx` re-declares its own local `MenuItem`/`MenuConfig` types instead of importing from `config/types` (minor divergence).
