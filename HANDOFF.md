# HANDOFF.md

State of the project for whoever picks it up next, human or agent.
Last updated 2026-09-24 (evening, after the milestone plan).

## Where things stand

Planning is complete and approved, including the milestone roadmap and
the milestone 1 plan in TODO.md. No app code exists. Nothing has been
installed, built, or tested. The next step is build approval for
milestone 1 (Live page in the 3D room).

Two repositories, both with a first commit pushed to `main`:

- Browser: https://github.com/srajpal/hypersol-websurfer-3d
  Local: `C:\dev\Projects\Claude\hypersol-websurfer-3d`
- Language: https://github.com/srajpal/holoml
  Local: `C:\dev\Projects\Claude\holoml`

The two local folders sit side by side. Never nest one in the other.

## Read these first, in order

1. AGENTS.md (rules; CLAUDE.md imports it)
2. BRIEF.md (what we are building and for whom)
3. ARCHITECTURE.md (how, and what is still open)
4. TODO.md (roadmap, current milestone tasks and checks)
5. README.md (the story and public face)
6. PROMPTS.md (every owner prompt, verbatim, with model and effort)

The holoml repo has its own README.md and AGENTS.md, which defer to the
browser repo for rules and the prompt log.

## Decisions already made (do not reopen without the owner)

- First result: open any normal site in a 3D interface on Windows, macOS,
  Linux, with tabs, address bar, bookmarks, history, two themes, and
  privacy on by default. Desktop only. Mouse, keyboard, touch.
- Stack: Electron 44, TypeScript, Three.js, Lit, SQLite (better-sqlite3),
  @ghostery/adblocker-electron, electron-vite, electron-builder, Vitest,
  Playwright. Reasons in ARCHITECTURE.md section 4.
- Focused page is a live Chromium view (an Electron `<webview>`) placed
  with CSS 3D transforms; background tabs are snapshot textures;
  offscreen rendering is the upgrade path, hidden behind a PagePanel
  interface. If tilted input fails, the fallback is a flat, face-on live
  page in the 3D room.
- Layout: fixed "desk" camera with mouse parallax (paused while the
  pointer is over the page), standard OS title bar, focused page centre,
  tab cards in a left arc, sharp 2D HUD on top, Library and Settings
  panels sliding in from the right.
- Themes: Nebula (dark, default) and Daylight (light).
- Privacy: ad and tracker blocking, DNS over HTTPS in "secure" mode, no
  telemetry, no crash reporter. Filter lists refresh on a schedule, on by
  default, switchable in Settings. Default search: DuckDuckGo.
- Language name: HoloML, extension `.holo`. "3DML" was taken.
- License: Apache 2.0 for both repos; HoloML spec text also CC BY 4.0.
- Naming: "HyperSol" with no LLC or Inc; founders without titles.

## Open questions (ARCHITECTURE.md section 10)

1. Exact theme colours and accent; any owner sketches. Decide in the
   theme milestone.
2. Whether clicks land correctly on a live page rotated in 3D. Must be
   the first spike of milestone 1. Fallback is a flat, face-on live
   page; texture mode stays the later upgrade path.
3. Whether prebuilt better-sqlite3 binaries exist for Electron 44 on all
   three OSes. Check before adding the dependency.

## Machine facts (checked 2026-09-24)

Node 22.16, npm 10.9, pnpm 12.4, git 2.45, Python 3.13, .NET 9,
CMake 3.28. No Rust, no C++ compiler. `gh` is logged in as srajpal.

## How to resume

1. Log the owner's new prompt in PROMPTS.md before doing anything else.
   Read the session's model, effort, and context tokens from the app
   and record them; if unavailable, say "not captured".
2. Do only what the prompt approves. The next expected prompt is build
   approval for milestone 1 in TODO.md. Do not write app code until it
   is given. Tick tasks and record check results in TODO.md as they
   actually run.
3. Before the first code milestone, ask for approval to install
   dependencies (rule 4 in AGENTS.md), and list exactly what will be
   installed.
4. Update README.md, ARCHITECTURE.md, and this file whenever a decision
   or the project state changes. Update the Testing section of AGENTS.md
   only with commands that have actually run.
5. Commit after each completed change. Push only when the owner asks,
   and remind them when five or more commits are waiting.
6. In the Claude desktop app, CLAUDE.md asks for Remote Control to be
   turned on at session start. Expect an approval prompt.

## Things not yet done, on purpose

- Milestones 2 onward are listed in TODO.md but not approved to build.
- No package.json, no dependencies, no code in either repo.
- No SPEC.md in holoml (outline is part of a later milestone).
- No git tags, branches, CI, issue templates, or GitHub settings.
- No memory files saved outside the repo; everything is in these docs.
