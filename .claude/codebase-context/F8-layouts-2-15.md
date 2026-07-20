I'll enumerate all files under the target layout directories first.
No imports from these layouts into `src/` — grep returned empty. Now let me run targeted greps across all these layout dirs to detect config-file usage and any bodh/app-specific content, then read every file.
Greps show these layouts are Metronic stock: they read their own `@/config/layout-N.config` + `@/config/general.config`, and notably REUSE `layout-1/shared/*` components (topbar, dialogs, mega-menu). All use a custom `@/src/lib/router-helpers` shim (133 refs) instead of react-router. Only 5 weak "marker" hits, all needing inspection. Now reading every file in full, starting with layout-2 and layout-3.
layout-2 confirmed pure stock (Metronic Team, KeenThemes links). Now layout-3.
layout-3 confirmed stock. Now layout-4 and layout-5 (includes the "Custom Reports" marker files).
layout-4 confirmed stock ("Custom Reports" is a fake API demo menu item; `/store-client` is stock Metronic). Now layout-5.
layout-5 confirmed stock. Now layout-6 and layout-7.
layout-6 confirmed stock. Now layout-7 and layout-8.
layout-7 confirmed stock (mega-menu reuses layout-1 shared sub-menus). Now layout-8 and layout-9.
layout-8 confirmed stock (note: leftover `console.log(pathname)` in main.tsx). Now layout-9.
layout-9 confirmed stock. Now layout-10.
layout-10 confirmed stock. Now layout-11 (includes the "Business-Focused Application Section" header-toolbar).
layout-11 confirmed stock (its own context.tsx, not layout-1's; the "Business-Focused Application Section" is just a comment in a stock user-dropdown). Now layout-12.
layout-12 confirmed stock (own context with sidebar toggle; generic "Chris Harris/Designers Hub/React Js" demo content). Now layout-13 (17 files).
layout-13 confirmed stock (secondary right sidebar; Thunder/Clarity/Lightning teams, same generic demo content). Now the remaining layout-13 files, then layout-14.
layout-13 fully confirmed stock ("AI Summary by Thunder" is demo content). layout-14 so far stock ("Reports" is a generic toolbar button, not bodh). Now remaining layout-14 files.
layout-14 confirmed stock. Now the final layout, layout-15 (23 files).
layout-15 stock so far ("Workspace"/"Upgrade", own pin/unpin layout-context). Now the final 9 layout-15 sidebar files.
All files read. Compiling the structured report.

---

# LAYOUTS 2–15 — FILE-BY-FILE DIGEST (bodhassess-app/components/layouts/)

## VERIFICATION SUMMARY (read first)
- **Grep for `src/` imports of `layouts/layout-{2..15}` → EMPTY.** No app source references any of these layouts. They are dead/unused by the running app (which uses only layout-1).
- **Grep for business markers** (`bodh|assess|questionnaire|axios|useQuery|apiFetch|/api/|candidate|report`) across all 14 dirs → only 5 hits, ALL generic stock template strings (detailed below). No bodh imports, no API calls, no business logic, no data fetching anywhere.
- **One universal, mechanical deviation from pure stock:** every file imports `Link` (default) and `usePathname` from `@/src/lib/router-helpers` instead of react-router-dom (133 refs). This is a project-wide router-shim adapter applied uniformly to ALL layouts; it carries no business logic.
- Every `footer.tsx` (layouts 2–10) is byte-identical: reads `@/config/general.config` `generalSettings`, links to keenthemes.com. Every toolbar breadcrumb/heading reads that layout's config `MENU_*`.

## COUPLING MODEL (two families)
- **Layouts 2–10** = "layout-1 satellites": wrap children in `LayoutProvider` imported from `@/components/layouts/layout-1/components/context`, and reuse layout-1 shared UI: `layout-1/shared/topbar/{chat-sheet,notifications-sheet,user-dropdown-menu,apps-dropdown-menu,topbar}`, `layout-1/shared/dialogs/search/search-dialog`, `layout-1/shared/mega-menu/mega-menu-sub-*` (7,9), `layout-1/shared/dropdown-menu/dropdown-menu-2` (9). **layout-4 also imports layout-5's `sidebar-menu-default`.**
- **Layouts 11–15** = self-contained: each has its OWN `context.tsx`/`layout-context.tsx` `LayoutProvider`, does NOT touch layout-1, and uses `next-themes` for a light/dark toggle. No shared-topbar reuse.

---

## layout-2/ (horizontal, no sidebar)
- `index.tsx`: entry; wraps `Main` in layout-1 `LayoutProvider`.
- `components/main.tsx`: shell — sticky Header + Navbar + toolbar with date-range Popover/Calendar; hides toolbar on `/layout-2/empty`.
- `components/header.tsx`: scroll-sticky header container (logo+topbar).
- `components/header-logo.tsx`: logo + `MENU_ROOT` team dropdown; text "Metronic Team". Reads `@/config/layout-2.config`.
- `components/header-topbar.tsx`: search/chat/notifications + user avatar (all layout-1 shared).
- `components/navbar.tsx`: bar wrapping NavbarMenu + NavbarLinks.
- `components/navbar-menu.tsx`: Menubar built from `MENU_HEADER[0].children`.
- `components/navbar-links.tsx`: hardcoded youtube/keenthemes docs/support links.
- `components/toolbar.tsx`: Toolbar/Heading/Breadcrumbs from `MENU_HEADER`.
- `components/footer.tsx`: stock Keenthemes footer.
Digest: sticky horizontal header + menubar navbar, no sidebar, date-range toolbar. Reads layout-2.config. Pure stock.

## layout-3/ (thin 58px icon sidebar + navbar)
- `index.tsx`: layout-1 `LayoutProvider` wrapper.
- `components/main.tsx`: fixed header + 58px sidebar + rounded content card + navbar; "Export" button → `/layout-3/empty`.
- `components/header.tsx`: fixed muted header.
- `components/header-logo.tsx`: mobile sheet (SidebarMenu) + `MENU_ROOT` dropdown; "Metronic Team". Reads layout-3.config.
- `components/header-topbar.tsx`: "Get Started" + search/chat/apps/notifications/user (layout-1 shared).
- `components/navbar.tsx`: rounded-top navbar bar.
- `components/navbar-menu.tsx`: Menubar; **dead code** — 4 identical `pathname.includes('/layout-3')` if/else branches. Reads `MENU_SIDEBAR`/`MENU_SIDEBAR_CUSTOM`.
- `components/navbar-links.tsx`: date-range Popover/Calendar.
- `components/sidebar.tsx`: fixed rail wrapping SidebarMenu.
- `components/sidebar-menu.tsx`: hardcoded icon list (Dashboard/Profile/Account/…/Docs→keenthemes), Tooltips.
- `components/toolbar.tsx` / `footer.tsx`: stock.
Digest: icon rail + rounded card + menubar navbar. Reads layout-3.config. Pure stock (has dead branch).

## layout-4/ (dual sidebar: 70px rail + 290px accordion)
- `index.tsx`: layout-1 `LayoutProvider`.
- `components/main.tsx`: mobile Header + Sidebar + content card; toolbar branches on `pathname.startsWith('/store-client')` → layout-1 `StoreClientTopbar` (stock Metronic store demo), else search/notifications/Export.
- `components/header.tsx`: mobile-only sheet header with SidebarPrimary+Secondary.
- `components/sidebar.tsx`: fixed dual (primary+secondary).
- `components/sidebar-primary.tsx`: 70px icon rail (Dashboard/Profile/…/Store-Client/API Keys), viewport-height calc, footer chat/apps/user (layout-1 shared).
- `components/sidebar-secondary.tsx`: renders SidebarMenuDashboard on `/layout-4`, else **layout-5's** `SidebarMenuDefault` (cross-layout import).
- `components/sidebar-menu-dashboard.tsx`: fake "Client API" dropdown + Config/Security/Analytics accordion. **⚑ "Custom Reports"** line (stock demo item, not bodh).
- `components/toolbar.tsx` / `footer.tsx`: stock; reads layout-4.config.
Digest: icon-rail + accordion secondary, content card. Pure stock.

## layout-5/ (header + navbar + 200px sidebar)
- `index.tsx`: layout-1 `LayoutProvider`.
- `components/main.tsx`: sticky header + navbar + 200px sidebar + date-range toolbar.
- `components/header.tsx`: scroll-sticky header.
- `components/header-logo.tsx`: three demo dropdowns — teams ("MetronicTeam"/"KeenTeam"), items ("Campaign"/"Fall Winter 2024"…), stagings; mobile sheet.
- `components/header-topbar.tsx`: "Add Teammate" + search/chat/apps/notifications/user (layout-1 shared).
- `components/navbar.tsx` / `navbar-menu.tsx`: horizontal tab links (Dashboards/Public Profiles/…).
- `components/sidebar.tsx`: wraps SidebarMenuDashboard.
- `components/sidebar-menu-dashboard.tsx`: same fake Client-API accordion; **⚑ "Custom Reports"** (stock).
- `components/sidebar-menu-default.tsx`: generic recursive `MENU_SIDEBAR` accordion builder (also consumed by layout-4). Reads layout-5.config.
- `components/toolbar.tsx` / `footer.tsx`: stock.
Digest: multi-dropdown header + tab navbar + accordion sidebar. Pure stock.

## layout-6/ (270px sidebar w/ header+footer)
- `index.tsx`: layout-1 `LayoutProvider`.
- `components/main.tsx`: sidebar + content card (no toolbar).
- `components/header.tsx`: mobile sheet (SidebarHeader/Menu/Footer).
- `components/sidebar.tsx`: fixed 270px (header+menu+footer).
- `components/sidebar-header.tsx`: logo + "Metronic Cloud" `MENU_ROOT` dropdown + search input (cmd+/). Reads layout-6.config.
- `components/sidebar-footer.tsx`: user/notifications/chat (layout-1 shared).
- `components/sidebar-menu.tsx`: primary + divider + secondary.
- `components/sidebar-menu-primary.tsx`: recursive accordion from `MENU_SIDEBAR_COMPACT`.
- `components/sidebar-menu-secondary.tsx`: hardcoded "Spaces"/"Favorites" groups (Metrics Hub/Data Lab/…).
- `components/toolbar.tsx`: stock breadcrumb toolbar.
- `components/toolbar-menu.tsx`: month-picker dropdown (defined; not wired into main — stock spare).
- `components/footer.tsx`: stock.
Digest: full 270px sidebar w/ search + dual accordion. Pure stock.

## layout-7/ (horizontal mega-menu, no sidebar)
- `index.tsx`: layout-1 `LayoutProvider`.
- `components/main.tsx`: sticky header + content + footer.
- `components/header.tsx`: scroll-sticky.
- `components/header-logo.tsx`: "Metronic" brand + desktop MegaMenu / mobile MegaMenuMobile sheet.
- `components/header-topbar.tsx`: "free 182/200 Uploads" + Upgrade + user (layout-1 shared).
- `components/mega-menu.tsx`: NavigationMenu reusing **layout-1 shared** `mega-menu-sub-{profiles,account,network,store,auth}`; reads `MENU_MEGA` (layout-7.config).
- `components/mega-menu-mobile.tsx`: recursive accordion from `MENU_MEGA_MOBILE` (self-defined MenuItem type).
- `components/toolbar.tsx` / `footer.tsx`: stock.
Digest: mega-menu header, no sidebar. Pure stock.

## layout-8/ (90px icon sidebar w/ flyout dropdowns)
- `index.tsx`: layout-1 `LayoutProvider`.
- `components/main.tsx`: mobile Header + 90px sidebar + content card. **⚑ leftover `console.log(pathname)`** (dev debug, harmless, still stock).
- `components/header.tsx`: mobile sheet.
- `components/sidebar.tsx`: fixed 90px (header+menu+footer).
- `components/sidebar-header.tsx`: square logo.
- `components/sidebar-footer.tsx`: chat/apps/user (layout-1 shared).
- `components/sidebar-menu.tsx`: icon buttons w/ DropdownMenu flyouts; children pulled from `MENU_SIDEBAR`/`MENU_HELP` (layout-8.config).
- `components/toolbar.tsx` / `footer.tsx`: stock.
Digest: compact icon sidebar, flyout submenus. Pure stock.

## layout-9/ (header + horizontal mega-menu navbar)
- `index.tsx`: layout-1 `LayoutProvider`.
- `components/main.tsx`: fixed header + mega-menu navbar + content.
- `components/header.tsx`: logo + search + topbar.
- `components/header-logo.tsx`: "Metronic" brand + mobile MegaMenuMobile sheet.
- `components/header-search.tsx`: static search input (cmd+/).
- `components/header-topbar.tsx`: chat/notifications/user (layout-1 shared) + "Pro" Switch + "Create" dropdown (layout-1 `dropdown-menu-2`).
- `components/navbar.tsx`: hosts MegaMenu.
- `components/mega-menu.tsx`: NavigationMenu reusing layout-1 shared mega-menu subs; reads `MENU_MEGA` (layout-9.config).
- `components/mega-menu-mobile.tsx`: recursive accordion from `MENU_MEGA_MOBILE`.
- `components/toolbar.tsx` / `footer.tsx`: stock.
Digest: header + horizontal mega-menu, no sidebar. Pure stock.

## layout-10/ (270px DARK sidebar)
- `index.tsx`: layout-1 `LayoutProvider`.
- `components/main.tsx`: body `bg-zinc-950`, mobile Header + dark sidebar + content card.
- `components/header.tsx`: mobile dark sheet.
- `components/sidebar.tsx`: fixed 270px `.dark` (header+menu+footer).
- `components/sidebar-header.tsx`: logo + "Metronic" dropdown + "Add New" + search-dialog (layout-1 shared). Reads layout-10.config `MENU_ROOT`.
- `components/sidebar-footer.tsx`: user/chat/apps (layout-1 shared).
- `components/sidebar-menu.tsx`: primary + secondary.
- `components/sidebar-menu-primary.tsx`: recursive accordion from `MENU_SIDEBAR_COMPACT`, "Pages" label.
- `components/sidebar-menu-secondary.tsx`: hardcoded brand-logo links (@keenthemes → keenthemes.com/github).
- `components/toolbar.tsx`: stock breadcrumb toolbar.
- `components/toolbar-menu.tsx`: month-picker dropdown (spare, unused in main).
- `components/footer.tsx`: stock.
Digest: dark 270px sidebar w/ add/search. Pure stock.

## layout-11/ (SELF-CONTAINED; header menu + 240px sidebar)
- `index.tsx`: uses own `LayoutProvider` (240px sidebar, 54px header vars).
- `components/context.tsx`: own LayoutProvider/useLayout; sets body class, `isMobile`, TooltipProvider. **No layout-1.**
- `components/wrapper.tsx`: Header + sidebar + content card.
- `components/header.tsx`: logo + horizontal HeaderMenu + HeaderToolbar.
- `components/header-logo.tsx`: mobile sheet (HeaderMenuMobile + SidebarMenu).
- `components/header-menu.tsx` / `header-menu-mobile.tsx`: horizontal nav / mobile dropdown from `MENU_HEADER` (layout-11.config).
- `components/header-toolbar.tsx`: "Add Team" + bell/settings + `next-themes` user dropdown ("Sean/Online", Set status, Mute, Profile…). **⚑ comment "Business-Focused Application Section"** — just a section comment above stock items (Keyboard shortcuts/Referrals/Download apps/Help), NOT bodh.
- `components/sidebar.tsx`: search + menu.
- `components/sidebar-menu.tsx`: grouped accordion from `MENU_SIDEBAR` (layout-11.config).
- `components/sidebar-search.tsx`: static search input.
- `components/toolbar.tsx`: presentational Toolbar/Heading/PageTitle/Description (no config).
Digest: self-contained; horizontal header menu + fixed sidebar; next-themes. Pure stock.

## layout-12/ (SELF-CONTAINED; collapsible 240px sidebar, social-feed style)
- `index.tsx`: own LayoutProvider.
- `components/context.tsx`: own provider w/ `isSidebarOpen`/`sidebarToggle`.
- `components/wrapper.tsx`: header + collapsible sidebar + main (transition guard).
- `components/header.tsx`: logo + search + toolbar.
- `components/header-logo.tsx`: mobile sheet (full sidebar) + "Metronic" brand + PanelRight collapse toggle.
- `components/header-search.tsx`: "Search Metronic" input.
- `components/header-toolbar.tsx`: Create/mails/notepad/settings + `next-themes` user dropdown ("Chris Harris/Senior Developer/Pro Plan", My Projects/Team/Org, Developer Tools→API Documentation).
- `components/sidebar.tsx`: primary menu + feeds + communities + resources.
- `components/sidebar-primary-menu.tsx`: grouped accordion from `MENU_SIDEBAR_MAIN` (layout-12.config).
- `components/sidebar-resources-menu.tsx`: collapsible from `MENU_SIDEBAR_RESOURCES`.
- `components/sidebar-communities.tsx`: hardcoded "Designers Hub/React Js/Node Js".
- `components/sidebar-feeds.tsx`: hardcoded "New order received/New customer registered".
- `components/toolbar.tsx`: presentational.
Digest: self-contained collapsible sidebar w/ feeds/communities; next-themes. Pure stock.

## layout-13/ (SELF-CONTAINED; left sidebar + right "AI" secondary sidebar)
- `index.tsx`: own LayoutProvider (adds `--sidebar-right-width`).
- `components/context.tsx`: own provider w/ `isSidebarSecondaryOpen`/`sidebarSecondaryToggle`.
- `components/wrapper.tsx`: header + left sidebar + toolbar (Coffee/MessageSquareCode/Pin/Search) + main + right secondary sidebar.
- `components/header.tsx` / `header-search.tsx`: "Search across teams".
- `components/header-logo.tsx`: 4 colored app buttons (Disc2/MessagesSquare/Zap/Plus) + mobile sheet.
- `components/header-toolbar.tsx`: bell/settings + `next-themes` user dropdown ("Sean") + "Create" dropdown (Documents/Project/Team/Template). **⚑ comment "Business-Focused Application Section"** — stock section comment, NOT bodh.
- `components/sidebar.tsx` / `sidebar-header.tsx`: team switcher ("Thunder/Clarity/Lightning/Bold Team").
- `components/sidebar-content.tsx`: primary menu + page + communities + resources.
- `components/sidebar-primary-menu.tsx` / `sidebar-resources-menu.tsx`: from `MENU_SIDEBAR_MAIN`/`_RESOURCES` (layout-13.config).
- `components/sidebar-page.tsx` / `sidebar-communities.tsx`: hardcoded demo lists.
- `components/sidebar-secondary.tsx` / `-header.tsx` / `-content.tsx` / `-mobile.tsx`: right "AI Summary by Thunder" panel — demo text about "Enhancing the Metronic dashboard".
- `components/toolbar.tsx`: breadcrumbs from `MENU_SIDEBAR_MAIN`.
Digest: self-contained dual (left nav + right AI panel); next-themes. Pure stock.

## layout-14/ (SELF-CONTAINED; 60px icon rail + 300px collapsible secondary + fixed toolbar tabs)
- `index.tsx`: own LayoutProvider (sidebar + collapsed + toolbar-height vars).
- `components/context.tsx`: own provider w/ `isSidebarOpen`/`sidebarToggle`.
- `components/wrapper.tsx`: header + sidebar + fixed toolbar (menu tabs + Sort/View/Filter/Search) + main.
- `components/header.tsx` / `header-breadcrumbs.tsx`: logo area + breadcrumbs.
- `components/header-logo.tsx`: team switcher ("Thunder/Clarity/Lightning/Bold AI") + collapse toggle + mobile sheet.
- `components/header-toolbar.tsx`: Coffee/MessageSquareCode/Pin/Search + `next-themes` user dropdown ("Chris Harris"). **⚑ `<Button><ClipboardList/> Reports</Button>`** — generic toolbar action alongside "Add"/"Sort"/"View"/"Filter", NOT bodh.
- `components/sidebar.tsx`: primary rail + secondary.
- `components/sidebar-primary.tsx`: 60px icon rail (Profile/Dashboard/Account/…) + mails/notepad/settings + user dropdown ("Chris Harris/Pro Plan/Developer Tools").
- `components/sidebar-secondary.tsx`: search + primary menu + workspaces + communities + resources.
- `components/sidebar-primary-menu.tsx` / `-resources-menu.tsx` / `-workspaces-menu.tsx`: from `MENU_SIDEBAR_MAIN`/`_RESOURCES`/`_WORKSPACES` (layout-14.config).
- `components/sidebar-communities.tsx` / `sidebar-search.tsx`: hardcoded demo / ⌘K search.
- `components/toolbar.tsx` / `toolbar-menu.tsx` / `toolbar-menu-mobile.tsx`: fixed toolbar + tab menu from `MENU_TOOLBAR`.
Digest: self-contained icon-rail + wide secondary + fixed tab toolbar; next-themes. Pure stock.

## layout-15/ (SELF-CONTAINED; ReUI CRM demo, pinnable nav)
- `index.tsx`: own `LayoutProvider` seeded with `MAIN_NAV` (layout-15.config).
- `components/layout-context.tsx`: own provider — sidebar collapse + pin/unpin nav-item state (`getSidebarNavItems`, `NavConfig`).
- `components/layout.tsx`: dark header + collapsible sidebar + main; sets CSS vars.
- `components/header.tsx`: dark top bar (brand/upgrade/new/help/users).
- `components/header-brand.tsx`: logo + mobile sheet (SidebarContent).
- `components/header-upgrade.tsx` / `header-new.tsx` / `header-help.tsx`: gradient Upgrade / New / Help buttons.
- `components/header-users.tsx`: 3 stacked demo avatars.
- `components/header-search.tsx` & `secondary-header.tsx`: **near-identical duplicate "Workspace" stub headers, not wired into layout-15's Header** (dead/spare stock stubs).
- `components/content.tsx` / `content-header.tsx`: exported page-content helpers (ContentHeader has collapse toggle).
- `components/sidebar.tsx` / `sidebar-content.tsx`: default vs workspace-settings mode switch.
- `components/sidebar-default.tsx` / `-header.tsx` / `-content.tsx` / `-nav.tsx` / `-favorites.tsx` / `-footer.tsx`: workspace dropdown ("Keenthemes/Studio/ReUI"), pinnable AccordionMenu nav (tasks/more dropdowns), collapsible Favorites (New task/New deal…), Invite/Help footer.
- `components/sidebar-workspace.tsx`: workspace-settings panel — mock "Acme Corporation" Pro workspace, menu items with **hardcoded `/crm/settings/*` hrefs** (stock ReUI CRM demo routes, NOT bodh), "John Doe", "Back to CRM".
Digest: self-contained ReUI CRM shell w/ pin/collapse; `/crm/*` demo routes are template stock, not app routes. Pure stock.

---

## SYNTHESIS
**CONFIRMED: layouts 2–15 are unused stock Metronic/ReUI template variants.** No `src/` code imports any of them; none contain bodh imports, API/HTTP calls, data-fetching hooks, or business logic. All visible content is Keenthemes demo placeholder (Metronic Team, Keenthemes Inc, fake teams/communities/feeds, `/crm/settings/*` demo hrefs, Chris Harris/John Doe/Sean, etc.).

**Exceptions / caveats (none are bodh business logic — all mechanical or stock):**
1. **Router shim (universal):** all files use `Link`/`usePathname` from `@/src/lib/router-helpers` — the only project-wide edit vs. vanilla Metronic; an adapter, not logic. This is the sole thing tying these files to the bodh repo scaffolding.
2. **layout-1 coupling:** layouts 2–10 depend on layout-1's `LayoutProvider` + `layout-1/shared/*` (topbar/dialogs/mega-menu). So they are NOT deletable in isolation without also retaining layout-1's shared subtree. Layouts 11–15 are fully self-contained (own context + next-themes).
3. **Cross-layout dep:** layout-4 imports layout-5's `sidebar-menu-default`.
4. **Stock leftovers (harmless):** `console.log(pathname)` in layout-8/main.tsx; dead `if/else` branches in layout-3/navbar-menu.tsx; unused spare components (layout-6/layout-10 `toolbar-menu.tsx`, layout-15 `header-search.tsx`/`secondary-header.tsx`).
5. **The 5 "marker" grep hits are all false positives:** "Custom Reports" (layout-4/5 demo menu), "Business-Focused Application Section" (layout-11/13 code comment), "Reports" button (layout-14 generic toolbar action). None reference bodhassess.

Config dependency map: layout-N reads `@/config/layout-N.config` (+ `general.config` for footers, `@/config/types` for MenuConfig/MenuItem). These 14 config files are the only other files these layouts pull from outside `components/ui/*`, `hooks/*`, `lib/*`.
