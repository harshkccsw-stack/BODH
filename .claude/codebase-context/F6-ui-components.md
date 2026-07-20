I'll enumerate all files in the target directory first.
77 files. Let me read them in full, batching parallel reads. Starting with the first group.
Continuing with the next batch.
Continuing with the data-grid stack and other complex files.
Continuing with remaining data-grid files and next batch.
Continuing with the next batch.
Note: file-upload.tsx is empty. Continuing.
Continuing with next batch.
Continuing.
Continuing.
Continuing with the remaining files.
Reading the final batch.
Final batch.
Reading the last 3 files.
I still need to read chart.tsx which I missed.
I have now read all 77 files in full. Here is the structured data.

---

# components/ui/ — Full Inventory (bodhassess-app)

## GLOBAL CONVENTIONS
- Library: **ReUI** (KeenThemes, same team as Metronic) — a richer superset of shadcn/ui. Not vanilla shadcn.
- Radix imported via the **meta-package** `radix-ui` (e.g. `import { Dialog as DialogPrimitive } from 'radix-ui'`) in most files; a few use per-package `@radix-ui/react-*` (context-menu, hover-card, form's `Slot`, command's `DialogProps`, kanban/sortable's `Slot`).
- Every component: `cn` from `@/lib/utils`, a `data-slot="..."` attribute, `cva` variant tables.
- Animation: `motion/react` everywhere EXCEPT `sliding-number.tsx` which uses `framer-motion`.
- All files are `.tsx`, function components, named exports (dialog.tsx also has a `default export DialogContent`).

## PER-FILE (name — primitive/role — exports; ⚠ = deviation/custom/composite)

**accordion-menu.tsx** ⚠ APP-CUSTOM. Sidebar nav menu built on Radix Accordion with path-matching (`matchPath`), selected-value tracking, nested single/multiple state machine, `onItemClick`. Contains an explicit **bodh patch** (lines 237–242): `AccordionMenuItem`'s trigger `onClick` only calls `e.preventDefault()` when the click target is NOT inside an `<a>` — so React-Router `<Link>` navigation inside menu items is not swallowed. This is the primary sidebar menu component. Exports: `AccordionMenu, AccordionMenuGroup, AccordionMenuIndicator, AccordionMenuItem, AccordionMenuLabel, AccordionMenuSeparator, AccordionMenuSub, AccordionMenuSubContent, AccordionMenuSubTrigger, type AccordionMenuClassNames`.

**accordion.tsx** — Radix accordion, variants default/outline/solid, indicator arrow/plus. Exports: `Accordion, AccordionItem, AccordionTrigger, AccordionContent`.

**alert-dialog.tsx** — Radix alert-dialog; `AlertDialogAction` accepts button `variant`. Exports: `AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogOverlay, AlertDialogPortal, AlertDialogTitle, AlertDialogTrigger`.

**alert.tsx** — Rich alert w/ variant(secondary/primary/destructive/success/info/mono/warning) × appearance(solid/outline/light/stroke) × size, optional close button (uses `Button`). Exports: `Alert, AlertContent, AlertDescription, AlertIcon, AlertTitle, AlertToolbar`.

**aspect-ratio.tsx** — Radix aspect-ratio. Exports: `AspectRatio`.

**avatar-group.tsx** ⚠ Fancy motion-animated avatar stack with hover tooltip (spring rotate/translate), animation modes default/flip/reveal. Exports: `AvatarGroup, AvatarGroupItem, AvatarGroupTooltip`.

**avatar.tsx** — Radix avatar + status indicator (online/offline/busy/away). Exports: `Avatar, AvatarFallback, AvatarImage, AvatarIndicator, AvatarStatus, avatarStatusVariants`.

**badge.tsx** — Badge w/ variant × appearance(default/light/outline/ghost) × size(xs–lg) × shape; uses CSS-var color fallbacks. Exports: `Badge, BadgeButton, BadgeDot, badgeVariants`; types `BadgeProps, BadgeButtonProps, BadgeDotProps`.

**breadcrumb.tsx** — Stock breadcrumb. Exports: `Breadcrumb, BreadcrumbEllipsis, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator`.

**button.tsx** ⚠ CENTRAL. Huge `buttonVariants` cva: variant(primary/mono/destructive/secondary/outline/dashed/ghost/dim/foreground/inverse) × mode(default/icon/link/input) × size(sm/md/lg/icon) × appearance × shape × autoHeight × underline/underlined × placeholder. `mode="input"` makes it look like an input (used as select/date triggers). `ButtonArrow` accepts any Lucide icon. Exports: `Button, ButtonArrow, buttonVariants`. **Imported by many other UI files** (alert, code, carousel, data-grid stack, github-button reuse).

**calendar.tsx** — `react-day-picker` DayPicker wrapper, styled via buttonVariants. Exports: `Calendar`.

**card.tsx** — Card w/ context-driven variant(default/accent); sub-parts. Exports: `Card, CardContent, CardDescription, CardFooter, CardHeader, CardHeading, CardTable, CardTitle, CardToolbar`.

**carousel.tsx** — `embla-carousel-react` wrapper, keyboard nav. Exports: `type CarouselApi, Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext`.

**chart.tsx** ⚠ COMPOSITE. Recharts wrapper (shadcn chart). `ChartContainer` injects per-theme CSS vars via `ChartStyle` (dangerouslySetInnerHTML) from a `ChartConfig` map. Exports: `ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, ChartStyle`; type `ChartConfig`. Deps: `recharts`.

**checkbox.tsx** — Radix checkbox, size sm/md/lg, indeterminate via Minus icon. Exports: `Checkbox`.

**code.tsx** ⚠ Uses `@/hooks/use-copy-to-clipboard`; inline `<code>` w/ optional copy button (variant default/destructive/outline, size). Exports: `Code, codeVariants`; type `CodeProps`.

**collapsible.tsx** — Radix collapsible. Exports: `Collapsible, CollapsibleContent, CollapsibleTrigger`.

**command.tsx** — `cmdk` wrapper; `CommandDialog` uses local Dialog. Exports: `Command, CommandCheck, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut`. Dep: `cmdk`, `@radix-ui/react-dialog` (DialogProps type).

**context-menu.tsx** — Stock Radix context-menu (uses `@radix-ui/react-context-menu` directly). Exports: full `ContextMenu*` set (15 exports incl. Sub/Radio/Checkbox items).

**counting-number.tsx** ⚠ Motion count-up number, in-view triggered. Exports: `CountingNumber`.

### DATA GRID STACK (all interlocked, TanStack Table)
**data-grid.tsx** ⚠ CORE. Provider/context. Defines `DataGridProps<TData>` (table, recordCount, isLoading, loadingMode 'skeleton'|'spinner', empty/loadingMessage, onRowClick, `tableLayout` {dense,cellBorder,rowBorder,rowRounded,stripped,headerBackground/Border/Sticky,width 'auto'|'fixed',columns{Visibility,Resizable,Pinnable,Movable,Draggable},rowsDraggable}, `tableClassNames`). Augments TanStack `ColumnMeta` (headerTitle, headerClassName, cellClassName, skeleton, expandedContent). Also types `DataGridApiFetchParams`, `DataGridApiResponse<T>` ({data, empty, pagination:{total,page}}), `DataGridRequestParams`. Exports: `useDataGrid, DataGridProvider, DataGrid, DataGridContainer`.
**data-grid-table.tsx** ⚠ The full table renderer (head/body/rows/cells, pinning styles, skeleton loading, row-select checkboxes, expanded rows, empty + spinner loader). Exports ~18 `DataGridTable*` incl. `DataGridTable, DataGridTableRowSelect, DataGridTableRowSelectAll, DataGridTableEmpty, DataGridTableLoader`.
**data-grid-column-header.tsx** ⚠ Sortable/pinnable/movable/visibility column header w/ dropdown menu. Exports: `DataGridColumnHeader, type DataGridColumnHeaderProps`.
**data-grid-column-filter.tsx** ⚠ Faceted multi-select filter (Popover+Command). Exports: `DataGridColumnFilter, type DataGridColumnFilterProps`.
**data-grid-column-visibility.tsx** — Column toggle dropdown. Exports: `DataGridColumnVisibility`.
**data-grid-pagination.tsx** ⚠ Page-size Select + page buttons w/ ellipsis groups, `{from}-{to} of {count}` template. Exports: `DataGridPagination, type DataGridPaginationProps`.
**data-grid-table-dnd.tsx** ⚠ Column-drag variant (dnd-kit). **Contains a leftover `console.log('table.getState().columnOrder:'...)` at line 115.** Exports: `DataGridTableDnd`.
**data-grid-table-dnd-rows.tsx** ⚠ Row-drag variant (dnd-kit). Exports: `DataGridTableDndRowHandle, DataGridTableDndRows`.

**datefield.tsx** — `react-aria-components` date/time field, reuses `inputVariants`. Exports: `DateField, DateInput, DateSegment, TimeField, dateInputStyles`; type `DateInputProps`.

**dialog.tsx** — Radix dialog, variant default/fullscreen, `showCloseButton`/`overlay` props, `DialogBody`. Exports (+default `DialogContent`): `Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger`.

**drawer.tsx** — `vaul` drawer. Exports: `Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerOverlay, DrawerPortal, DrawerTitle, DrawerTrigger`.

**dropdown-menu.tsx** — Radix dropdown, `variant="destructive"` items, `data-here`/`data-active` states. Exports: full set (15) incl. `DropdownMenuCheckboxItem, DropdownMenuRadioItem, DropdownMenuSub*, DropdownMenuPortal`.

**file-upload.tsx** ⚠ **EMPTY FILE (0 bytes).** No exports. Any import from here will fail.

**form.tsx** — react-hook-form wrapper (shadcn form). Exports: `Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, useFormField`. Deps: `react-hook-form`, `@radix-ui/react-slot`.

**github-button.tsx** ⚠ Animated GitHub star button (count-up, star fill, repo navigation). Exports: `GithubButton, githubButtonVariants`; type `GithubButtonProps`.

**gradient-background.tsx** ⚠ Motion animated gradient. Exports: `GradientBackground, type GradientBackgroundProps`.
**grid-background.tsx** ⚠ Animated grid + laser beams (decorative). Exports: `GridBackground, type GridBackgroundProps`.
**hover-background.tsx** ⚠ Parallax animated blobs bg (decorative). Exports: `HoverBackground, type HoverBackgroundProps`.

**hover-card.tsx** — Radix hover-card (`@radix-ui/react-hover-card`). Exports: `HoverCard, HoverCardTrigger, HoverCardContent`.

**input-otp.tsx** — `input-otp` lib wrapper. Exports: `InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator`.

**input.tsx** ⚠ CENTRAL. `inputVariants` (sm/md/lg) + `InputAddon`, `InputGroup`, `InputWrapper` composites with heavy `[&_[data-slot=...]]` sibling styling for addon/button/datefield groups. Exports: `Input, InputAddon, InputGroup, InputWrapper, inputVariants, inputAddonVariants`. `inputVariants` reused by datefield.

**kanban.tsx** ⚠ Full dnd-kit kanban board. Exports: `Kanban, KanbanBoard, KanbanColumn, KanbanColumnHandle, KanbanItem, KanbanItemHandle, KanbanColumnContent, KanbanOverlay`; types `KanbanMoveEvent, KanbanRootProps, KanbanBoardProps, KanbanColumnProps, KanbanColumnHandleProps, KanbanItemProps, KanbanItemHandleProps, KanbanColumnContentProps, KanbanOverlayProps`.

**kbd.tsx** — Keyboard key. Exports: `Kbd, kbdVariants`.
**label.tsx** — Radix label, variant primary/secondary. Exports: `Label`.
**marquee.tsx** ⚠ Scrolling marquee (CSS animation, `animate-marquee`). Exports: `Marquee`.

**menubar.tsx** — Radix menubar (full set, 16 exports). Exports: `Menubar, MenubarCheckboxItem, MenubarContent, MenubarGroup, MenubarItem, MenubarLabel, MenubarMenu, MenubarPortal, MenubarRadioGroup, MenubarRadioItem, MenubarSeparator, MenubarShortcut, MenubarSub, MenubarSubContent, MenubarSubTrigger, MenubarTrigger`.

**navigation-menu.tsx** — Radix navigation-menu w/ viewport. Exports: `NavigationMenu, NavigationMenuList, NavigationMenuItem, NavigationMenuContent, NavigationMenuTrigger, NavigationMenuLink, NavigationMenuIndicator, NavigationMenuViewport, navigationMenuTriggerStyle`.

**pagination.tsx** — Static pagination shell (note: NO `PaginationLink`/`Previous`/`Next` — trimmed). Exports: `Pagination, PaginationContent, PaginationEllipsis, PaginationItem`.

**popover.tsx** — Radix popover. Exports: `Popover, PopoverContent, PopoverTrigger`.

**progress.tsx** ⚠ Linear `Progress` + `ProgressCircle` (SVG ring) + `ProgressRadial` (SVG arc, gauge). Exports: `Progress, ProgressCircle, ProgressRadial`.

**radio-group.tsx** — Radix radio, context-driven size, variant primary/mono. Exports: `RadioGroup, RadioGroupItem`.

**resizable.tsx** — `react-resizable-panels`. Exports: `ResizableHandle, ResizablePanel, ResizablePanelGroup`.

**scroll-area.tsx** — Radix scroll-area, `viewportRef`/`viewportClassName` props. Exports: `ScrollArea, ScrollBar`.

**scrollspy.tsx** ⚠ Scroll-spy nav highlighter, URL-hash sync, `data-{attr}-anchor` driven. Exports: `Scrollspy`.

**select.tsx** ⚠ Radix select w/ context `indicatorPosition` (left/right), custom `indicator`, `indicatorVisibility`; size sm/md/lg. Exports: `Select, SelectContent, SelectGroup, SelectIndicator, SelectItem, SelectLabel, SelectScrollDownButton, SelectScrollUpButton, SelectSeparator, SelectTrigger, SelectValue`.

**separator.tsx** — Radix separator. Exports: `Separator`.

**sheet.tsx** — Radix dialog as side sheet (side top/bottom/left/right), `overlay`/`close` props, `SheetBody`. Exports: `Sheet, SheetBody, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetOverlay, SheetPortal, SheetTitle, SheetTrigger`.

**shimmering-text.tsx** ⚠ Motion shimmer text. Exports: `ShimmeringText`.
**skeleton.tsx** — `animate-pulse` box. Exports: `Skeleton`.
**slider.tsx** — Radix slider + separate `SliderThumb`. Exports: `Slider, SliderThumb`.
**sliding-number.tsx** ⚠ Odometer digit animation. **Uses `framer-motion` (not `motion/react`).** Exports: `SlidingNumber`.

**sonner.tsx** ⚠ Toaster. **Uses `next-themes` `useTheme`** (unusual in a Vite/React-Router app — depends on a `next-themes` ThemeProvider being present). Exports: `Toaster`. Dep: `sonner`, `next-themes`.

**sortable.tsx** ⚠ **DUPLICATE + EXTENSION.** Contains a verbatim copy of ALL of kanban.tsx PLUS new generic `Sortable`, `SortableItem`, `SortableItemHandle` (strategy horizontal/vertical/grid, DragOverlay). Re-exports both the full Kanban set AND the sortable set. Exports: `Kanban, KanbanBoard, KanbanColumn, KanbanColumnHandle, KanbanItem, KanbanItemHandle, KanbanColumnContent, KanbanOverlay, Sortable, SortableItem, SortableItemHandle`; types `SortableRootProps, SortableItemProps, SortableItemHandleProps` (+ all Kanban types).

**stepper.tsx** ⚠ Full wizard/stepper (context, keyboard nav, indicators, panels/content). Exports: `useStepper, useStepItem, Stepper, StepperItem, StepperTrigger, StepperIndicator, StepperSeparator, StepperTitle, StepperDescription, StepperPanel, StepperContent, StepperNav`; types `StepperProps, StepperItemProps, StepperTriggerProps, StepperContentProps`.

**svg-text.tsx** ⚠ SVG-masked text fill (decorative). Exports: `SvgText`; type `SvgTextProps`.

**switch.tsx** ⚠ Radix switch w/ `SwitchWrapper` (permanent context) + `SwitchIndicator` (on/off labels inside track); shape pill/square, size sm–xl. Exports: `Switch, SwitchIndicator, SwitchWrapper`.

**table.tsx** — Plain static table primitives (separate from data-grid). Exports: `Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow`.

**tabs.tsx** — Radix tabs, context-driven variant(default/button/line) × size × shape(pill). Exports: `Tabs, TabsContent, TabsList, TabsTrigger`.

**textarea.tsx** — variant sm/md/lg. Exports: `Textarea, textareaVariants`.

**text-reveal.tsx** ⚠ Motion char/word reveal, 12 animation variants. Exports: `TextReveal`.

**toggle.tsx** — Radix toggle, variant default/outline, size. Exports: `Toggle, toggleVariants`.
**toggle-group.tsx** — Radix toggle-group, shares `toggleVariants` via context. Exports: `ToggleGroup, ToggleGroupItem`.

**tooltip.tsx** — Radix tooltip, variant light/dark (default dark), self-wraps a `TooltipProvider`. Exports: `Tooltip, TooltipContent, TooltipProvider, TooltipTrigger`.

**tree.tsx** ⚠ Tree view on `@headless-tree/core` `ItemInstance`; toggle icon chevron/plus-minus; drag line. Has `console.warn` fallbacks. Exports: `Tree, TreeItem, TreeItemLabel, TreeDragLine`. Dep: `@headless-tree/core`.

**typing-text.tsx** ⚠ Typewriter effect, single or cycling `texts[]`. Exports: `TypingText`.
**video-text.tsx** ⚠ Canvas video-masked text (decorative). Exports: `VideoText`; type `VideoTextProps`.
**word-rotate.tsx** ⚠ Rotating word carousel (fade/slide/scale/flip). Exports: `WordRotate`.

---

## SYNTHESIS

### (a) Non-stock external deps introduced by this folder
`@tanstack/react-table` (data-grid stack), `@dnd-kit/core|sortable|modifiers|utilities` (kanban, sortable, data-grid-dnd), `recharts` (chart), `react-hook-form` (form), `react-aria-components` (datefield), `react-day-picker` (calendar), `embla-carousel-react` (carousel), `cmdk` (command), `input-otp`, `vaul` (drawer), `react-resizable-panels` (resizable), `@headless-tree/core` (tree), `sonner`+`next-themes` (sonner), `motion/react` (all animations) and `framer-motion` (sliding-number only). Local: `@/lib/utils` (cn) universal; `@/hooks/use-copy-to-clipboard` (code).

### (b) Files customized / deviating beyond stock ReUI
- **accordion-menu.tsx** — bodh-specific patch so React-Router `<Link>` inside menu items isn't preventDefault'd; this is the app's sidebar nav. Path-matching + nested state machine.
- **file-upload.tsx** — EMPTY (0 bytes). Broken import surface; nothing exports.
- **sortable.tsx** — copy-pasted kanban.tsx internals + adds generic Sortable primitives; overlapping exports with kanban.tsx (both export the full `Kanban*` set).
- **data-grid-table-dnd.tsx** — leftover `console.log` on every render (line 115).
- **sonner.tsx** — depends on `next-themes` despite Vite/React-Router stack (needs a next-themes provider mounted).
- **sliding-number.tsx** — imports `framer-motion` while the rest of the repo standardizes on `motion/react`.
- ReUI itself is a heavy superset of shadcn: `button.tsx` (variant×mode×size×appearance×shape×underline), `badge.tsx`, `alert.tsx`, `input.tsx` group system, `select.tsx` indicator context, `switch.tsx` indicator/wrapper, `tabs.tsx` variants are all far richer than vanilla shadcn.
- Decorative/marketing extras not in shadcn: avatar-group, github-button, gradient/grid/hover backgrounds, marquee, shimmering-text, svg-text, video-text, text-reveal, typing-text, word-rotate, counting-number, sliding-number, scrollspy — likely used on auth/landing pages, not core admin CRUD.

### (c) Key composite components pages will rely on

**Button** (`button.tsx`) — the styling backbone. `Button({variant, size, mode, appearance, shape, autoHeight, underline/underlined, placeholder, selected, asChild})`. `buttonVariants(...)` is imported by alert-dialog, calendar, and reused conceptually elsewhere. `mode="input"` renders button as a form-input trigger (dropdown/date triggers).

**DataGrid stack** — the primary table system for admin list pages. Wiring contract:
- Consumer builds a TanStack `table` (useReactTable) then: `<DataGridContainer><DataGrid table={table} recordCount={n} isLoading loadingMode="skeleton" emptyMessage onRowClick tableLayout={{...}} tableClassNames={{...}}> ... </DataGrid></DataGridContainer>`.
- Inside, render `<DataGridTable/>` (or `<DataGridTableDnd handleDragEnd/>` for column DnD, or `<DataGridTableDndRows handleDragEnd dataIds/>` for row DnD) and `<DataGridPagination sizes info=.../>`.
- Column headers use `<DataGridColumnHeader column title icon filter visibility pinnable/>`; filters via `<DataGridColumnFilter column title options=[{label,value,icon}]/>`; visibility via `<DataGridColumnVisibility table trigger/>`.
- Column `meta` supports `{headerTitle, headerClassName, cellClassName, skeleton, expandedContent}` (declared here, augments `@tanstack/react-table`).
- Row selection via `DataGridTableRowSelect`/`DataGridTableRowSelectAll`. Access context anywhere via `useDataGrid()` → `{props, table, recordCount, isLoading}`.
- `DataGridApiResponse<T>` = `{data:T[], empty, pagination:{total,page}}` — the expected server list-endpoint shape for this grid.

**Form stack** (`form.tsx`) — RHF integration. `<Form {...methods}>` (=FormProvider) → `<FormField control name render={({field})=>...}/>` → inside render `<FormItem>` (sets `data-invalid`) `<FormLabel/>` `<FormControl>`(Slot, wires aria + id) `<FormDescription/>` `<FormMessage/>`. `useFormField()` gives `{id, name, formItemId, formDescriptionId, formMessageId, error, ...}`. Pairs with Input/Textarea/Select/Checkbox/RadioGroup/Switch/datefield (all expose `aria-invalid` + `[data-invalid=true]` styling hooks).

**Input group system** (`input.tsx`) — `InputGroup`/`InputWrapper`/`InputAddon` compose Input + Button + datefield with automatic border-radius joining via `data-slot` sibling selectors; `inputVariants` shared with `datefield.tsx`.

**Chart** (`chart.tsx`) — `<ChartContainer config={ChartConfig}>` (Recharts ResponsiveContainer + injected CSS vars `--color-<key>`) with `ChartTooltip`/`ChartTooltipContent`, `ChartLegend`/`ChartLegendContent`. `ChartConfig` = `{ [key]: {label?, icon?, color? | theme:{light,dark}} }`.

**Stepper**, **Kanban/Sortable**, **Tree** are the other self-contained stateful composites (wizard flows, boards, hierarchy views) with their own context providers and dnd-kit / headless-tree backends.
