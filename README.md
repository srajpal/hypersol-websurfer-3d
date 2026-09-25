# HyperSol WebSurfer 3D

An open-source desktop web browser whose interface lives in three
dimensions. Ordinary websites float as panels in a 3D room, page sections
lift into layered depth, and a companion markup language, HoloML, lets
anyone publish a fully 3D website as easily as writing HTML.

Windows, macOS, and Linux. Apache 2.0. No telemetry.

**Status: planning.** The brief and architecture are approved. No app
code exists yet. See [Project documents](#project-documents).

## The story

In December 2000, two computer engineering students who had met at
Florida Atlantic University, Sunny Rajpal and Mauricio Sadicoff, started
a small Florida software company. In early 2001 it became HyperSol, LLC,
with a plain mission: build high-quality software that makes people's
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

## HoloML

HoloML is the 3D markup language developed alongside the browser, in its
own repository so it stays independent and reusable:
[github.com/srajpal/holoml](https://github.com/srajpal/holoml).

## Project documents

| File | What it is |
|---|---|
| [BRIEF.md](BRIEF.md) | User, problem, full idea, first useful result, features for later |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Technical decisions, parts and files, screens and style, open questions |
| [AGENTS.md](AGENTS.md) | Rules for AI agents and contributors working in this repo |
| [PROMPTS.md](PROMPTS.md) | Verbatim log of every owner prompt that shaped the project |

## Technology

Electron 44, TypeScript, Three.js, Lit, SQLite, Ghostery's open-source
ad-blocking engine. Reasons for each choice are in ARCHITECTURE.md.

## Building and running

Not checked yet. Nothing has been built. Commands will appear here once
they have actually run.

## Contributing

Read AGENTS.md first. Work happens one approved milestone at a time.
Issues and pull requests are welcome once the first milestone lands.

## License

Apache License 2.0. See [LICENSE](LICENSE).
