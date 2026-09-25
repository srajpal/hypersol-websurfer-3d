# HyperSol WebSurfer 3D

An open-source desktop web browser whose interface lives in three
dimensions. Ordinary websites float as panels in a 3D room, page sections
lift into layered depth, and a companion markup language, HoloML, lets
anyone publish a fully 3D website as easily as writing HTML.

Windows, macOS, and Linux. Apache 2.0. No telemetry.

**Status: milestone 3 built, awaiting review.** A browser in a 3D room
that remembers: tabs as cards on an arc, a top bar with address, search,
and a bookmark star, bookmarks and history in a Library panel, a
Settings panel, a start panel with your data, error cards, and a
right-click menu. See [Progress](#progress), TODO.md, and
[Project documents](#project-documents).

## The story

In December 2000, two computer engineering students who had met at
Florida Atlantic University, Sunny Rajpal and Mauricio Sadicoff, started
a small Florida software company. In early 2001 it became HyperSol, with
a plain mission: build high-quality software that makes people's
time on a computer more productive and more fun.

Their first product was a web browser. HyperSol WebSurfer was born, as
the original site put it, "when we needed some features that no other
browser would allow", starting with control over the pop-up windows that
plagued the web of 2001. Since they were writing a browser anyway, they
kept going. WebSurfer 1.0.0 shipped on March 5, 2001, free, for Windows
95, 98, 2000, and ME. By March 13 it was at version 1.0.6 and updating
itself with a press of Ctrl+U.

Some of what made it different still reads as ahead of its time:

- **Themes** that changed the whole browsing environment, not just the
  colours: new images, new buttons, and matching sounds across the
  application. It shipped with three: Surfer, Space, and Winter.
- **Automatic page refresh** for stock quotes every minute or headlines
  every five seconds.
- **A full HTML editor** built into the browser, with colour-coded source
  and one-click preview.

The site's own pitch was simple: "It's new, it's cool, and it's FREE!"
The company's second product, CheckIfSiteIsStillUp, was named Download
of the Day on TechTV's The Screen Savers in July 2001.

Behind the shipped features sat a bigger idea the founders talked about
then and never got to build: a browser where the web itself is not flat.
Sites rendered in three dimensions. A browser you look into, not at.

That was 2001. The hardware, the graphics APIs, and the open web
platform were not ready. Twenty-five years later they are.

## The salute

HyperSol WebSurfer 3D marks the 25th anniversary of HyperSol's formation
by finally building that idea, in the open, for everyone. It keeps the
spirit of the original: free, themed, a little bit cool, and made by
people who wanted a browser that did something no other browser would.

The name is the same. The mission is the same. The third dimension is
new.

An archived copy of the 2001 site is available through the
[Wayback Machine](https://web.archive.org/web/20010922111629/http://www.hypersol.com/).

## What it will do

First useful result (see BRIEF.md):

- Open any normal website in a 3D browser interface, with tabs as
  floating cards, address bar, bookmarks, and history.
- Page sections lifted into layered depth.
- At least two themes, Nebula (dark) and Daylight (light).
- Privacy on by default: ad and tracker blocking, encrypted DNS, zero
  telemetry.
- Mouse, keyboard, and touch.

Later: HoloML page mode with a car showroom demo, images and 3D models
lifted out of ordinary pages, free camera movement, mobile, VR, and more.

## Progress

Screenshots from each finished milestone, kept in
[docs/screenshots](docs/screenshots).

**Milestone 1: a live page in the 3D room.** A real website on a tilted
panel, clicks and typing working.

![Wikipedia on the tilted panel in the 3D room](docs/screenshots/m1/1-wikipedia-tilted.png)

**Milestone 2: browsing basics.** Tabs as cards on an arc, the top bar,
the start panel, and error cards.

![Three tabs as cards on the left, a page tilted in the centre](docs/screenshots/m2/1-tabs.png)

![The new-tab start panel with the "Nothing saved yet" empty state](docs/screenshots/m2/2-start-panel.png)

![The "We couldn't find that site" error card](docs/screenshots/m2/3-error-card.png)

**Milestone 3: memory and settings.** Bookmarks and history, the Library
and Settings panels, and a start panel with your data.

![The start panel showing a bookmark and recent history](docs/screenshots/m3/2-start-panel.png)

![The Library panel showing today's history](docs/screenshots/m3/4-library-history.png)

![The Settings panel: search engine, startup, clear browsing data](docs/screenshots/m3/5-settings.png)

## HoloML

HoloML is the 3D markup language developed alongside the browser, in its
own repository so it stays independent and reusable:
[github.com/srajpal/holoml](https://github.com/srajpal/holoml).

## Project documents

| File | What it is |
|---|---|
| [BRIEF.md](BRIEF.md) | User, problem, full idea, first useful result, features for later |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Technical decisions, parts and files, screens and style, open questions |
| [TODO.md](TODO.md) | Milestone roadmap and the current milestone's tasks and checks |
| [AGENTS.md](AGENTS.md) | Rules for AI agents and contributors working in this repo |
| [PROMPTS.md](PROMPTS.md) | Verbatim log of every owner prompt that shaped the project |
| [HANDOFF.md](HANDOFF.md) | Current state, decisions made, open questions, how to resume |

## Technology

In use now: Electron 44 (the current supported stable line), TypeScript,
Three.js, Lit, and SQLite through Node's built-in node:sqlite; Vite and
electron-vite to build; Vitest and Playwright to test.
Planned, not yet installed: Ghostery's open-source ad-blocking engine
(milestone 4) and electron-builder for installers (milestone 7).
Reasons for each choice are in ARCHITECTURE.md.

Known limitation: Electron ships no DRM module, so video from Netflix
and similar services will not play.

## Building and running

Early development. Checked on Windows 11 only; macOS and Linux have not
been checked yet, so treat them as untested.

You need Node 22.13 or newer and pnpm 12.4.1. The pnpm version is pinned
in package.json (`packageManager`), so pnpm, or `corepack enable`, uses
that exact version. Install with the lockfile as it is:

```
pnpm install --frozen-lockfile
pnpm dev
```

The first run downloads the Electron binary (about 100 MB, from
Electron's GitHub releases) and checks it against the checksums shipped
in the electron package. The end-to-end tests also need `openssl` on
PATH, which Git for Windows provides.

`pnpm dev` opens the app on a start tab. Type an address or a search
in the top bar; Ctrl+T opens a tab, Ctrl+W closes one, Ctrl+Tab moves
between them, and the cards on the left switch tabs. Ctrl+D bookmarks a
page, Ctrl+Shift+O opens the Library, and Ctrl+, opens Settings. What
the browser stores and sends is listed in [docs/privacy.md](docs/privacy.md). Development runs use a
throwaway profile in the `userData/` folder, never your normal browser
data.

Tests: `pnpm test` (unit), `pnpm lint`, `pnpm typecheck`, and
`pnpm test:e2e` (builds the app and drives it for about two minutes;
needs openssl on PATH, which Git for Windows provides). Its windows stay
off screen and never take focus, so you can keep working; set
`HYPERSOL_TEST_SHOW=1` to watch instead. Current results are in
TODO.md.

## Contributing

Read AGENTS.md first. Work happens one approved milestone at a time.
Issues and pull requests are welcome once the first milestone lands.

## License

Apache License 2.0. See [LICENSE](LICENSE).
