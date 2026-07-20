I'll enumerate all files in the target layout directories first, then read them.
No imports from src. Now reading all files. Starting with layout-16.
Layout-16 confirmed stock. Now layout-17 and layout-18.
Layouts 17, 18 confirmed stock. Now layout-19, 20, 21.
Layouts 19, 20 confirmed stock. Now layout-21, 22, 23.
Layouts 21, 22 confirmed stock. Now layout-23, 24, 25.
Layouts 23, 24 confirmed stock. Now remaining layout-25 files, then layout-26 and layout-27.
All 130 files across layout-16 through layout-27 read in full. Below is the structured digest.

---

# LAYOUTS 16–27 — file-by-file digest (all STOCK Metronic template code)

## Shared traits across ALL 12 layouts (verify baseline)
- Every `index.tsx` = thin wrapper: `<LayoutProvider style={CSS vars}><Wrapper>{children}</Wrapper></LayoutProvider>`, exports `LayoutNN`.
- Every `context.tsx` = near-identical `LayoutProvider`/`useLayout` (createContext + `useIsMobile` + `TooltipProvider`, CSS vars, body-className side-effect, `isSidebarOpen`/`sidebarToggle`). Layout-22 adds `useScrollPosition` (sticky header); layout-26 adds `isAsideExpandedOpen`/`asideExpandedToggle`.
- Routing via shared shim `@/src/lib/router-helpers` (`Link`, `usePathname`) — the ONLY app-shared import; generic, not business logic.
- UI from `@/components/ui/*`, icons from `lucide-react`, helpers `@/lib/helpers` (`toAbsoluteUrl`), `@/lib/utils` (`cn`), hooks `@/hooks/use-mobile|use-menu|use-scroll-position`, theme via `next-themes`.
- Placeholder-only content: brand "Metronic"/"Keenthemes"/"ReUI", teams "Thunder/Clarity/Lightning/Bold AI", user "Chris Harris / Senior Developer", "Sean", projects "Store Admin/Retail/CRM", communities "Designers Hub/React Js/Node Js", `@reui`, dummy `/media/avatars/300-2.png`, `/media/app/*.svg`, `/media/brand-logos/*`. All nav `href="/layout-NN"` or `"#"`. Menus pulled from `@/config/layout-NN.config`.
- NO bodh imports, NO API/fetch calls, NO business logic, NO app routes anywhere.

## layout-16 (14 files) — dual-column icon-rail + secondary sidebar (350px), fixed header, config: `layout-16.config`
- `index.tsx`: Layout16, sidebar 350px/70px collapsed, header 80px.
- `components/context.tsx`: standard LayoutProvider.
- `components/wrapper.tsx`: flex h-screen, Sidebar + Header + main.
- `components/header.tsx`: fixed header, mobile Sheet w/ SidebarPrimary+Secondary, HeaderTitle + HeaderToolbar.
- `components/header-title.tsx`: breadcrumb "Home/Account/Updates".
- `components/header-toolbar.tsx`: Coffee/MessageSquareCode/Pin buttons, search, Reports/Add.
- `components/sidebar.tsx`: aside w/ SidebarPrimary+Secondary.
- `components/sidebar-header.tsx`: team switcher dropdown (Thunder/Clarity/Lightning/Bold AI).
- `components/sidebar-primary.tsx`: black icon rail, hardcoded `menuItems` (Profile/Dashboard/…), user avatar dropdown w/ theme toggle.
- `components/sidebar-primary-menu.tsx`: reads `MENU_SIDEBAR_MAIN`.
- `components/sidebar-secondary.tsx`: ScrollArea assembling header+menu+workspaces+communities+resources.
- `components/sidebar-communities.tsx`: hardcoded communities accordion.
- `components/sidebar-workspaces-menu.tsx`: reads `MENU_SIDEBAR_WORKSPACES`.
- `components/sidebar-resources-menu.tsx`: reads `MENU_SIDEBAR_RESOURCES`.

## layout-17 (9 files) — slim 80px icon sidebar + top header, config: `layout-17.config`
- `index.tsx`: Layout17, sidebar 80px, header 80px.
- `context.tsx`: standard.
- `wrapper.tsx`: Header + Sidebar + main.
- `header.tsx`: fixed header, HeaderLogo + HeaderToolbar.
- `header-logo.tsx`: "Metronic" logo + project selector (Store Admin/Retail/CRM), mobile Sheet.
- `header-toolbar.tsx`: search "Search Metronic", Create, mails/notes/settings, user dropdown (theme via next-themes).
- `sidebar.tsx`: fixed icon column.
- `sidebar-content.tsx`: reads `MENU_SIDEBAR_MAIN`, icon tooltips.
- `toolbar.tsx`: page toolbar w/ breadcrumb "Home/Account/Updates", Reports/Add.

