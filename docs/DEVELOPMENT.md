# Development Guide

## Setup

```bash
npm install          # Install all workspace dependencies
npm run dev          # Start server (port 3001) + client (port 5173)
```

## Targeting a Project

```bash
# Via environment variable
STELLA_TARGET=/path/to/project npm run dev

# Via server args directly
cd server && npx tsx src/index.ts --target /path/to/project
```

## Git Workflow

이 프로젝트는 conventional commits + short-lived branches 전략을 따릅니다. 상세 가이드: [CONTRIBUTING.md](../CONTRIBUTING.md)

### Quick Reference

```bash
# 브랜치 생성 → 작업 → rebase → push → PR → 정리
git checkout -b feat/new-parser
# ... 작업 ...
git add -p                                    # hunk 단위 staging
git commit -m "feat(parser): add Rust support"
git fetch origin && git rebase origin/main    # 깔끔한 히스토리
git push -u origin feat/new-parser
gh pr create
# merge 후
git checkout main && git pull && git branch -d feat/new-parser
```

### Commit Types

| Type | 용도 | 예시 |
|------|------|------|
| `feat` | 새 기능 | `feat(parser): extract Python decorators` |
| `fix` | 버그 수정 | `fix(ws): reconnect on network drop` |
| `refactor` | 구조 변경 | `refactor(layout): Barnes-Hut approximation` |
| `docs` | 문서 | `docs(api): add git endpoints` |
| `chore` | 설정/빌드 | `chore: update dependencies` |
| `test` | 테스트 | `test(parser): add edge cases` |
| `perf` | 성능 | `perf(layout): instanced rendering` |

### Git Features in StellaAgent

StellaAgent 자체가 git 히스토리를 분석합니다:

- **Conventional commit parsing**: 커밋 타입별 색상 분류 및 통계
- **Co-change detection**: 자주 함께 변경되는 파일 쌍 (temporal coupling)
- **Hot files**: 가장 자주 변경되는 파일 순위
- **Activity heatmap**: 30일간 커밋 활동 시각화
- **Agent detection**: AI 에이전트 (Claude, Copilot, Cursor) 커밋 식별

### Git API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/git/stats` | 전체 git 통계 (commits, branches, heatmap) |
| `GET /api/git/log?limit=50` | 커밋 로그 (conventional commit 파싱 포함) |
| `GET /api/git/branches` | 브랜치 목록 |
| `GET /api/git/co-changes` | 파일 co-change 분석 |

## Adding a New Language Parser

1. Create `server/src/parser/<lang>-parser.ts`
2. Export a `parse<Lang>File(absolutePath, relativePath): ParsedFile` function
3. Add the extension to `SUPPORTED_EXTENSIONS` in `scanner.ts`
4. Register in `parser/index.ts` `parseFile()` switch

## Adding New Node Types

1. Add type to `GraphNode.type` union in `server/src/graph/types.ts`
2. Add color to `client/src/utils/colors.ts`
3. Add geometry variant in `ConstellationNode.tsx`
4. Update `Legend.tsx`

## Workspace Structure

```bash
npm run dev -w server   # Server only
npm run dev -w client   # Client only (needs server running)
npm run build           # Build both for production
npm run lint            # Type-check both packages
npm test                # Run server tests
```

## Useful Dev Commands

```bash
# 어떤 프로젝트든 타겟 가능
STELLA_TARGET=../my-project npm run dev

# 자기 자신을 시각화 (dogfooding)
STELLA_TARGET=./ npm run dev

# 서버만 빠르게 테스트
cd server && npx tsx src/index.ts --target ../some-project
```
