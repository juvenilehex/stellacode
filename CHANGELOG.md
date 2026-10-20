# Changelog

All notable changes to StellaCode will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Each co-change pair carries its evidence: click it in the Co-change tab for both full paths, the newest commits that changed both (hash, subject, file count), how many of them changed more than 30 files, and a link to the file in the graph. The bar splits by that evidence -- teal for the share from commits of 30 files or fewer, gray for bigger ones. Large commits are marked, not dropped, because a squash-merged pull request is one large commit too
- The Co-change tab filters by hidden / linked / not in graph / all, opens on the hidden pairs with the first pair's commits showing, lists all 50 strongest pairs (it stopped at 15) and says how many pairs there were in total. Pairs are ordered by their commits of 30 files or fewer (shown as e.g. `1/3`), or by % from the column head -- a pair held together only by release commits no longer tops the list
- Re-exports (`export … from`, `export * as ns from`, `export type * from`) and `import('…')` with a literal path draw import lines; text in comments, strings and template literals does not
- The Git panel's Co-change tab marks each pair: hidden (no import between the files), linked by an import too, or not in the graph (a file the parser doesn't draw, such as LICENSE or a stylesheet), with the three counts on top. The coupling badge tooltip gives the same split

### Fixed
- The Git panel fits the screen. It was a fixed 384px box placed off the branch pill, so on a phone-width screen (390px) its left 51px -- the first file of every pair and the commit hashes -- fell outside. It now opens by default (closing it is remembered), scrolls once instead of inside a 256px box, keeps its filter, sort and open pair across tabs, and its text follows the UI font size and stays 12px or larger (the list was 8-10px). The legend lists only the languages the project has
- Ctrl+C now stops StellaCode on macOS and Linux. With a browser tab connected, the server closed its listener but kept the open WebSocket (and, in builds from April on, a cleanup timer) alive, so it never exited and the terminal hung waiting for it. Shutdown now drops the connections and exits; if anything is still open after 5 seconds it exits with code 1 and names it
- TypeScript projects that write relative imports as `./x.js` (Node16/NodeNext ESM) drew no import lines for them, so every co-change pair among those files was reported as hidden coupling. `.js`/`.jsx`/`.mjs`/`.cjs` specifiers now resolve to the TypeScript source first, in TypeScript's own lookup order
- Opening a subfolder of a repository now draws its co-change lines; graph and Git panel used repo-root paths for one and folder paths for the other
- In a subfolder, co-change pairs were ranked across the whole repository before files outside the folder were dropped, so pairs the Co-change tab listed could have no line. The graph, the Git panel and `/api/git/co-changes` now share one analysis of the opened folder's history
- Files and folders with non-ASCII names (e.g. Korean) get their co-change lines and commit counts; git's octal-quoted paths never matched
- With a subfolder open, the Git panel's Hot, Co-change and timeline lists show only files inside it, by folder-relative path
- The coupling badge counts the co-change lines drawn in the graph instead of the longer list
- The High Contrast theme now reaches the toolbar, Git panel, About dialog and timeline
- Plain file saves are no longer counted as 'Agent Activity' -- the file watcher can't tell who saved, so they show as changes of unknown source
- Sidebar and About badges showed `v1.0` / `v1.1`; the version is now derived from `package.json` at build time
- Reduced motion (`prefers-reduced-motion: reduce`) now also stills the connect-screen starfield, AI agent trail sparkles and nebula clouds
- Changing the target from the toolbar now replays the entry animation when the WebSocket is down, without restarting it when the broadcast already arrived
- Node labels in large projects (>100 nodes) follow the node size setting instead of an older size formula
- Changing the target to a folder with no supported source files (or any graph that fails the integrity check) now answers 422 with the reason and stays on the current project; before, it reported success, kept showing the old project and silently watched the new folder
- A graph copy that arrives late (WebSocket vs HTTP) no longer replaces a newer one, and two builds in the same millisecond are no longer mistaken for one — graphs carry a per-process `buildEpoch` and growing `buildId`
- Settings saved by an older version (missing a newer key) no longer crash the 3D view on load

## [1.3.0] - 2026-03-23

### Added
- Discord bot with welcome messages, `/report` command, and auto-react
- Discord webhook automation for release announcements and star milestones
- OG image for social media previews (KakaoTalk, Twitter, etc.)
- Usage statistics collection (L2 quality loop)
- Build metrics endpoint `/api/metrics` with auto-analysis (L6)
- Graph integrity verification after each build (L3)
- Quality judgment with kill switches (L5)
- Auto-config adjustment based on build trends (L6)

### Fixed
- Empty catch blocks now log errors instead of silently swallowing
- CI test file tracking and cross-platform compatibility

## [1.2.0] - 2026-03-21

### Added
- Settings panel with theme selection and customization
- High-contrast theme for accessibility
- `npx stellacode` distribution
- Client store unit tests

### Fixed
- Various bug fixes and stability improvements

## [1.1.0] - 2026-03-14

### Added
- Security hardening (CSP, CORS, rate limiting, input validation)
- 20-round self-evolution cycle (L7 40 to 44/70)

### Fixed
- Discord link, repository URL, client bugfixes
- AboutModal feedback section

## [1.0.0] - 2026-03-11

### Added
- Initial public release
- 3D constellation visualization with force-directed layout
- File and directory node rendering with instanced meshes
- Import edge detection (TypeScript, JavaScript, Python)
- Git intelligence: co-change detection, conventional commit parsing
- AI agent activity tracking (11 agents supported)
- Time travel: commit-by-commit replay with timeline slider
- Observe mode (`O` key) for contemplative viewing
- WebSocket real-time updates on file changes
- Canvas2D label overlay for zero-cost text rendering

## [0.2.0] - 2026-03-09

### Added
- UI overhaul
- Public README
- Discord feedback channel

## [0.1.0] - 2026-03-06

### Added
- Foundation: code observatory with 3D constellation view
- Basic file scanning and import parsing
- Force-directed graph layout with Barnes-Hut optimization
