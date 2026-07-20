I'll enumerate all files in the target layout directories first.
No src/ imports these layouts. Now let me scan all these files for app-specific markers, then read them in bulk.
No app-specific markers. All imports are stock (`@/components/ui`, `@/lib`, `@/hooks`, `@/config`). Let me check which config files each layout reads and confirm the config import pattern.
These layouts import `@/src/lib/router-helpers` (a Vite/Next shim). Let me verify that's a routing shim (not business logic), check the config files exist, and confirm none of these Layout28–39 exports are referenced by the app.
Confirmed: `router-helpers` is a thin react-router shim (adapts stock Next.js `Link` API), and Layout28–39 are referenced nowhere in `src/` or `components/` — the app only uses `Layout1`. Let me verify the `@/config` path resolution and whether the config files these layouts import actually exist.
All config imports resolve (`@/*` → project root). Config files exist for layouts 30/31/32/34; the others are self-contained. Now let me read all files in full, grouped by layout. Starting with 28–31.
The pattern is clear — all stock Metronic/ReUI demo content (Chris Harris, "Metronic" brand, dummy API service trees). Let me read the rest of this dump.
Layouts 28-31 fully digested, all stock. Now layouts 32-35.
Continuing to read the rest of layout-34 and layout-35.
Layouts 32-35 confirmed stock. Now layouts 36, 38, 39.
Layout 36 (dark calendar) and 38 (AI chat "KeenAI") are stock. Let me read the rest (38 tail + 39).
Layouts 36, 38, 39 confirmed stock. Now the last one, layout-37 (mail/email app, 30 files).
Layout-37 is a stock mail app. Let me read the remaining files to complete coverage.
I have now read every file in layouts 28-39 in full. Here is the complete structured digest.

---

# LAYOUTS 28-39 — FILE-BY-FILE DIGEST

## Cross-cutting facts (apply to ALL 12 layouts)
- **NONE are imported anywhere in `src/` or `components/`.** `grep` for `Layout2[89]|Layout3[0-9]` outside their own dirs = 0 hits. App uses ONLY `Layout1` (`src/components/private-route.tsx`, `src/components/app-shell.tsx`).
- Every layout: `index.tsx` exports `LayoutNN({children})` → `<LayoutProvider style={cssVars}><Wrapper>{children}</Wrapper></LayoutProvider>`.
- Every layout has near-identical `components/context.tsx` = `LayoutProvider` + `useLayout()` hook (sets CSS vars on `document.documentElement`, body data-attrs, `useIsMobile`, `TooltipProvider`).
- Shared deps only: `@/components/ui/*` (Metronic/ReUI kit), `@/lib/helpers` (`toAbsoluteUrl`), `@/lib/utils` (`cn`), `@/hooks/{use-mobile,use-scroll-position,use-menu}`, `next-themes`, `lucide-react`, `@remixicon/react`, `@headless-tree/*`, `react-hook-form`+`zod`+`sonner` (in 35/37/39 dialogs).
- **The one non-`@/components/ui` internal import is `@/src/lib/router-helpers`** — verified to be a thin react-router shim (`src/lib/router-helpers.tsx`) that re-exports `Link`/`usePathname`/`useSearchParams`/`useRouter` and adapts stock Metronic's Next.js `Link href=` API to react-router. NOT business logic.
- Config-reading layouts: **30, 31, 32, 34** import `@/config/layout-NN.config`. `@/*`→ project root, so these resolve to `/config/layout-{30,31,32,34}.config.tsx` (all exist). Layouts 28,29,33,35,36,37,38,39 hardcode demo data inline (no config).
- All placeholder demo content, zero bodh: brand strings "Metronic"/"Keenthemes"/"ReUI"/"KeenAI"/"KeenTodo", users "Chris Harris/Senior Developer", "Alex Doe", "John Doe", `reui.io` emails, `/media/avatars/300-*.png`. All internal links point to `/layout-NN` or `#`. No API calls, no axios/fetch, no bodh imports.

## Per-file roles

**layout-28** (fixed top header + floating left sidebar; dotted SVG bg): `context.tsx`: provider. `header-logo.tsx`: logo+mobile sheet+HeaderMenu. `header-menu.tsx`: Tabs nav (Dashboards/Profiles/…). `header-toolbar.tsx`: create btn + icon btns + user dropdown. `header.tsx`: header shell. `sidebar-content.tsx`: accordion of template cards (Form/Facebook/Code…). `sidebar.tsx`: fixed sidebar wrapper. `toolbar.tsx`: Toolbar/Heading/PageTitle helpers. `wrapper.tsx`: header+sidebar+main. `index.tsx`: Layout28.

