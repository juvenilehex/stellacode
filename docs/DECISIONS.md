# Technical Decisions

> StellaAgent의 기술적 결정과 그 근거. "왜 이렇게 했는가."

## Why Not Electron?

Server + Browser gives the same filesystem access with less complexity. Express serves the API, browser renders 3D. Electron can wrap this later if needed.

## Why Not tree-sitter?

tree-sitter requires node-gyp native compilation which is problematic on Windows. Regex-based parsing is sufficient for extracting functions, classes, and imports. TypeScript Compiler API can be added later for deeper TS analysis.

## Why Regex Parsers Over AST?

- Zero native dependencies (Windows-safe)
- Fast enough for project scanning (<50ms for ~100 files)
- Captures the 80% case: function/class declarations, imports
- Can be upgraded to TS Compiler API incrementally

## Why Force-Directed Layout?

- Naturally clusters related files (many import edges = close together)
- 3D space handles larger graphs better than 2D
- Golden ratio initialization provides aesthetically pleasing starting positions
- 80 iterations balances quality vs. speed

## Why Zustand Over Redux?

- R3F ecosystem standard (drei, pmndrs)
- Minimal boilerplate, works with React 19
- External access via `getState()` for Three.js callbacks

## Why Tailwind 4?

- CSS-first approach with @import "tailwindcss"
- No config file needed for most use cases
- CSS-first approach aligns with modern frontend conventions

## Why Conventional Commits?

- Machine-parseable commit history enables automatic visualization
- GitPanel can color-code and categorize commits without AI
- Common standard that most developers already know
- Enables future features: auto-changelog, semantic versioning

## Why Co-Change Analysis?

Import analysis only shows declared dependencies. Co-change analysis (temporal coupling from git history) reveals *implicit* dependencies:
- Files that always change together but don't import each other → missing abstraction
- Config + code coupling → shotgun surgery pattern
- Test + implementation coupling → expected and healthy

This is one of the most actionable insights a codebase visualizer can provide, and it comes "free" from git history.

## Why Git as First-Class Data Source?

바이브코딩 시대에 "누가 뭘 했는지"가 아니라 "코드가 어떻게 진화하는지"가 핵심. Git history provides:
- **Temporal dimension**: static analysis only shows current state; git shows evolution
- **Agent attribution**: which parts were AI-generated vs human-written
- **Change patterns**: hot spots, coupling, refactoring opportunities
- **Zero setup**: every project already has git history

## Why "Code Observatory" as Category?

기존 카테고리에 정확히 맞지 않는다:

- **Code Visualizer**: 시각화만 한다. StellaAgent는 시간 분석(git)과 에이전트 추적을 포함한다.
- **Static Analyzer**: 현재 상태만 본다. StellaAgent는 코드의 진화를 관측한다.
- **Observability Tool**: 런타임 모니터링이다. StellaAgent는 코드 구조 자체를 관측한다.

StellaAgent는 정적 분석 + 시간 분석 + 실시간 관측 + AI 인식을 결합한다. 이 조합은 기존 카테고리로 설명되지 않으므로, "Code Observatory"라는 새 카테고리를 정의했다.

천문대(Observatory)라는 메타포를 선택한 이유:
- 천문대는 **관측**한다. 분석만 하지 않는다. 관측은 패턴 발견을 포함한다.
- 천문대는 **시간 축**을 다룬다. 천체의 움직임, 궤도, 변화.
- 코드베이스는 우주와 닮았다. 너무 크고, 끊임없이 변하고, 한 사람이 전부 이해할 수 없다.

## Why the Star/Constellation Metaphor?

파일을 "노드"라 부르면 그래프 이론이 된다. 파일을 "별"이라 부르면 관측이 된다.

메타포가 사용자의 관점을 바꾼다:
- "이 노드의 degree가 높다" vs "이 별에 많은 성좌선이 연결되어 있다"
- "temporal coupling edge" vs "은하수 (co-change)"
- "agent commit marker" vs "유성 (trail)"

기술적 정확성을 유지하면서, 탐색하고 싶게 만드는 언어를 선택했다. Observatory의 메타포는 기능 명명에도 일관되게 적용된다 (Star, Constellation Line, Trail, Pulse, Deep Space).

## Documentation Style

프로젝트 문서 전반에 적용되는 스타일 규칙:

- **이모티콘 사용 금지**. 문서 전체에서 이모티콘을 사용하지 않는다. 전문적인 톤을 유지한다.
- **친절하되 정중하게**. 캐주얼하지도, 딱딱하지도 않은 톤.
- **한국어/영어 자연스럽게 혼용**. 기술 용어는 영어, 설명은 한국어.
- **코드 예시 중심**. 마케팅 카피 배제.
- **"왜"를 항상 먼저**. 기능 나열보다 이유와 맥락이 우선한다.
- **모든 문서의 스타일이 동일**. 하나를 읽으면 나머지도 같은 톤이어야 한다.
