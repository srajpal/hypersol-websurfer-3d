# AGENTS.md — Project instructions for AI agents

Read this file first. It applies to every agent and tool working in this
repository. CLAUDE.md imports it, so Claude Code reads it automatically.

## Project

HyperSol WebSurfer 3D: an open-source desktop browser with a 3D interface,
plus HoloML, a 3D markup language kept in its own repository.

- Brief: BRIEF.md (user, problem, idea, first result, later features)
- Architecture: ARCHITECTURE.md (parts, files, decisions, screens, open questions)
- Roadmap and current plan: TODO.md (milestones, tasks, checks)
- Prompt log: PROMPTS.md (every prompt the owner gives, verbatim)
- Handoff: HANDOFF.md (current state and how to resume; keep it current)
- Browser repo: https://github.com/srajpal/hypersol-websurfer-3d
- Language repo: https://github.com/srajpal/holoml
- Local layout: two sibling folders, `hypersol-websurfer-3d/` (this repo)
  and `holoml/`, side by side under the same parent. Never nest one in
  the other. PROMPTS.md in this repo is the single prompt log for both.
- License: Apache 2.0 (both repos); HoloML spec text also CC BY 4.0

## Naming conventions

- The company is "HyperSol", with no "LLC" or "Inc." after it.
- The founders are named without job titles.
- The browser is "HyperSol WebSurfer 3D"; the original 2001 product is
  "HyperSol WebSurfer". The language is "HoloML", file extension `.holo`.

## Rules

1. Work only in this project: this folder, the sibling holoml folder,
   and the session scratchpad. Caches that installs write elsewhere by
   design (the pnpm store, Electron and Playwright download caches) are
   allowed. Development and test runs use a disposable browser profile
   under the ignored `userData/` folder or a temporary directory, never
   the owner's real profile.
2. Build only what the owner has approved. Approval comes in two kinds:
   first a milestone's plan is approved, then its build. Build approval
   covers every task in that milestone's plan in TODO.md. The agent
   checks in at any decision point the plan marks (for example the
   milestone 1 spike result) and at the end for acceptance. Anything not
   in the plan's tasks needs its own approval.
3. Use only the data and services agreed in ARCHITECTURE.md. No new
   network calls, services, hosting, or third-party accounts without
   separate approval.
4. Ask before adding software (packages, tools, runtimes), deleting work,
   resetting saved data, initialising or force-pushing git, or publishing
   anything.
5. Ask when a requirement is unclear or two readings would lead to
   different work. Do not guess on scope.
6. Keep private data and secrets out of the repository, the docs, the
   tests, and the prompt log. No API keys, tokens, passwords, personal
   addresses, or real browsing data. Use placeholders and a .gitignore.
   See Prompt log for redaction.
7. Never invent results. Report what actually ran and what it produced.
   If something failed or was skipped, say so.
8. Never remove or weaken a requirement, a test, or an assertion to get a
   pass. Fix the code, or report the failure and ask.
9. Keep the README and other docs current. Any change that alters
   behaviour, setup, structure, or decisions updates the matching doc in
   the same change.
10. Mark run and test steps "not checked yet" until they have actually
    been executed in this project. Record commands only after they ran.
11. Commit after each completed, approved change, with a clear message
    that says what changed and why. Do not push unless asked. When five
    or more commits are waiting to be pushed, remind the owner at the end
    of the reply. Never rewrite published history.
12. One active agent session per working tree at a time. If two sessions
    must run at once, they work in different folders. Before appending to
    PROMPTS.md, read its last heading and use the next number. Every
    entry carries a session tag.
13. Security cadence: at the start of each milestone, check Electron's
    release notes for security releases. Upgrade to the current supported
    stable line before any public release. Record the version and the
    date checked in ARCHITECTURE.md section 3.

## Prompt log

Applies to the project owner's sessions only; contributors do not log
prompts. Every prompt from the owner is appended to PROMPTS.md, verbatim,
in order, before the work for it begins. Each entry records: number,
date, model, effort level, session tag (model name plus the first eight
characters of the session id), and the session context tokens reported
by the tool at logging time (per-prompt token counts are not available;
say so rather than estimate).

Redaction: secrets, keys, and personal data (addresses, phone numbers,
non-public names) are replaced with placeholders such as
`[redacted-token]` and the replacement is noted under the entry. Images
and attachments are summarised in one line, never embedded.

Do not edit earlier entries except to correct a factual error, and note
the correction.

## Working agreement

- The owner approves: the brief, the architecture, each milestone plan,
  each milestone build, and each finished milestone. Show drafts and
  wait.
- Prefer small, reviewable changes. One milestone at a time.
- When a rule needs changing, propose the wording and wait for approval.
  Do not change this file silently.
- Unfamiliar terms get a one-line explanation the first time they appear
  in a document.
- At the end of each milestone, save screenshots of the main screens to
  docs/screenshots/<milestone>/ with `MILESTONE=mN pnpm screenshots`, and
  add them to the README's Progress section. (Added 2026-09-25, prompt
  21.)
- Owner-only automation (Remote Control at session start, the prompt-log
  reminder) lives in CLAUDE.local.md, which is gitignored, so
  contributors' sessions never inherit it. HANDOFF.md holds a copy for
  recreating it on a new machine.

## Testing

Where tests live:
- Unit tests next to the code they test: `*.test.ts` in each package and
  in apps/browser/src.
- End-to-end tests in tests/e2e (Playwright driving the Electron app).
- Test fixture pages in tests/fixtures, served from 127.0.0.1.
- HoloML conformance fixtures in the holoml repo under conformance/.

How to run (from the repo root; recorded 2026-09-24 on Windows 11 after
they ran; macOS and Linux not checked yet):
- Install: `pnpm install`
- Unit: `pnpm test` (Vitest; 35 tests passed)
- Lint and type check: `pnpm lint` and `pnpm typecheck` (both clean)
- End-to-end: `pnpm test:e2e` builds the app, then runs Playwright
  against it (about two minutes; 71 checks). Needs openssl on PATH for
  the certificate-error check (Git for Windows includes one). Every
  host except 127.0.0.1 is blocked during the run, and the test windows
  ignore the real mouse, so a resting cursor cannot disturb results. See
  TODO.md for results.
- The end-to-end run opens app windows on screen; leave the machine
  alone while it runs.

What to recheck after any change (regression list; grows with each
milestone; the current milestone's checks are defined in TODO.md):
- Milestone 1 checks C1 to C11 from TODO.md (`pnpm test:e2e`): app
  launches, clicks land on the tilted page, parallax does not shift
  targets, typing, scrolling, hover and links, page isolation, no
  unexpected traffic, idle efficiency, load failure, page crash. Plus
  the unit tests (`pnpm test`).
- Milestone 2 checks D1 to D11 (same command): top bar, tabs, snapshots
  and favicons, many tabs, new-window rules, loading strip, error cards,
  right-click menu, start panel, shortcuts, About.
- Milestone 3 checks E1 to E10 (same command): bookmarks, history,
  Library, start panel data, search engine setting, reopening tabs,
  data intact after restart, clearing data, damaged or blocked saved
  data, keyboard access to the panels.
- Later milestones add: a known tracker is blocked and DNS resolves over HTTPS (4), depth
  layering (5), theme switch (6), per-OS installers (7).

Rules for tests: a failing test is reported, not deleted. A test is
changed only when the requirement it checks has changed, and the doc that
states the requirement is updated in the same change.