**layout-29** (collapsible rounded floating sidebar): `context.tsx`. `header.tsx`: mobile logo+sheet+navbar. `navbar.tsx`: icon btns + UserDropdownMenu. `sidebar-content.tsx`: header+primary+scroll(secondary). `sidebar-header.tsx`: logo "Metronic" + collapse btn. `sidebar-primary.tsx`: Tabs + framework Select. `sidebar-secondary.tsx`: `@headless-tree` Tree of mock API/DevOps services + team members. `sidebar.tsx`. `toolbar.tsx`. `user-dropdown-menu.tsx`: full user menu. `wrapper.tsx`. `index.tsx`.

**layout-30** (icon sidebar 60px + secondary accordion menu 240px; **reads layout-30.config** `MENU_SIDEBAR_MAIN`,`MENU_SIDEBAR`): `context.tsx`. `header-breadcrumbs.tsx`. `header-logo.tsx`. `header-search.tsx`: "Search Metronic". `header-title.tsx`/`header-title-default.tsx`: workspace dropdowns (Keenthemes/Studio/ReUI mock). `header.tsx`. `navbar.tsx`: Tabs. `sidebar-content.tsx`: icon menu from config + footer user menu. `sidebar-menu.tsx`: AccordionMenu from config. `sidebar.tsx`. `toolbar.tsx`. `wrapper.tsx`. `index.tsx`.

**layout-31** (icon rail 60px, content in bordered card; **reads layout-31.config** `MENU_SIDEBAR_MAIN`): `context.tsx` (adds aside-expanded state). `header-mobile.tsx`. `navbar.tsx`: inbox Tabs (Compose/Inbox/Sent…). `sidebar-content.tsx`: icon menu from config + user menu. `sidebar-header.tsx`: logo-35.svg. `sidebar.tsx`. `toolbar-search.tsx`: "Search inbox ⌘K". `toolbar.tsx`. `wrapper.tsx`. `index.tsx`.

**layout-32** (sticky landing/marketing header; **reads layout-32.config** `MENU_HEADER`; uses use-menu+use-scroll-position): `context.tsx` (headerSticky). `header-logo.tsx`: project selector dropdown. `header-search.tsx`. `header-toolbar.tsx`: horizontal MENU_HEADER nav + Login/Signup. `header.tsx`. `sidebar-menu.tsx`: mobile nav from config. `toolbar.tsx`. `wrapper.tsx`: header + main only. `index.tsx`.

**layout-33** (collapsible floating sidebar, template grid): `context.tsx`. `header.tsx`: mobile logo+sheet+navbar. `navbar.tsx`. `sidebar-content.tsx`: grid of nav cards (Dashboard/UI Bloks/…). `sidebar-footer.tsx`: user menu + icon btns. `sidebar-header.tsx`: "Metronic". `sidebar.tsx`. `toolbar.tsx`. `user-dropdown-menu.tsx`. `wrapper.tsx`. `index.tsx`.

**layout-34** (header mega-menu + collapsible docs sidebar; **reads layout-34.config** `MENU_HEADER`): `context.tsx`. `header-logo.tsx`. `header-menu.tsx`/`header-menu-mobile.tsx`: dropdown mega-menus from config. `header-toolbar.tsx`: github/x/theme + Buy Now. `header.tsx`. `pattern.tsx`: striped bg helper. `sidebar-content.tsx`. `sidebar-menu.tsx`: hardcoded nav items. `sidebar-search.tsx`. `sidebar-tree.tsx`: AccordionMenu UI-blocks tree (Cards/Charts/…). `sidebar.tsx`. `wrapper.tsx`. `index.tsx`.

**layout-35** (dark sticky header, no sidebar; uses use-scroll-position): `context.tsx`. `header-logo.tsx`: logo + WorkspaceMenu. `header-toolbar.tsx`: settings/bell + user menu. `header.tsx`. `logo.tsx`: inline SVG. `navbar.tsx`: nav items + More dropdown. `toolbar.tsx`. `workspace-menu.tsx`: workspace switcher + create-workspace Dialog (react-hook-form+zod+sonner toast, all local state). `wrapper.tsx`. `index.tsx`.

