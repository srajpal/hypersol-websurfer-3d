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

Electron is not installed on this machine. Electron 44 was the current
stable line on 2026-09-24 according to the project's release listing.
AGENTS.md rule 13 rechecks this at the start of each milestone; the
version and date checked are recorded here.

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
| Settings | JSON file in the app data folder | Simple, human-readable, easy to back up. |
| Bookmarks and history | SQLite (better-sqlite3, prebuilt binaries) | Fast search over thousands of rows; standard for browsers. |
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
          index.ts             app start, single instance, window creation
          tabs/                TabManager: create, close, focus, navigate, snapshot
          privacy/             blocker setup, DoH setup, hardened session defaults
          storage/             settings.json, SQLite history and bookmarks
          ipc/                 typed message handlers (one file per topic)
          menu/                keyboard shortcuts and app menu
        preload/
          shell.ts             safe bridge exposed to the 3D shell
          page.ts              injected into every web page: depth layering,
                               image and model discovery, no Node access
        renderer/              the 3D shell (one Chromium page)
          index.html
          scene/               Three.js room, camera, lighting, PagePanel,
                               TabCard, input mapping
          hud/                 Lit components: address bar, nav buttons,
                               panels (library, settings, error). Tabs are
                               3D cards under scene/, not a 2D strip.
          state/               small store: tabs, focused tab, theme, status
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
    privacy.md                 what is blocked, what is stored, what is fetched
  tests/
    e2e/                       Playwright: launch app, open a site, switch theme
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

1. User types an address in the HUD. The shell sends "navigate" over IPC.
2. TabManager in main tells the tab's Chromium view to load the URL.
   The blocker inspects every request; the named DoH resolver resolves
   the host name.
3. Load events flow back to the shell, which updates the address bar,
   progress strip, and title.
4. The page preload measures top-level sections and images and applies
   depth offsets; it reports image rectangles to main for later use.
5. On tab switch, main captures a snapshot of the outgoing tab and the
   shell paints it onto that tab's 3D card.
6. Visited pages are written to SQLite history. Bookmarks are written on
   user action. Settings are written on change.

## 8. What is saved, and where

| Data | Where | Notes |
|---|---|---|
| Settings, theme, window size | settings.json in the app data folder | Human readable |
| History, bookmarks | hypersol.sqlite in the app data folder | Delete-able from the Library panel |
| Cookies, cache, site storage | Chromium profile folder managed by Electron | Standard browser behaviour |
| Filter lists | cached file in the app data folder | Refreshed on a schedule; switchable in Settings |

Nothing leaves the machine except user-initiated page loads, encrypted
DNS lookups to the named resolver, and filter-list refreshes. The
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
  blocked by the privacy shield (with "open anyway"), page crashed
  ("This page went dark"), encrypted DNS blocked on this network (with
  "use this network's DNS for now").
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
2. Live-panel input on a rotated page: to be answered by the milestone 1
   spike (TODO.md task 8). Fallback (decided 2026-09-24) is a flat,
   face-on live page with the room in 3D around it; texture mode stays
   the later upgrade path. Not checked yet.
3. Prebuilt better-sqlite3 binaries for the chosen Electron line on all
   three OSes. Check first whether Electron's bundled Node provides
   node:sqlite, which would remove the only native module. Not checked
   yet.

## 11. Run and test (not checked yet)

- Install: `pnpm install`
- Develop: `pnpm dev` (starts the Electron app with live reload)
- Unit tests: `pnpm test`
- End-to-end: `pnpm test:e2e`
- Package: `pnpm build` then `pnpm package` (installers per OS)
