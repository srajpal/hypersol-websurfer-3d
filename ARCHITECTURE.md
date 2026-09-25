# HyperSol WebSurfer 3D — Architecture

Status: approved 2026-09-24. Run and test steps are marked "not checked yet"
until they have actually been executed. The milestone roadmap and current
plan are in TODO.md.

## 1. Summary

A desktop browser (Windows, macOS, Linux) built with Electron, TypeScript,
and Three.js. The browser's interface is a 3D scene. The focused web page
is a live Chromium view placed in that scene; other tabs float nearby as
3D cards. Privacy features run inside Electron's main process. HoloML, the
3D markup language, lives in a separate repository and plugs into the same
Three.js scene through a renderer package.

## 2. Terms used in this document

- Electron: a framework that packages Chromium (Chrome's engine) and
  Node.js into a desktop app.
- Main process: the Node.js side of an Electron app. Owns windows, tabs,
  network settings, and files on disk. Has full system access.
- Renderer process: a Chromium page. Our 3D interface ("the shell") is
  one renderer. Each web page a user opens runs in its own renderer.
- Preload script: a small script Electron runs inside a page before the
  page's own code. Used to expose a safe, narrow bridge to the main
  process, and to inject our depth-layering behaviour into web pages.
- IPC (inter-process communication): messages between main and renderer.
- WebGL: the browser's built-in 3D graphics API. Three.js sits on top of it.
- CSS 3D transforms: standard CSS that rotates and positions HTML elements
  in 3D space, rendered by Chromium's compositor at full speed.
- Offscreen rendering: Electron rendering a page to an image instead of
  the screen, so we can paint it onto a 3D surface.
- DoH (DNS over HTTPS): encrypted lookups of website addresses, so the
  network cannot see or tamper with which sites you visit.
- SQLite: a small single-file database. Chrome and Firefox store history
  and bookmarks this way.
- Monorepo: one git repository holding several packages that version and
  build together.

## 3. What was checked on this machine (2026-09-24)

Available: Node 22.16, npm 10.9, pnpm 12.4, git 2.45, Python 3.13,
.NET 9, CMake 3.28, VS Code.
Not available: Rust, C++ compiler (cl, clang, gcc).
Consequence: choose a TypeScript stack; native modules must ship prebuilt
binaries.

Electron 44.4.5 was installed on 2026-09-24 (milestone 1), resolved by
pnpm as the newest 44.x release (Node 24.21.0, Chromium 152.0.7977.130
inside it). The AGENTS.md rule 13 check of Electron's release notes for
security releases was not done at the start of milestone 1: the registry
lookup was blocked by the session's permission check.

Rule 13 check, 2026-09-25 (before milestone 3, at the owner's request):
44.4.5 is the newest stable release (npm "latest", published
2026-09-23); the supported lines are 44, 43 (43.7.5), and 42 (42.11.8);
45 is in alpha. Its release notes list no security fixes, only
"backported fixes from upstream ANGLE, Chromium, Dawn, PDFium and V8".
No upgrade needed.

Graphics on the build machine: NVIDIA GeForce RTX 4050 Laptop GPU and
AMD Radeon integrated graphics; one 1920×1080 display at 100% scaling;
touchpad, no touch screen.

## 4. Decisions and reasons

| Decision | Choice | Why |
|---|---|---|
| App framework | Electron, current supported stable line (44 as of 2026-09-24) | Bundles Chromium; one codebase for three desktop OSes; huge ecosystem; matches "embed an existing engine". Electron ships no Widevine DRM module, so DRM video (Netflix, Disney+, Spotify web) does not play; documented limitation, not planned. |
| Language | TypeScript everywhere | One language for shell, main process, HoloML parser; easiest for contributors. |
| 3D library | Three.js | Most used open-source web 3D library; supports both WebGL objects and live DOM in one scene. |
| Focused page in 3D | Live panel via CSS 3D transform (Three.js CSS3DRenderer), using an Electron `<webview>` element in the shell | Sharp text, native input, zero pixel copying. `WebContentsView` is a flat native layer and cannot be transformed in 3D. On attach, any page-requested preload is replaced by the trusted page preload (page.ts, a stub until milestone 5) and safe web preferences are forced. |
| Fallback if tilted input fails | Focused page faces the viewer flat, room stays 3D around it | Keeps sharp text and native input; tab cards and transitions still tilt. Decided 2026-09-24. |
| Background tabs in 3D | Snapshot textures on WebGL cards | Cheap; lit and occluded like real objects. |
| Upgrade path | Offscreen rendering to GPU textures | Lets pages curve, bend, and receive lighting later; hidden behind the PagePanel interface. |
| Page depth layering | Injected preload CSS on top-level sections and images | Interactive, no copying; also reports image positions for later 3D lifting. |
| Ad/tracker blocking | @ghostery/adblocker-electron | Open source, uBlock-compatible lists, built for Electron sessions. |
| Filter-list updates | Fetched on a schedule through Electron's net.fetch (Chromium's network stack, so encrypted DNS applies), on by default, switchable in Settings | Keeps blocking current. Exact lists and URLs are named in docs/privacy.md in milestone 4. |
| Encrypted DNS | Electron app.configureHostResolver after app ready, secureDnsMode "secure", resolver Quad9 (https://dns.quad9.net/dns-query) | Built into Chromium. The resolver sees every hostname, so it is a named third-party service: Quad9 is a non-profit with a no-logging policy. Owner may change it. Settings offers Secure (default) or Automatic (falls back to the network's DNS). |
| Encrypted DNS failure | Error card "Encrypted DNS is blocked on this network" with "Use this network's DNS for now", which switches to Automatic for the session | Secure mode has no fallback, so captive portals and corporate networks would otherwise fail every lookup with no explanation. |
| Spellchecker | Off by default | Electron otherwise downloads dictionaries from a CDN on Windows and Linux, contradicting the privacy statement. |
| Default search engine | DuckDuckGo | Privacy-respecting default; changeable in Settings. |
| Telemetry | None. No analytics, no crash reporter. | Brief requirement. |
| Camera | Fixed desk view with subtle mouse parallax; parallax pauses while the pointer is over the page | Simple and predictable; targets never move under the cursor. Free movement is a later milestone. |
| Window frame | Standard OS title bar | Reliable on all three OSes; a custom frame is considered in the theme milestone. |
| Tab ownership | The shell owns the tabs: each tab is a `<webview>` the shell creates once and keeps in its page | Follows from the milestone 1 decision to show pages as webviews in the shell: a webview lives in the shell's page and reloads if moved, so the shell must own it. The main process keeps the jobs only it can do: shortcuts, new-window rules, the right-click menu, favicons, snapshots. Changed in milestone 2 from "TabManager in the main process"; confirmed with the milestone 2 approval (prompt 20). |
| Keyboard shortcuts | Handled in the main process (before-input-event) for the shell and every page | Work wherever the keyboard focus is, including inside a page; the page never sees the shortcut keys. |
| New windows | Always a tab: in front, or behind for Ctrl-click and middle-click; blocked unless the page had a click or key press in the last 5 seconds | Owner decision 2026-09-25 (prompt 19); 5 seconds matches Chromium's user-activation window. |
| Right-click menu | Built in the main process from Chromium's context-menu data | Electron has none by default. |
| App menu | None on Windows and Linux; standard app, Edit, and Window menus on macOS | Clipboard shortcuts need the Edit roles on macOS. |
| Saved-data requests | One checked request channel from the shell to the main process (shared/data.ts); only the shell may use it; every request is validated before anything is read or written | Keeps the database and files in the main process; the shell cannot reach the file system. |
| History recording | The main process records a visit when a tab commits a navigation to a web address; the same address again in the same tab (a reload) adds nothing; the title follows when the page reports it | Failed loads are not recorded; titles are never taken from the previous page. |
| Damaged saved data | A damaged settings.json is renamed aside and defaults are used; if the database cannot open, browsing continues and nothing is recorded | The app always starts. |
| Settings | JSON file in the app data folder | Simple, human-readable, easy to back up. |
| Bookmarks and history | SQLite through Node's built-in node:sqlite (owner decision 2026-09-25, prompt 20) | Fast search over thousands of rows; standard for browsers. Built into Electron's Node, so no native module and no extra package. |
| UI widgets (address bar, menus) | Lit web components | Tiny, standards-based, no framework lock-in; themed with CSS variables. |
| Build | electron-vite (Vite) and electron-builder | Fast dev reload; installers for Windows, macOS, Linux. |
| Tests | Vitest (unit), Playwright (Electron end-to-end) | Standard, cross-platform. |
| Repos | hypersol-websurfer-3d (browser), holoml (language) | Each useful on its own; browser depends on holoml packages via npm. |
| License | Apache 2.0 both; spec text also CC BY 4.0 | Per brief. |

## 5. Parts (browser repository)

pnpm monorepo. Package names use the @hypersol scope.

```
hypersol-websurfer-3d/
  BRIEF.md
  ARCHITECTURE.md
  LICENSE                      Apache 2.0
  package.json, pnpm-workspace.yaml, tsconfig.base.json
  apps/
    browser/                   the Electron app
      electron.vite.config.ts
      src/
        main/                  main process
          index.ts             app start, single instance, window, app menu,
                               tab snapshot requests
          guests.ts            per web page: shortcuts, new windows,
                               right-click menu, favicons
          shortcuts.ts, popups.ts, context-menu.ts
                               the rules behind those, unit tested
          security.ts          webview lock-down, allowed addresses
          launch-options.ts    command-line options
          test-hooks.ts        logs for the end-to-end tests (test runs only)
          privacy/             (milestone 4) blocker, DoH, session defaults
          storage/             database.ts (node:sqlite bookmarks and
                               history, schema version), settings-file.ts
                               (settings.json, session.json), files.ts
                               (write through a temporary file),
                               service.ts (answers the shell's requests)
        shared/
          commands.ts          messages between main and the shell
          data.ts              saved-data requests and their checks
          settings.ts          settings, search engines, their checks
        preload/
          shell.ts             safe bridge exposed to the 3D shell
          page.ts              injected into every web page: depth layering,
                               image and model discovery, no Node access
        renderer/              the 3D shell (one Chromium page)
          index.html, main.ts
          app.ts               controller: tabs, pages, room, top bar, commands
          scene/               room.ts (Three.js room, camera, cards, switch
                               animation, input), tab-view.ts (one tab's page,
                               shimmer, error cards), tab-card.ts,
                               start-panel.ts
          hud/                 Lit components: toolbar.ts (nav buttons,
                               address bar, bookmark star, menu, loading
                               strip), library.ts, settings.ts, about.ts.
                               Tabs are 3D cards under scene/, not a 2D strip.
          state/               tabs.ts: the tab list and focus
          url.ts, load-errors.ts
                               address-or-search, error card wording
          themes/              applies @hypersol/themes values to CSS
                               variables and Three.js materials
      resources/               icons, default filter list snapshot
  packages/
    scene-core/                @hypersol/scene-core: room layout math,
                               PagePanel interface, camera rig. No Electron
                               imports, so it can be unit tested and reused
                               by HoloML rendering later.
    themes/                    @hypersol/themes: theme schema and the two
                               built-in themes
    holoml-renderer/           @hypersol/holoml-renderer: maps HoloML nodes
                               to Three.js objects. Skeleton only in the
                               first result; real work in a later milestone.
  docs/
    screens.md                 layout notes and states (from this document)
    screenshots/               progress screenshots, one folder per milestone
    privacy.md                 what is blocked, what is stored, what is fetched
  tests/
    e2e/                       Playwright drives the built app (m1 to m3 checks)
    fixtures/                  sample pages served from 127.0.0.1
    screenshots/               progress screenshots (pnpm screenshots)
```

## 6. Parts (HoloML repository, created alongside)

```
holoml/
  SPEC.md                      the language, written like a small HTML spec
  LICENSE, LICENSE-SPEC        Apache 2.0 and CC BY 4.0
  packages/
    parser/                    @holoml/parser: text to a node tree; zero deps
    schema/                    @holoml/schema: element and attribute rules
  examples/
    showroom/                  the car showroom demo (later milestone)
  conformance/                 sample files and expected trees for any renderer
```

First result scope for this repo: README, SPEC.md outline, empty parser
package with one passing test. Language design itself is a later milestone.

## 7. Data flow

1. The user types in the address bar or the start panel. The shell
   decides between an address and a search (DuckDuckGo) and loads it in
   the tab's webview.
2. Chromium loads the page. From milestone 4, the blocker inspects
   every request and the named DoH resolver resolves the host name.
3. The webview's events update the tab list, which updates the address
   bar, loading strip, title, and card.
4. The main process sends the shell what only it sees: shortcut key
   presses, new-tab requests from pages, and favicons.
5. Shortly after a page settles, and when switching away from it, the
   shell asks the main process for a snapshot (the one request the
   shell's bridge allows, and only for its own tabs) and paints it onto
   the tab's card.
6. From milestone 5, the page preload measures top-level sections and
   images and applies depth offsets; it reports image rectangles.
7. The main process writes a history entry when a tab arrives at a web
   page. Bookmarks and settings are written when the user acts, and the
   open tabs shortly after they change. The main process tells the shell
   when saved data changes, so the Library, start panels, and star stay
   current.

## 8. What is saved, and where

| Data | Where | Notes |
|---|---|---|
| Settings, theme, window size | settings.json in the app data folder | Human readable |
| History, bookmarks | hypersol.sqlite in the app data folder | Delete-able from the Library panel and Settings |
| Open tabs | session.json in the app data folder | Used only when startup is set to reopen them |
| Cookies, cache, site storage | Chromium profile folder managed by Electron | Standard browser behaviour |
| Filter lists | cached file in the app data folder | Refreshed on a schedule; switchable in Settings |

Nothing leaves the machine except user-initiated page loads (including
the favicon a page names, fetched through that page's own session, as a
browser tab does), encrypted DNS lookups to the named resolver, and
filter-list refreshes. The
spellchecker dictionary download is turned off. Any future update check
would be a fourth item here and needs the owner's approval first.

## 9. Screens and style

### Layout for the first result (approved)

The Room: one full-window 3D scene, seen from a fixed "desk" camera with a
slight parallax that follows the mouse. Parallax pauses while the pointer
is over the page and eases back (about 250 ms); it resumes over the room.
The window uses the standard OS title bar.

- Centre: the focused page, a large upright panel, gently tilted toward
  the viewer, with a soft glow edge in the theme's accent colour.
- Left rail: tab cards, stacked in a shallow arc, each a snapshot with
  title and favicon. Click to focus; the cards animate as the focused
  page slides into the centre. Close on hover. "+" card at the end.
- Top HUD (2D overlay, always sharp): back, forward, reload, address and
  search bar, menu button. Loading progress is a thin strip under the bar.
- Right side, on demand: a slide-in Library panel (bookmarks, history) or
  Settings panel. Only one open at a time. Escape closes it.
- Bottom-right: theme switch and privacy shield (count of blocked
  requests on the current page).

Movement: standard browser shortcuts (Ctrl/Cmd+T new tab, Ctrl/Cmd+W
close, Ctrl/Cmd+L address bar, Ctrl+Tab next tab on every platform since
Cmd+Tab is the macOS app switcher). Mouse and touch:
click or tap cards and buttons; scroll inside the page scrolls the page.
No free camera movement in the first result.

### States

- Waiting: progress strip under the address bar; a new panel shows a soft
  shimmer until first paint; tab cards show a spinner until a snapshot.
- Empty: new tab shows a start panel with a search box, bookmarks grid,
  and recent history. With no data: "Nothing saved yet" with a hint.
  Library with no history or bookmarks: same wording.
- Error: shown inside the panel as a card with a plain message, the
  address, and Retry. Cases: address not found, connection failed,
  certificate not valid (no Retry and no way to proceed; Go back only),
  blocked by the privacy shield (with "open anyway"), page crashed
  ("This page went dark"), encrypted DNS blocked on this network (with
  "use this network's DNS for now").
- Right-click menu on a page: back, forward, reload; on a link, open in
  new tab and copy link address; on selected text, copy; in a text
  field, cut, copy, paste, select all.
- Library and Settings panels: waiting ("Loading…"), empty ("Nothing
  saved yet" with a hint, or "Nothing found" for a search), and error
  ("Couldn't open your saved data"). Destructive actions ask to confirm
  in place. Focus moves into a panel when it opens and back when it
  closes.
- Motion: tab switches animate over 250 ms; with the system's reduced
  motion setting they are instant and the loading strip and shimmer
  stop moving.
- Privacy status: the shield icon shows a count; clicking opens a small
  popover listing what was blocked.

### Shared appearance

- Two built-in themes: Nebula (dark, default) and Daylight (light).
  Each theme defines: background gradient, panel glass colour, accent,
  text colours, glow strength, and 3D room lighting.
- Style: glass panels, thin luminous edges, restrained motion (200 to
  300 ms), one accent colour per theme. Fonts: a system sans-serif stack
  for the first result; a custom font is a later decision.
- All colours are CSS variables in the HUD and matching values in the
  Three.js materials, so a theme changes both at once.

### Later screens and polish (not in the first result)

Free camera and room navigation, HoloML page mode, image lift-to-3D,
downloads panel, find in page, extensions, sync, theme editor, custom
fonts, sound design, VR.

## 10. Open questions

1. Theme look: Nebula (dark) default and Daylight (light) are the working
   proposal. Exact colours, accent, and any owner sketches are still to
   be confirmed in the theme milestone.
2. Live-panel input on a rotated page: answered by the milestone 1
   spike (TODO.md task 8). Clicks, hover, scrolling, links, and real
   keyboard typing work at the default tilt (owner check 2026-09-25),
   so the flat-page fallback is not used. Remaining: text is slightly
   soft when tilted (revisit tilt and sharpness in milestone 6).
   Found in milestone 2: input sent in the same instant a page appears,
   moves, or resizes can be routed to the shell instead of the page.
   A pointer that has already arrived is routed correctly, so mouse use
   is not affected; a touch tap at that instant might be (recheck with
   C14 on a touch screen). This was the cause of the intermittent C2.
3. Prebuilt better-sqlite3 binaries for the chosen Electron line on all
   three OSes. Check first whether Electron's bundled Node provides
   node:sqlite, which would remove the only native module. Checked
   2026-09-24 on Windows: node:sqlite works in Electron 44.4.5 (Node
   24.21.0, SQLite 3.53.4). Decided 2026-09-25 (prompt 20): use
   node:sqlite; better-sqlite3 is dropped. macOS and Linux not checked.

## 11. Run and test

Checked on Windows 11, 2026-09-24 (macOS and Linux not checked yet):
- Install: `pnpm install`
- Develop: `pnpm dev` (starts the Electron app with live reload, using a
  throwaway profile in the ignored `userData/dev` folder)
- Build: `pnpm build` (output in apps/browser/out)
- Unit tests: `pnpm test`
- Lint and type check: `pnpm lint`, `pnpm typecheck`
- End-to-end: `pnpm test:e2e` (milestone 1 to 3 checks, about 120
  seconds; needs openssl on PATH for the certificate-error check, which
  Git for Windows provides)

Progress screenshots: `MILESTONE=m3 pnpm screenshots` builds the app and
saves its main screens to docs/screenshots/m3/ (Electron's own capture,
local test pages only).

Not checked yet: `pnpm package` (installers per OS, milestone 7).

Launch options, for development and tests: `--start-url=<address>`
(default: a start tab), `--tilt=<0 to 20>`,
`--hypersol-user-data=<folder>`; `HYPERSOL_TEST=1` turns on the test
hooks and allows `--search-url=<address with %s>`. The tests also pass
Chromium's `--host-resolver-rules` so that no name resolves except this
machine.