## layout-18 (16 files) — floating card header w/ header-menu + navbar + left sidebar (260px), config: `layout-18.config`
- `index.tsx`: Layout18, bodyClassName bg-muted, sidebar 260px, header 136px.
- `context.tsx`: standard (no sidebar toggle state used in provider value beyond isMobile).
- `wrapper.tsx`: rounded card container, Sidebar + main.
- `header.tsx`: HeaderLogo+HeaderMenu+HeaderToolbar+Navbar.
- `header-logo.tsx`: green gradient logo "Metronic", mobile Sheet w/ menus.
- `header-menu.tsx`: reads `MENU_HEADER` (`useMenu`).
- `header-menu-mobile.tsx`: `MENU_HEADER` dropdown.
- `header-secondary-menu-mobile.tsx`: `MENU_NAVBAR` dropdown.
- `header-toolbar.tsx`: BellDot/Settings, user "Sean" dropdown (mute notifications sub).
- `navbar.tsx`: reads `MENU_NAVBAR`, Coffee/Pin/search.
- `sidebar.tsx`: SidebarSearch + SidebarMenu.
- `sidebar-menu.tsx`: reads `MENU_SIDEBAR`.
- `sidebar-search.tsx`: "Search Billing" + view-options dropdown.
- `toolbar.tsx`: generic Toolbar/Actions/Heading/PageTitle/Description exports.

## layout-19 (13 files) — header w/ centered search + navbar + left sidebar (240px), config: `layout-19.config`
- `index.tsx`: Layout19, sidebar 240px, header 112px.
- `context.tsx`: standard.
- `wrapper.tsx`: Header + Sidebar + main.
- `header.tsx`: HeaderLogo+HeaderSearch+HeaderToolbar+Navbar.
- `header-logo.tsx`: purple gradient logo "Metronic", mobile Sheet.
- `header-menu-mobile.tsx`: `MENU_HEADER` dropdown.
- `header-search.tsx`: centered "Search section" w/ ⌘K badge.
- `header-toolbar.tsx`: notes/settings, user "Chris Harris" dropdown.
- `navbar.tsx`: reads `MENU_HEADER`, Help dropdown.
- `sidebar.tsx`: SidebarHeader + SidebarMenu.
- `sidebar-header.tsx`: team switcher w/ balance/currency formatting (Thunder/Clarity/… + USD balances).
- `sidebar-menu.tsx`: reads `MENU_SIDEBAR`.
- `toolbar.tsx`: generic Toolbar exports.

## layout-20 (14 files) — collapsible dark floating sidebar (330px) + fixed header, config: `layout-20.config`
- `index.tsx`: Layout20, sidebar 330px/70px.
- `context.tsx`: standard.
- `wrapper.tsx`: transition-managed main padding tied to sidebar-open.
- `header.tsx`: fixed header shifting w/ sidebar, mobile Sheet (dark).
- `header-title.tsx`: breadcrumb + PanelRight toggle when collapsed.
- `header-toolbar.tsx`: Coffee/Pin/search/Reports/Add.
- `sidebar.tsx`: dark rounded floating aside.
- `sidebar-header.tsx`: team dropdown + PanelLeft collapse.
- `sidebar-primary.tsx`: white-logo icon rail, hardcoded menuItems, user dropdown.
- `sidebar-primary-menu.tsx`: reads `MENU_SIDEBAR_MAIN` (no group labels).
- `sidebar-secondary.tsx`: header+menu+workspaces+communities+resources w/ separators.
- `sidebar-communities.tsx`: hardcoded communities.
- `sidebar-workspaces-menu.tsx`: reads `MENU_SIDEBAR_WORKSPACES`.
- `sidebar-resources-menu.tsx`: reads `MENU_SIDEBAR_RESOURCES`.

