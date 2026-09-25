# PROMPTS.md — Owner prompt log

Every prompt from the owner, verbatim and in order. Model and effort are
as reported by the Claude Code app for this session. Tokens are the
session context total at logging time; per-prompt counts are not
available from the tool.

## 1 — 2026-09-24

Model: Claude Fable 5.1 (claude-fable-5-1) · Effort: high · Tokens: not captured

```text
I want to build

 hypersol websurfer 3d. A web browser that displays everything in 3d. Enhances regular websites and can render 3DML a new markup language to build fully 3d websites like an automobile site where all cars are 3d and you can walk around them to view them. It should be fast and efficient.

A 2d website displays in a 3d space and the components of the browser are in 3d and it can render parts of the website in 3d automaticly if possible.

Needs to be open source and run on windows, Mac, Linux, iOS, and android.

Create the 3DML language as well in a separate repository at the same time so the language and the browser work well together. Keep the language clean and open source like HTML.

The web browser needs all the modern features and has to look slick and futuristic and have themes and have the best privacy.

. Today people use a standard webbrowser where everything is flat.

Use any idea notes and sketches I supply, but do not treat every drawn screen as approved scope. Ask me important questions that would help build the first version, then wait for my answers. If I do not know an answer, explain the options and recommend a simple starting choice for me to approve. After I answer, draft a short BRIEF.md. Include the user, problem, full idea, first useful result, and features for later. Leave the detailed milestone plan for the planning step.

Show me the draft. After I approve it, save BRIEF.md. Do not write app code or start another step.
```

## 2 — 2026-09-24

Model: Claude Fable 5.1 (claude-fable-5-1) · Effort: high · Tokens: not captured

```text
1) General public
2) Embed an existing engine
3) Desktop only
4) Page as a floating panel in a 3D room, and Page sections (header, cards, images) lifted into layered depth like a parallax (with minor Detect images and models on the page and turn them into 3D objects)
5) Load a 3D model file, place it in a scene, let the user walk or orbit around it, with text labels and links Also lights, materials, and animation
6) Open any normal site and see it in the 3D browser interface, with themes
7) explain the licenses to me, and if 3dml is taken try and find one that is not
8) built-in ad and tracker blocking, no telemetry, and encrypted DNS
9) Mouse, keyboard, and touch only for now
```

## 3 — 2026-09-24

Model: Claude Fable 5.1 (claude-fable-5-1) · Effort: high · Tokens: not captured

```text
approved
```

## 4 — 2026-09-24

Model: Claude Fable 5.1 (claude-fable-5-1) · Effort: high · Tokens: not captured

```text
Read BRIEF.md and inspect the project. This will be a app on my computer. Recommend a rich architecture for the first result that can support later features. Explain your choices in plain language and check what is already available.

Review any sketches and design notes I supply. Ask me to describe anything you cannot see. Explain the main screens, how a person moves between them, where information comes from, and what needs saving. Cover waiting, empty, and error states where relevant. Without sketches, suggest a simple layout for me to review.

Draft ARCHITECTURE.md with the proposed parts and files, plus a short "Screens and style" section. Record the agreed layout, shared appearance, and open questions. Separate the first result from later screens and polish. Ask only the design questions needed now; leave detailed choices for the milestone that uses them.

Explain unfamiliar terms. Mark run and test steps "not checked yet" unless they have run. Show the draft, wait for my approval, then save it. Do not write app code, install software, add services, or set up hosting without a separate approval.
```

## 5 — 2026-09-24

Model: Claude Fable 5.1 (claude-fable-5-1) · Effort: high · Tokens: not captured

```text
layout - approved
camera -agree
4) agree
5) agree
```

## 6 — 2026-09-24

Model: Claude Fable 5.1 (claude-fable-5-1) · Effort: high · Tokens: 110,390 at logging

```text
Read BRIEF.md and ARCHITECTURE.md. Create AGENTS.MD as the project instructions file for this tool, use CLAUDE.md to point to this so other agents can read it. Confirm and use that filename. If you cannot confirm it, ask before saving.

Draft short rules: work only in this project; build only the part I approve; use only the agreed data and services; ask before adding software, deleting work, or resetting saved data. Ask when a requirement is unclear. Keep private data and secrets out. Never invent results or remove a requirement or test just to get a pass.

use these repositories https://github.com/srajpal/hypersol-websurfer-3d and https://github.com/srajpal/holoml keep the readme and other things updated

Save all prompts in PROMPTS.md make sure to add this note to CLAUDE.md and AGENTS.md as well as model and effort used (tokens too if it can be done)

Add a testing section: where tests are kept, how to run them, and which earlier behavior to recheck. Include commands only after they have run; mark others "not checked yet". Show the rules and wait for approval before saving. Do not build the app. Later, propose needed rule updates for my approval.
```

## 7 — 2026-09-24

Model: Claude Fable 5.1 (claude-fable-5-1) · Effort: high · Tokens: 110,390 at logging (same reading as entry 6)

```text
approve
```

## 8 — 2026-09-24

Model: Claude Fable 5.1 (claude-fable-5-1) · Effort: high · Tokens: 120,455 at logging

```text
add a history and story to the hypersol-websurfer-3d readme.
Hypersol, LLC was formed in 2001 by Sunny Rajpal and Mauricio Sadicoff where they released version 1.0 of HyperSol WebSurfer (more info here https://web.archive.org/web/20010922111629/http://www.hypersol.com/) at that time they had the idea for the first ever fully 3d web browser that renders sites in 3d. This is a salute to that idea on the 25th anniversary of Hypersol's formation. (read the old webpage for a bit of extra text to imbelish this writeup)

make two folders one for each project so things do not get mixed up, use your best judgement on that

initialize git and do the first commit and push.
```
