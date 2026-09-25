# Privacy: what HyperSol WebSurfer 3D stores and sends

HyperSol WebSurfer 3D has no telemetry: no analytics, no crash reports, no
usage counts. This page lists everything it keeps on your computer and
everything it sends over the network. It is updated whenever that
changes (AGENTS.md rule 9).

Status: as of milestone 3 (2026-09-25). Ad and tracker blocking and
encrypted DNS arrive in milestone 4 and will be added here.

## Stored on your computer

Everything is in the app data folder, and nowhere else:

- Windows: `%APPDATA%\HyperSol WebSurfer 3D`
- macOS: `~/Library/Application Support/HyperSol WebSurfer 3D`
- Linux: `~/.config/HyperSol WebSurfer 3D`

(Development and test runs use a separate throwaway folder, never this
one.)

| What | File | When it is written | How to delete it |
|---|---|---|---|
| Bookmarks | `hypersol.sqlite` | When you press the star or Ctrl+D | Remove them in the Library, or press the star again |
| History: each page's address, title, and time of visit | `hypersol.sqlite` | When a tab arrives at a page; the same page again in the same tab (a reload) adds nothing | Delete entries in the Library, "Clear all history", or Settings > Clear browsing data |
| Settings: search engine, what opens at startup | `settings.json` | When you change a setting | Delete the file; the defaults return |
| Open tabs: their addresses and which one is in front | `session.json` | While you browse, shortly after tabs change | Reopened only when Settings > On startup is "Reopen your tabs from last time"; delete the file to forget them |
| Cookies, site storage, and cache | Chromium's profile files in the same folder | By the sites you visit, as in any browser | Settings > Clear browsing data |

If `settings.json` is damaged, it is renamed to
`settings.json.damaged-<date and time>` and kept for inspection, and the
defaults are used. If `hypersol.sqlite` cannot be opened, nothing is
recorded until it can be, and the Library says so.

Not stored: form entries, passwords, downloads, and anything about how
you use the browser itself.

## Sent over the network

Only these, all started by you:

- The pages you open, including the images, scripts, and the favicon each
  page names (fetched through that page's own session, as a browser tab
  does).
- Searches typed in the address bar or start panel go to the search engine
  chosen in Settings (DuckDuckGo by default).
- DNS lookups for the sites you open. Until milestone 4 these use your
  network's normal DNS; from milestone 4 they go encrypted to the named
  resolver.

Nothing else: no update checks, no dictionary downloads (the spell
checker is off), no account, no sync.
