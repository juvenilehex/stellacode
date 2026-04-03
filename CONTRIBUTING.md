# Contributing to StellaCode

Thank you for your interest in contributing to StellaCode.
This document explains how to set up the project, write code, and submit changes.

## Prerequisites

- Node.js >= 20.0.0
- npm (comes with Node.js)
- Git

## Project Structure

StellaCode is an npm workspaces monorepo:

```
stellacode/
  server/    # Express + WebSocket backend (TypeScript, Vitest)
  client/    # React + Three.js frontend (TypeScript, Vite, Vitest)
  bin/       # CLI entry point (npx stellacode)
  public/    # Static assets
```

## Development Setup

```bash
git clone https://github.com/juvenilehex/stellacode.git
cd stellacode
npm install
npm run dev
```

This starts both the server and client concurrently.
Open http://localhost:3001 to access the UI.

To point at a specific project:

```bash
STELLA_TARGET=/path/to/your/project npm run dev
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start server and client in dev mode |
| `npm run build` | Build both workspaces |
| `npm test` | Run all tests (server + client) |
| `npm run lint` | Type-check both workspaces |
| `npm run test -w server` | Run server tests only |
| `npm run test -w client` | Run client tests only |

## Code Style

- **Language**: TypeScript with strict mode enabled
- **Target**: ES2022, ESNext modules
- **Formatting**: Follow the existing code conventions in each workspace
- **Types**: Explicit types for function parameters and return values. Avoid `any`.
- **Imports**: Use ES module syntax (`import`/`export`)

### Server

- Express 5 + WebSocket (ws)
- File watching via chokidar
- Tests with Vitest: place test files in `server/src/__tests__/`

### Client

- React 19 + Three.js (via @react-three/fiber)
- State management with Zustand
- Styling with Tailwind CSS 4
- Tests with Vitest: colocate test files next to source or in a `__tests__` directory

## Making Changes

### 1. Fork and Branch

```bash
git checkout -b <type>/<short-description>
```

Branch naming convention:

| Prefix | Use case |
|--------|----------|
| `feat/` | New feature |
| `fix/` | Bug fix |
| `refactor/` | Code restructuring without behavior change |
| `docs/` | Documentation only |
| `test/` | Adding or updating tests |
| `chore/` | Build, CI, dependencies |

### 2. Write Code

- Keep changes focused. One PR per concern.
- Add or update tests for any logic changes.
- Run `npm run lint` and `npm test` before committing.

### 3. Commit Messages

Follow the conventional commits format:

```
<type>: <short summary>
```

Examples:

```
feat: add file-size metric to node tooltip
fix: prevent crash on circular symlinks
refactor: extract graph layout into separate module
docs: update CLI usage examples
test: add parser edge case for empty files
chore: bump vitest to v3.1
```

Keep the summary under 72 characters. Use the imperative mood ("add", not "added").

### 4. Submit a Pull Request

- Push your branch and open a PR against `main`.
- Fill in the PR template: what changed, why, and how to test it.
- Link any related issues.
- Ensure CI passes (build + tests).

## Reporting Issues

Open a GitHub issue at https://github.com/juvenilehex/stellacode/issues.

Please include:

- What you expected to happen
- What actually happened
- Steps to reproduce
- Your OS, Node.js version, and browser
- A screenshot if the issue is visual

## Community

- Discord: [discord.gg/VGQJSda5eZ](https://discord.gg/VGQJSda5eZ)
  - `#bug-reports` -- something broke
  - `#feature-requests` -- ideas for what to build next
  - `#show-your-stars` -- share your constellation screenshots
  - `#general` -- questions and discussion

## Code of Conduct

Be kind. That is the whole policy.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
