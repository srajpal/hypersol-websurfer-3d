# AGENTS.md — Project instructions for AI agents

Read this file first. It applies to every agent and tool working in this
repository. CLAUDE.md imports it, so Claude Code reads it automatically.

## Project

HyperSol WebSurfer 3D: an open-source desktop browser with a 3D interface,
plus HoloML, a 3D markup language kept in its own repository.

- Brief: BRIEF.md (user, problem, idea, first result, later features)
- Architecture: ARCHITECTURE.md (parts, files, decisions, screens, open questions)
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

1. Work only in this project. Do not read, change, or create files outside
   this folder or the sibling holoml folder, except the session scratchpad.
2. Build only the part the owner has approved. Approval is per milestone
   and per step; approval of one step does not extend to the next.
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

## Prompt log

Every prompt from the owner is appended to PROMPTS.md, verbatim, in order,
before the work for it begins. Each entry records: number, date, model,
effort level, and the session context tokens reported by the tool at
logging time (per-prompt token counts are not available; say so rather
than estimate). Do not edit earlier entries except to correct a factual
error, and note the correction.

## Working agreement

- The owner approves: the brief, the architecture, each milestone plan,
  and each finished milestone. Show drafts and wait.
- Prefer small, reviewable changes. One milestone at a time.
- When a rule needs changing, propose the wording and wait for approval.
  Do not change this file silently.
- Unfamiliar terms get a one-line explanation the first time they appear
  in a document.

## Testing

Where tests live (planned; nothing exists yet):
- Unit tests next to the code they test: `*.test.ts` in each package and
  in apps/browser/src.
- End-to-end tests in tests/e2e (Playwright driving the Electron app).
- HoloML conformance fixtures in the holoml repo under conformance/.

How to run — not checked yet. No test has been run in this project.
Commands will be recorded here only after they have run successfully.
- Unit: not checked yet
- End-to-end: not checked yet
- Lint and type check: not checked yet

What to recheck after any change (regression list; grows with each
milestone):
- Nothing yet. The first milestone will add: app launches, opens a site,
  switches tabs, switches theme, blocks a known tracker, resolves DNS
  over HTTPS, restarts with history and bookmarks intact.

Rules for tests: a failing test is reported, not deleted. A test is
changed only when the requirement it checks has changed, and the doc that
states the requirement is updated in the same change.
