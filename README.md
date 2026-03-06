# StellaAgent

> **Code Observatory** — 코드 우주를 관측하다

## Problem

바이브코딩 시대. 코드는 폭발적으로 늘어나는데, 구조는 보이지 않는다. 어디가 어디와 연결되어 있는지, AI가 어디를 얼마나 바꿨는지, 자주 같이 바뀌는 파일이 뭔지 — 아무도 모른다. 기존 도구들은 현재 상태의 스냅샷만 보여준다. 하지만 코드는 매일 변한다.

## Solution

천문대가 우주를 관측하듯, StellaAgent는 코드 우주를 관측한다. 정적 분석으로 "지금"을, git 분석으로 "어떻게 여기까지 왔는지"를 보여준다. 둘을 합치면 코드가 **어디로 가고 있는지** 보인다.

## Quick Start

```bash
git clone https://github.com/YOUR_USERNAME/stellaagent.git
cd stellaagent
npm install
npm run dev
```

Open http://localhost:5173. 특정 프로젝트를 관측하려면:

```bash
STELLA_TARGET=/path/to/your/project npm run dev
```

## What You See

| 천체 | 의미 |
|------|------|
| **Star** (별) | 파일. 크기 = 심볼 수, 색 = 언어 |
| **Constellation Line** (성좌선) | import 관계. 선언된 의존성 |
| **Co-change** (은하수) | git에서 발견한 숨겨진 의존성. teal 색 |
| **Trail** (유성) | AI 에이전트가 지나간 흔적 |
| **Pulse** (맥동) | 실시간 파일 변경 |
| **Diamond** (다이아몬드) | 디렉토리 |

## Git Intelligence

StellaAgent의 차별점. git history를 1등 시민(first-class)으로 취급한다.

- **Conventional Commit 파싱**: `feat`, `fix`, `refactor` 등 색상 코드 배지
- **Co-change 감지**: 자주 같이 바뀌는 파일 = 숨겨진 의존성 (import에 없는 커플링)
- **Hot files**: 가장 자주 수정되는 파일 랭킹
- **Activity heatmap**: 30일 커밋 활동 시각화
- **AI 에이전트 추적**: Claude Code, Copilot, Cursor, Aider, Codeium, Tabnine 커밋 감지
- **Branch status**: 현재 브랜치 + clean/dirty 표시

## Controls

| Action | Input |
|--------|-------|
| Rotate | Click + drag |
| Zoom | Scroll wheel |
| Focus node | Click a star |
| Reset view | ESC |
| Search | Type in search bar |

## Architecture

```
Browser (React + R3F)          Server (Express)
├── Three.js scene              ├── Scanner (directory walker)
├── Zustand stores              ├── Parser (TS/JS/Python regex)
├── UI panels                   ├── Graph builder + force layout
└── WebSocket client            ├── WebSocket broadcaster
                                ├── File watcher (chokidar)
                                └── Agent tracker (.claude/ + git)
```

### Tech Stack

| Layer | Choice |
|-------|--------|
| Build | Vite 6 |
| Frontend | React 19 + TypeScript |
| 3D | React Three Fiber + drei + postprocessing |
| State | Zustand |
| CSS | Tailwind CSS 4 |
| Server | Express + ws + chokidar |
| Parser | Regex-based (TS/JS/Python) |

### API

| Endpoint | Description |
|----------|-------------|
| `GET /api/graph` | Full graph (nodes + edges + stats) |
| `GET /api/graph/node/:id` | Node detail with connections |
| `GET /api/stats` | Project statistics |
| `GET /api/agent/events` | Agent activity events |
| `GET /api/agent/sessions` | Active agent sessions |
| `GET /api/git/stats` | Git stats (commits, branches, heatmap, co-changes) |
| `GET /api/git/log?limit=50` | Parsed git log with conventional commit types |
| `GET /api/git/branches` | Branch list |
| `GET /api/git/co-changes` | Temporal coupling analysis |

### WebSocket

| Event | Direction | Description |
|-------|-----------|-------------|
| `connected` | Server → Client | Initial connection |
| `graph:update` | Server → Client | Full graph after file change |
| `file:change` | Server → Client | Individual file change |

## Project Structure

```
stellaagent/
├── server/src/
│   ├── index.ts          # Express + WS server
│   ├── watcher.ts        # File system watcher
│   ├── ws.ts             # WebSocket broadcaster
│   ├── parser/           # Code parsers (TS/JS/Python)
│   ├── graph/            # Graph builder + force layout
│   └── agent/            # AI agent tracker
├── client/src/
│   ├── three/            # R3F 3D components
│   ├── ui/               # UI panels (sidebar, detail, git, agent)
│   ├── store/            # Zustand state
│   ├── hooks/            # Data fetching + WebSocket
│   ├── types/            # TypeScript types
│   └── utils/            # Colors, helpers
└── docs/                 # Architecture, decisions, use cases
```

## Development

```bash
npm run dev       # Start both server + client
npm run build     # Production build
npm run lint      # Type-check both packages
npm test          # Run server tests
```

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for detailed setup.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Read [VISION.md](VISION.md) first.

## Roadmap

See [ROADMAP.md](ROADMAP.md) for v0.1 → v1.0 evolution plan.

## License

MIT