## layout-21 (19 files) — animated icon-rail (framer-motion) + rounded secondary sidebar (300px), page-margin gaps, config: `layout-21.config`
- `index.tsx`: Layout21, page-margin 10px, sidebar 300px/60px.
- `context.tsx`: adds `--page-margin`.
- `wrapper.tsx`: rounded content area, mobile HeaderBreadcrumbs.
- `header.tsx`: rounded floating header shifting w/ sidebar.
- `header-breadcrumbs.tsx`: "Teams/Thunder AI/Dashboard".
- `header-menu.tsx`: mobile Sheet w/ SidebarPrimary+Secondary.
- `header-toolbar.tsx`: Coffee/Pin/Reports/Add.
- `sidebar.tsx`: SidebarPrimary + Secondary.
- `sidebar-header.tsx`: team dropdown + PanelRight toggle.
- `sidebar-primary.tsx`: **uses `framer-motion`** for an animated moving indicator over colored nav buttons; hardcoded navItems; user dropdown. (Still stock — decorative only.)
- `sidebar-primary-menu.tsx`: reads `MENU_SIDEBAR_MAIN`.
- `sidebar-secondary.tsx`: search+menu+workspaces+communities+resources.
- `sidebar-communities.tsx`: hardcoded communities.
- `sidebar-search.tsx`: "Search" + ⌘K.
- `sidebar-workspaces-menu.tsx`: reads `MENU_SIDEBAR_WORKSPACES`.
- `sidebar-resources-menu.tsx`: reads `MENU_SIDEBAR_RESOURCES`.
- `toolbar.tsx`: generic exports + ToolbarWrapper.
- `toolbar-menu.tsx`: Tabs (Overview/Permissions/Billing/Members).

## layout-22 (9 files) — sticky-shrinking top header w/ header-menu + navbar, no sidebar, config: `layout-22.config`
- `index.tsx`: Layout22, `headerStickyOffset=100`, header 124px→70px sticky.
- `context.tsx`: **uses `useScrollPosition`** → sets `data-header-sticky` on body.
- `wrapper.tsx`: Header + main only.
- `header.tsx`: header shrinks on sticky, Navbar hides.
- `header-logo.tsx`: black gradient logo + project selector.
- `header-toolbar.tsx`: inline `MENU_HEADER` nav, mobile Sheet w/ SidebarMenu, user dropdown, theme toggle.
- `navbar.tsx`: reads `MENU_NAVBAR`.
- `sidebar-menu.tsx`: reads `MENU_HEADER` (mobile sheet nav).
- `toolbar.tsx`: generic exports (larger title variant).

## layout-23 (13 files) — dark (zinc-950) top header + collapsible left sidebar (240px), config: `layout-23.config`
- `index.tsx`: Layout23, bodyClassName bg-zinc-950, sidebar 240px.
- `context.tsx`: standard.
- `wrapper.tsx`: rounded content card, Sidebar + main.
- `header.tsx`: dark header, HeaderLogo+HeaderMenu+HeaderToolbar.
- `header-logo.tsx`: green logo "Metronic", mobile Sheet.
- `header-menu.tsx`: reads `MENU_HEADER`.
- `header-menu-mobile.tsx`: `MENU_HEADER` dropdown.
- `header-toolbar.tsx`: "Add Teammate", BellDot/Settings, user "Sean" dropdown.
- `sidebar.tsx`: collapsible width, header+search+menu.
- `sidebar-header.tsx`: team dropdown + PanelRight toggle.
- `sidebar-menu.tsx`: reads `MENU_SIDEBAR`.
- `sidebar-search.tsx`: "Search" + ⌘K.
- `toolbar.tsx`: generic exports + ToolbarSidebarToggle.

## layout-24 (7 files) — design-canvas shell: icon sidebar + tool panel + right aside, NO config (fully hardcoded)
- `index.tsx`: Layout24, aside 400px, sidebar 80px, panel 70px.
- `context.tsx`: standard.
- `wrapper.tsx`: dotted-bg canvas, Sidebar+SidebarPanel+Aside+main; mobile HeaderMobile.
- `aside.tsx`: right panel w/ search + Coffee/Pin/Share + dashed placeholder canvas.
- `header-mobile.tsx`: dark mobile header w/ two Sheets (aside + sidebar).
- `sidebar.tsx`: dark zinc-950 icon rail, **hardcoded `menuItems`** (Profile/Dashboard/…), user dropdown.
- `sidebar-panel.tsx`: hardcoded drawing-tool buttons (Analytics/Goals/Draw/etc.).

## layout-25 (14 files) — top header (header-menu) + left sidebar w/ search + accordion sections (260px), config: `layout-25.config`
- `index.tsx`: Layout25, sidebar 260px, header 70px.
- `context.tsx`: standard.
- `wrapper.tsx`: transition-managed, Header+Sidebar+main.
- `header.tsx`: HeaderLogo+HeaderMenu+HeaderToolbar.
- `header-logo.tsx`: text "Metronic", mobile Sheet assembling search+menus.
- `header-menu.tsx`: reads `MENU_HEADER`.
- `header-menu-mobile.tsx`: `MENU_HEADER` dropdown.
- `header-toolbar.tsx`: mails/notes/settings, user dropdown (avatar `/media/app/Avatar.png`).
- `sidebar.tsx`: search+primary-menu+communities+resources.
- `sidebar-communities.tsx`: hardcoded communities.
- `sidebar-primary-menu.tsx`: reads `MENU_SIDEBAR_MAIN`.
- `sidebar-resources-menu.tsx`: reads `MENU_SIDEBAR_RESOURCES`.
- `sidebar-search.tsx`: "Search Settings" + ⌘K.
- `toolbar.tsx` + `toolbar-breadcrumbs.tsx`: generic exports; breadcrumb "Home/My Account/Team Settings".

