# Architecture

> Code Observatory의 내부 구조. 코드 우주를 어떻게 관측하는가.
>
> 프로젝트 철학은 [VISION.md](../VISION.md)를 참조.

## System Overview

StellaAgent는 두 개의 workspace로 구성된 monorepo다:

1. **server** — Express HTTP + WebSocket 서버. 대상 코드베이스를 스캔하고, 파싱하고, 그래프를 구축한다.
2. **client** — React + React Three Fiber 앱. 그래프를 3D 성좌(constellation)로 렌더링한다.

## Data Flow

```
Target Directory
      │
      ▼
  Scanner (scanner.ts)
  ├── Walks directory tree
  ├── Filters by extension (.ts/.js/.py)
  └── Ignores node_modules, .git, dist
      │
      ▼
  Parser (ts-parser.ts / python-parser.ts)
  ├── Extracts: functions, classes, interfaces, imports
  └── Produces: ParsedFile[]
      │
      ▼
  Graph Builder (builder.ts)
  ├── Creates directory + file nodes
  ├── Resolves import edges
  ├── Adds co-change edges from git history
  └── Produces: nodes[] + edges[]
      │
      ▼
  Force Layout (layout.ts)
  ├── Golden ratio spiral initialization
  ├── 80-iteration force simulation
  ├── Repulsion between all nodes
  └── Attraction along edges (strength-weighted)
      │
      ▼
  REST API (GET /api/graph) ──→ Client fetch
  WebSocket ──→ Real-time updates
```

## Force Layout Algorithm

Adapted from the STELLA web_dashboard.py force simulation:

1. **Initialization**: Nodes placed on a golden ratio spiral sphere
2. **Repulsion**: O(n^2) all-pairs repulsion (fine for <500 nodes)
3. **Attraction**: Edge-weighted attraction (stronger edges = closer nodes)
4. **Damping**: 0.85 velocity damping per iteration
5. **Cooling**: Linear alpha decay over 80 iterations

## Color System — 성좌의 색

Observatory 테마 팔레트. 각 색이 코드 우주에서 무엇을 의미하는지:

| Color | Hex | Metaphor | Meaning |
|-------|-----|----------|---------|
| Purple | #C7A4FF | Diamond (디렉토리) | 별들을 묶는 구조 |
| Blue | #89C4F4 | TypeScript Star | TypeScript 파일 |
| Yellow | #FFD866 | JavaScript Star | JavaScript 파일 |
| Teal | #7EDCCC | Python Star / Co-change | Python 파일, 또는 숨겨진 의존성 선 |
| Pink | #FF8EC8 | Constellation Line | import 관계 (선언된 의존성) |
| Deep Blue | #08061A | Deep Space | 배경. 코드 우주의 빈 공간 |

## Real-time Updates

1. chokidar watches the target directory for file changes
2. Changes trigger debounced graph rebuild (500ms)
3. Updated graph is broadcast via WebSocket
4. Client Zustand store updates reactively

## Git Intelligence Layer

StellaAgent treats git history as a first-class data source.

### Conventional Commit Parsing

```
"feat(parser): add Go support" → { type: "feat", scope: "parser", subject: "add Go support" }
"fixed stuff"                  → { type: "other", subject: "fixed stuff" }
```

The regex `^(\w+)(?:\(([^)]+)\))?!?:\s*(.+)$` parses type, scope, and subject. Valid types: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`, `style`, `perf`, `ci`, `build`, `revert`.

### Co-Change Analysis (Temporal Coupling)

Co-change = files that frequently appear in the same commits. This reveals hidden dependencies that import analysis misses.

```
For each commit:
  For each file pair (A, B) in the commit:
    pairCount[A,B]++
    fileCount[A]++, fileCount[B]++

coupling(A,B) = pairCount[A,B] / max(fileCount[A], fileCount[B])
```

High coupling (>50%) between unrelated files suggests:
- Missing abstraction (extract shared logic)
- Shotgun surgery (change spreads across files)
- Implicit dependency (not visible in imports)

Co-change edges appear as **teal lines** in the constellation, distinct from pink import edges.

### AI Agent Detection — Trail 추적

Git 메타데이터 기반 휴리스틱 감지. 6개 에이전트를 추적한다:

| Agent | Detection Pattern |
|-------|------------------|
| Claude Code | author name `claude`, `.claude/` 디렉토리 활동 |
| GitHub Copilot | author name `copilot`, Co-Authored-By 트레일러 |
| Cursor | author name `cursor` |
| Aider | author name `aider` |
| Codeium | author name `codeium` |
| Tabnine | author name `tabnine` |

감지 방법:
1. **Author name**: 커밋 author에서 에이전트 패턴 매칭
2. **Co-Authored-By**: 커밋 메시지 트레일러 파싱
3. 감지된 에이전트 커밋은 GitPanel에서 별도 시각 처리 (Trail)

### Hot File Detection

Files ranked by change frequency across the git history. High-change files are likely:
- Core modules (expected)
- Problem spots (if combined with fix commits)
- Configuration files (normal)

## Agent Tracking — 에이전트 관측

- `.claude/` 디렉토리 감시로 Claude Code 세션 감지
- Git log 파싱으로 6개 AI 에이전트 커밋 감지 (Claude, Copilot, Cursor, Aider, Codeium, Tabnine)
- File watcher 이벤트에 에이전트 활동 태깅
- 시각: 최근 수정된 노드에 glowing trail (유성 효과)
