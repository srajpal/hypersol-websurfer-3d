# TODO.md — Roadmap and current plan

Status key: **Done**; **Current** (plan approved, build not yet
approved); **Later** (listed, not approved to build).
Run and test steps are "not checked yet" until they have actually run.
Plan approved 2026-09-24.

## Roadmap

| # | Milestone | Useful result | Status |
|---|---|---|---|
| 1 | Live page in the 3D room | One real site on a tilted live panel in the 3D room; click, type, scroll work; build and test tooling runs | Current |
| 2 | Browsing basics | Tabs as cards in the left arc, top HUD (back, forward, reload, address and search), progress strip, shortcuts, new-tab start panel (empty state), error cards | Later |
| 3 | Memory and Settings | Bookmarks and history in SQLite, Library panel, Settings panel, start panel with your data, all intact after restart | Later |
| 4 | Private by default | Ad and tracker blocking, DNS over HTTPS in secure mode, shield count and popover, "blocked" card with "open anyway", filter-refresh switch, docs/privacy.md | Later |
| 5 | Depth layering | Page sections and images lifted into layered depth; image rectangles reported | Later |
| 6 | Themes and look (design) | Final Nebula and Daylight, theme switch, matching room lighting, design pass over all screens, custom window frame considered | Later |
| 7 | First release v0.1 | Installers for Windows, macOS, Linux; per-OS checks; holoml first-result scope (SPEC.md outline, parser package with one test); full regression pass | Later |
| 8 | HoloML v0.1 language | Spec, schema, parser, conformance samples | Later |
| 9 | HoloML in the browser | `.holo` page mode: models, orbit and walk, labels, links, lights, materials, animation | Later |
| 10 | Car showroom demo | Demo site with walk-around 3D cars | Later |
| 11 | Free camera and room navigation | Move freely around the room | Later |
| 12 | Lift to 3D | Images and 3D models on 2D pages become objects | Later |
| 13 | Everyday browser features | Downloads panel, find in page, zoom, print, private window | Later |
| 14 | Polish | Custom font, sound design, theme editor, motion tuning | Later |
| — | Further out | HoloML scripting, extensions, sync, theme marketplace, Tor or VPN, VR, iOS and Android | Later |

Milestones 1 to 7 make up the first useful result in BRIEF.md.

### Where design work belongs

- Screen layout and navigation are built inside the feature milestone
  that needs them. The overall layout is already approved
  (ARCHITECTURE.md section 9), and each screen can only be judged with
  its real data: tab rail and shortcuts in 2, Library and Settings
  panels (with Escape to close) in 3, the shield in 4.
- Shared style starts as a small foundation task in milestone 1: one set
  of theme values feeds both the HUD's CSS variables and the Three.js
  materials, so no screen hard-codes a colour. Final colours and a design
  pass get their own milestone (6), because exact colours are still an
  open question and reviewing every real screen together keeps them
  consistent.
- Later polish goes after the first release (14), so it cannot delay a
  working browser.

## Milestone 1 — Live page in the 3D room

Status: Current. Plan approved 2026-09-24. Build not yet approved.

Goal: prove that a live web page tilted in 3D takes clicks, typing, and
scrolling correctly (ARCHITECTURE.md open question 2), and set up the
build and test tooling.

### Decisions (2026-09-24)

- The focused page is an Electron `<webview>` element inside the shell,
  placed by Three.js CSS3DRenderer. (`WebContentsView` is a flat native
  layer and cannot be transformed in 3D.) Every webview is locked down
  when it attaches.
- Fallback: if the tilted page fails the input checks, or its text is not
  readable at the default tilt, the focused page faces the viewer flat
  and fully sharp, with the 3D room around it. Only tab cards and
  transitions tilt. Texture mode stays the later upgrade path.
- Parallax pauses while the pointer is over the page and eases back over
  about 250 ms; it resumes over the room and is capped to a small range.
- Window: standard OS title bar. A custom frame is considered in
  milestone 6.
- Colours: provisional Nebula values only; final values in milestone 6.
- Waiting and error states in this milestone are plain text; styled
  cards arrive in milestone 2.

### Software to install (approval requested with build approval)

electron 44, electron-vite, vite, typescript, @types/node, three,
@types/three, vitest, playwright, eslint, typescript-eslint.