## layout-26 (11 files) — triple-panel: left sidebar + expandable right aside + far-right aside-toolbar, config: `layout-26.config`
- `index.tsx`: Layout26, bodyClassName bg-zinc-100/900, sidebar 240px.
- `context.tsx`: **variant** — applies CSS vars to `document.documentElement`, adds `isAsideExpandedOpen`/`asideExpandedToggle`, `data-aside-expanded` on body.
- `wrapper.tsx`: Sidebar+Aside+AsideToolbar+main; mobile HeaderMobile.
- `aside.tsx`: "Extended Aside" expandable panel + dashed placeholder.
- `aside-toolbar.tsx`: far-right icon rail, **hardcoded `menuItems`**, user dropdown, theme toggle.
- `header-mobile.tsx`: mobile header w/ three Sheets (sidebar/aside/aside-toolbar).
- `sidebar.tsx`: header+search+menu.
- `sidebar-header.tsx`: "Metronic" logo + PanelRight toggle.
- `sidebar-menu.tsx`: reads `MENU_SIDEBAR`.
- `sidebar-search.tsx`: "Search" + ⌘K.
- `toolbar.tsx`: generic exports + ToolbarSidebarToggle.

## layout-27 (12 files) — icon rail (60px) + wide tabbed sidebar-menu (300px) + top header, config: `layout-27.config`
- `index.tsx`: Layout27, sidebar 60px, sidebar-menu 300px, header 60px.
- `context.tsx`: standard.
- `wrapper.tsx`: Header + Sidebar + SidebarMenu + main.
- `header.tsx`: HeaderLogo + HeaderToolbar.
- `header-logo.tsx`: mini logo, HeaderTitle + HeaderBreadcrumbs, mobile Sheet.
- `header-breadcrumbs.tsx`: "Home" + Draft button.
- `header-title.tsx`: workspace switcher dropdown — **hardcoded mock workspaces "Keenthemes/Studio/ReUI"**, "Metronic Team".
- `header-toolbar.tsx`: search "Search Metronic", Create, mails/notes/settings, user dropdown.
- `sidebar.tsx`: icon rail (SidebarContent).
- `sidebar-content.tsx`: reads `MENU_SIDEBAR_MAIN`.
- `sidebar-menu.tsx`: tabbed panel (Directory/Elements/Control Panel), reads `MENU_SIDEBAR`.
- `toolbar.tsx`: generic exports.

---

# SYNTHESIS

**CONFIRMED: layout-16 through layout-27 are 100% unused stock Metronic template variants.** No exceptions found.

Evidence:
1. **Zero imports from `src/` into these layouts** — grep `src/` for `layouts/layout-1[6-9]|layouts/layout-2[0-7]` returned `NO_IMPORTS_FROM_SRC`. Nothing in the app references them.
2. **No bodh/app-specific content in ANY file** — no bodh imports, no API/fetch calls, no business logic, no assessment/report/questionnaire routes. All data is Metronic demo placeholder (Metronic/Keenthemes/ReUI branding, "Chris Harris"/"Sean" users, "Thunder AI" teams, `@reui`, `/media/avatars/300-2.png`).
3. Each layout only depends on: its own `@/config/layout-NN.config` menu constants (layout-24 has none — fully hardcoded), shared shadcn-style `@/components/ui/*`, generic hooks, and the shared router shim `@/src/lib/router-helpers` (the sole app-shared dependency, and it is a generic Next/React-Router abstraction, not business logic).
4. All internal nav points to self-referential `/layout-NN` or `"#"` dead links.

Notable-but-still-stock variations (flagged for completeness, none indicate app use):
- **layout-21** imports `framer-motion` (decorative animated sidebar indicator only).
- **layout-22** uses `@/hooks/use-scroll-position` for a sticky-shrinking header.
- **layout-26** `context.tsx` diverges from the common template: writes CSS vars to `document.documentElement` and adds aside-expand state.
- **layout-24** is the only one with NO config file (menus hardcoded inline).

These 12 dirs corroborate the hypothesis that layouts 2–39 are unused stock; the app uses only layout-1.

Config dependencies (exist under `@/config/`, not in scope here but referenced): `layout-16/17/18/19/20/21/22/23/25/26/27.config`. layout-24 references none.
