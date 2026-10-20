# StellaCode

**Code Observatory** — observe your codebase as a living constellation.

**See what your AI agent changed, surface hidden coupling debt (files that always change together but share no import), and replay your git history — all local, in your terminal. No cloud, no code leaves your machine.**

[![npm version](https://img.shields.io/npm/v/stellacode?color=CB3837&logo=npm)](https://www.npmjs.com/package/stellacode)
[![CI](https://github.com/juvenilehex/stellacode/actions/workflows/ci.yml/badge.svg)](https://github.com/juvenilehex/stellacode/actions/workflows/ci.yml)
[![Discord](https://img.shields.io/badge/Discord-Join%20Server-5865F2?logo=discord&logoColor=white)](https://discord.gg/VGQJSda5eZ)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

```bash
npx stellacode
```

Run it inside a project; StellaCode opens a local observatory for that codebase.

![StellaCode on the axios repository: the Git panel's Co-change tab with a hidden pair expanded to the commits that changed both files](https://raw.githubusercontent.com/juvenilehex/stellacode/master/screenshots/03-constellation-view.png)
*StellaCode on [axios](https://github.com/axios/axios): its CommonJS and ES-module type-test helpers changed in the same 7 commits with no import between them — hidden coupling, and the commits behind it. This is `master`; npm's 1.3.0 doesn't list these yet ([run from a clone](#quick-start)).*

## Quick Start

Run it from the project you want to observe:

```bash
cd your-project
npx stellacode
```

StellaCode opens your browser and the current project's constellation blooms automatically — no clicks. To observe a different directory instead, type a path on the start screen before it advances, or pass one on the command line:

```bash
npx stellacode /path/to/another/project
```

Or clone StellaCode and run it locally:

```bash
git clone https://github.com/juvenilehex/stellacode.git
cd stellacode
npm install
npm run dev
```

![StellaCode start screen](https://raw.githubusercontent.com/juvenilehex/stellacode/master/screenshots/stellacode-start.png)
*The start screen auto-opens the current project; type a path to observe another instead.*

## What You See

| Celestial body | What it means |
|----------------|---------------|
| **Star** | A file. Size = complexity (symbol count). Color = language. |
| **Constellation Line** | An import between two files — the declared wiring of your code. |
| **Co-change Thread** | Two files that change together in git. With no import between them, that is hidden coupling. |
| **Trail** | The path a live Claude Code session leaves across your code. |
| **Pulse** | A file changing right now. |
| **Diamond** | A directory. The structure that holds stars together. |

<details>
<summary>How lines, threads and trails are read</summary>

- **Lines** come from `import … from`, re-exports (`export … from`) and `import('…')` with a literal path. TypeScript's `./x.js` spelling finds `x.ts`. A computed `import(path)` can't be read, so it draws no line.
- **Threads**: the Git panel opens on its Co-change tab (close it and it stays closed). It marks each pair as hidden, linked by the code (and how), or not in the graph (a file the parser doesn't draw), starts on the hidden ones and shows the commits behind the first pair; click any pair for its commits. Pairs are ordered by how many of those commits changed 30 files or fewer (`commits`, e.g. `1/3`), or by `%` from the column head. The gray part of a bar is the share from bigger commits — a release dump or a big merge can join unrelated files.
- **Trails** are read from Claude Code's session log. Plain file saves are not trails — the file watcher can't tell who saved.

</details>

## Why

We talk to AI, and code appears. Files multiply. One day you look around and realize you have a project you built — but don't quite recognize anymore. Where does this connect? What did the AI change while you weren't looking? What keeps quietly breaking together?

It can feel a little overwhelming. We thought it might help to just... see it.

Every file becomes a star. Every import draws a constellation line. Hidden couplings — files that always change together but share no import — glow as teal threads you never knew existed. And when a Claude Code session touches your code, it leaves a trail across the sky.

**Understand your project at a glance, and maybe feel something while you do.**

If you've been staring at strings of text in a dark room for hours, we hope watching your code quietly glow and orbit can offer a moment of calm. Your project is alive. It's growing. And now you can see it.

## Features

### Code Structure
- 3D force-directed graph with golden ratio spiral layout
- Files as stars, directories as diamonds, imports as constellation lines
- Language detection (TypeScript, JavaScript, Python, Go) — TypeScript, JavaScript and Python get their own colors; Go files are drawn in the neutral color for now
  > Currently supports TypeScript, JavaScript, Python, and Go. Want another language? [Let us know on Discord.](https://discord.gg/VGQJSda5eZ)
- Search, filter by language, click to inspect

### Git Intelligence
- **Co-change detection** — finds files that always change together, even without imports. These hidden dependencies are often where bugs hide. Each pair lists the commits behind it — a place to start asking why.
- **Conventional commit parsing** — feat, fix, refactor badges on each commit
- **Hot files** — most frequently modified files, ranked
- **Activity heatmap** — 30-day commit visualization
- **Branch status** — current branch, clean/dirty state

### AI Agent Tracking
- Detects commits from Claude Code, Copilot, Cursor, Aider, Codeium, Tabnine, Windsurf, Devin, Amazon Q, Gemini, and Bolt
- Live trails for Claude Code sessions (other agents are recognized from their commits)
- See the boundary between human and machine work

### Visual Experience
- **Entry animation** — stars bloom into existence when the constellation loads
- **Complexity glow** — complex files burn brighter
- **Co-change pulse** — coupled files breathe together
- **Code age coloring** — old stars glow red, new stars glow blue
- **Agent color mode** — see which AI touched which file
- **Nebula clouds, shooting stars, 4-layer starfield** — deep space atmosphere
- **3-point cinematic lighting** — warm key, cool fill, purple rim

### Time Travel
- **Commit replay** — watch your constellation grow commit by commit
- **Timeline slider** — scrub through your project's history
- **Playback controls** — play, pause, rewind

### Observe Mode
Press `O` to hide all UI and watch the stars quietly. Just your code, breathing in the dark.

### Capture
Click the capture button in the toolbar ("Save screenshot (PNG)") to save a PNG of your constellation.

![StellaCode inspecting a file](https://raw.githubusercontent.com/juvenilehex/stellacode/master/screenshots/stellacode-detail.png)
*Click any star to see its symbols, connections, and place in the constellation.*

## Controls

| Action | Input |
|--------|-------|
| Rotate | Click + drag |
| Zoom | Scroll wheel |
| Focus a star | Click it |
| Star info | Hover |
| Deselect | Click empty space |
| Search | `Ctrl+F` or search bar |
| Observe mode | `O` |
| Label mode cycle | `L` |
| Color mode: default | `1` |
| Color mode: age | `2` |
| Color mode: agent | `3` |
| Screenshot | Capture button |

## Architecture

```
Your project
  │
  ▼
Server (Express)
  directory scanner
  code parser (TS/JS/Python/Go)
  graph builder + force layout
  file watcher (chokidar)
  agent tracker (git + .claude/)
  │ WebSocket
  ▼
Browser (React + R3F)
  Three.js 3D scene
  Zustand stores, UI panels
```

### Tech Stack

| Layer | Choice |
|-------|--------|
| Build | Vite 6 |
| Frontend | React 19 + TypeScript |
| 3D | React Three Fiber + drei + postprocessing |
| State | Zustand |
| CSS | Tailwind CSS 4 |
| Server | Express 5 + ws + chokidar |
| Parser | Regex-based (TS/JS/Python/Go) |

## API

The main endpoints are below. The complete list is the routers in [`server/src/routes/`](server/src/routes/).

- `GET /api/graph` — full graph (nodes, edges, stats)
- `GET /api/graph/node/:id` — one node with its connections
- `GET /api/stats` — project statistics
- `GET /api/git/stats` — commits, branches, heatmap, co-changes
- `GET /api/git/log?limit=50` — parsed git log
- `GET /api/git/co-changes` — co-change pairs: the same pairs the graph draws and the Git panel lists, scoped to the opened folder
- `GET /api/agent/events` — file-watch events (`agent: "unknown"` — a file watcher can't tell who saved) and recent agent commits
- `GET /api/agent/sessions` — active agent sessions
- `POST /api/target` — switch the observed directory; answers 422 with the reason and keeps the current target when the directory yields no valid graph (e.g. no supported source files)
- `GET /api/integrity` — integrity of the latest build

WebSocket at `ws://localhost:3001/ws` pushes `connected`, `graph:update`, `file:change`, `agent:live`, `quality:alert`, and `build:integrity` events (defined in [`server/src/domain.ts`](server/src/domain.ts) `WsMessageType`). When a rebuild after a file change fails the integrity check, the previous graph stays on screen and the toolbar shows `Build failed HH:MM` (hover for the reason).

## Development

```bash
npm run dev       # Start server + client
npm run build     # Production build
npm run lint      # Type-check both packages
npm test          # Run server + client tests
```

```bash
# Dogfooding — observe StellaCode with StellaCode
STELLA_TARGET=./ npm run dev
```

## Feedback

StellaCode is still young, and we'd love to hear what you think.

- **Discord**: [Join the server](https://discord.gg/VGQJSda5eZ) — share your constellation, tell us what's broken, or just say hi
- **GitHub Issues**: open an issue if you prefer

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

MIT