### Tasks

- [ ] 1. Workspace: pnpm workspace, `tsconfig.base.json`, `apps/browser`
      (electron-vite), skeleton `packages/scene-core` and
      `packages/themes`. Scripts: `dev`, `test`, `test:e2e`, `lint`,
      `typecheck`.
- [ ] 2. Main process: single instance, one window with standard frame.
      Sandbox on, context isolation on, no Node in pages. On webview
      attach, strip any preload and force safe web preferences. Narrow
      shell bridge.
- [ ] 3. Room: Three.js scene with provisional Nebula background and
      lighting, fixed desk camera, CSS3D and WebGL layers stacked.
      Render on demand only (no redraws while idle).
- [ ] 4. Page panel: `PagePanel` interface in scene-core; live webview
      panel with adjustable tilt (0° to 20°, default about 10°) and a
      glow edge.
- [ ] 5. Parallax as decided above.
- [ ] 6. Temporary plain address field (removed when the HUD lands in
      milestone 2) and a `--start-url` launch option for tests.
- [ ] 7. Design task, style foundation: theme token schema in
      `@hypersol/themes` with provisional Nebula values; one value
      produces both a CSS variable and a Three.js colour.
- [ ] 8. Spike: run the input checks at 0°, default, and 20°. Record the
      results; apply the flat-page fallback if they fail. Close open
      question 2 in ARCHITECTURE.md.
- [ ] 9. better-sqlite3 check: from release listings, without installing,
      confirm prebuilt binaries for Electron 44 on Windows, macOS, and
      Linux (x64 and arm64). Record under open question 3.
- [ ] 10. Test harness: Vitest, Playwright Electron launcher, a local
      fixture server on 127.0.0.1 with a random port, and the sample
      pages below.
- [ ] 11. Docs: README build and run, AGENTS.md Testing (only commands
      that ran), ARCHITECTURE.md, HANDOFF.md.

### Sample inputs (written by the agent, in `tests/fixtures/`)

- `click-grid.html`: 3×3 buttons (corners, edges, centre) that report
  which was hit.
- `form.html`: text input, textarea, select, checkbox.
- `long.html`: a tall page for scrolling.
- `link-a.html` and `link-b.html`: pages that link to each other.
- `hover.html`: a target that reports pointer enter and leave.
- `node-probe.html`: reports whether `require` or `process` exist.

### Checks

| # | Check | How | Expected result |
|---|---|---|---|
| C1 | App launches | Automated (Playwright) | Window opens, room renders, no console errors |
| C2 | Clicks land | Automated: all 9 grid buttons at 0°, default, 20°, at 2 window sizes | Every click hits the intended button |
| C3 | Parallax does not shift targets | Automated: move the pointer over the room, then click the grid | Parallax pauses over the page; all clicks land |
| C4 | Typing | Automated: input and textarea | Values match exactly |
| C5 | Scrolling | Automated: wheel over the page, then over the room | Page scrolls only when the pointer is over it |
| C6 | Hover and links | Automated | Hover reported; link loads the second page |
| C7 | Page isolation | Automated: `node-probe.html` | No Node access; any webview preload request is stripped |
| C8 | No unexpected traffic | Automated: log all requests during the run | Only 127.0.0.1 |
| C9 | Idle efficiency | Automated: count frames | No redraws while idle; about 60 fps during parallax |
| C10 | Load failure | Automated: stop the server, then load a page | Plain "couldn't load" text; app does not crash |
| C11 | Page crash | Automated: force the page's process to crash | App survives; message with Reload |
| C12 | Layout and style code | Vitest (unit) | Panel position and tilt correct; parallax cap and pause hold; one theme value yields matching CSS and 3D colour |
| C13 | Real sites | Manual, by the owner: Wikipedia, DuckDuckGo, YouTube | Text readable at the default tilt; video plays; parallax feels calm |
| C14 | Touch | Manual: tap and scroll | Works, or marked "not checked" without a touch screen |
| C15 | macOS and Linux | — | "Not checked" until milestone 7 |

All checks: not checked yet.

Regression list started by this milestone: C1 to C11.

### Done when

C1 to C12 pass (with the fallback in place if needed), the owner
accepts C13, the docs are updated, and the owner approves the finished
milestone.