**layout-36** (dark calendar sidebar): `avatar.tsx`: AvatarDemo stack. `context.tsx` (aside state). `header-mobile.tsx`. `sidebar-calendar.tsx`: Calendar widget + mock events. `sidebar-calendar-menu.tsx`: Events/Meetings/Tasks list. `sidebar-footer.tsx`: "John White" user dropdown. `sidebar-header.tsx`. `sidebar.tsx`. `toolbar.tsx` (+ToolbarSidebarToggle). `wrapper.tsx`. `index.tsx`.

**layout-37** (full EMAIL CLIENT, 30 files): `context.tsx` (mail-view/sidebar-collapse state). `aside.tsx`/`aside-content.tsx`: right icon rail. `category-selector.tsx`: mail category checkboxes. `compose-message.tsx`/`reply.tsx`: compose/reply dialogs w/ rich-text toolbar + **mock "Generate"** (setTimeout + static email templates). `generate.tsx`: AI-content accept/reject dialog. `create-label.tsx`/`header-mobile.tsx`. `mail-list-*.tsx` (empty/header/wrapper): mail list. `mail-view-*.tsx` (empty/header/wrapper/message-header/body/footer): mail reader w/ mock attachments (John Doe, Google AI course). `sidebar*.tsx` (content/header/footer/mail/labels/contacts): nav (Kou Tanaka/reui.io). `user-panel.tsx`: account switcher (→`/logout` generic). `zero-chat.tsx`: **mock AI chat** (setTimeout + random canned replies). `wrapper.tsx`. `index.tsx`.

**layout-38** (AI-chat sidebar "KeenAI"): `context.tsx`. `ai-model-selector.tsx`/`model-selector.tsx`: **mock AI model pickers (GPT-4/Claude/Gemini — placeholder strings)**. `new-chat-button.tsx`. `pinned-chats.tsx`/`recent-chats.tsx`: static chat threads (`RECENT_CHATS`). `quick-actions.tsx`. `section-header.tsx`. `sidebar*.tsx` (content/header/footer). `header.tsx`. `toolbar.tsx`. `types.ts`: ChatThread/AIModel interfaces. `user-dropdown-menu.tsx`: "AI Assistant" menu. `wrapper.tsx`. `index.tsx`.

**layout-39** (todo app "KeenTodo" + right AI aside): `context.tsx` (aside state). `add-tag.tsx`/`new-task.tsx`: dialogs (local state + sonner). `aside.tsx`: right "AI Assistant" panel (empty placeholder). `header-mobile.tsx`. `pattern.tsx`. `sidebar*.tsx`: content/header/footer + `sidebar-todo-list.tsx` (All Tasks/Today/…), `sidebar-tags.tsx` (Work/Personal/…), `sidebar-focus-card.tsx` (progress bar). `toolbar.tsx`/`toolbar-search.tsx`. `user-dropdown-menu.tsx`: "Alex Doe" menu. `wrapper.tsx`. `index.tsx`.

## SYNTHESIS

**CONFIRMED: layouts 28-39 are 100% unused stock Metronic/ReUI template variants — dead code.**

Evidence: (1) not imported anywhere outside their own directories; (2) app wires only `Layout1`; (3) zero bodh/business content — no API calls, no bodh imports, no real routes (all links → `/layout-NN` or `#`); all data is inline placeholder (Chris Harris, reui.io, Metronic/KeenAI/KeenTodo brands, avatars/300-*.png); (4) each is a self-contained demo shell (dashboard/landing/mail/calendar/AI-chat/todo variants).

**NO exceptions found** — no file contains app-specific logic.

**Two things worth flagging to the lead (not exceptions, just anti-false-positives):**
1. The only cross-boundary import from these layouts is `@/src/lib/router-helpers` — a real file in the app's `src/`, but it's a generic react-router compatibility shim, not business logic. These stock layouts depend on it; the app does not depend on the layouts.
2. Layouts **37, 38, 39** contain "AI"/"Generate"/"Ask AI"/model-selector features naming **Claude/GPT-4/Gemini** and an "AI Assistant" — these are entirely **mock** (setTimeout + hardcoded template strings / random canned replies, `console.log`). No LLM SDK, no Anthropic/OpenAI API, no network calls. Do not mistake these for real AI integrations.
