# Contributing to StellaAgent

> 시작하기 전에 [VISION.md](VISION.md)를 읽어주세요.

## Philosophy

StellaAgent는 Code Observatory다. 코드베이스를 살아있는 성좌로 관측하는 도구를 만들고 있다.

이 프로젝트에 기여한다는 것은 — 더 많은 것을 관측할 수 있게 만드는 것이다. 새 언어 파서는 더 많은 별을 밝히고, co-change 분석 개선은 더 정확한 은하수를 그리고, 에이전트 감지 강화는 더 선명한 유성 궤적을 만든다.

기능을 추가할 때, 항상 이 질문을 먼저: "이것이 사용자에게 무엇을 보이게 만드는가?"

## Documentation Style

문서를 작성하거나 수정할 때 다음을 지켜주세요:

- 이모티콘을 사용하지 않는다
- 친절하되 정중한 톤을 유지한다
- 기술 용어는 영어, 설명은 한국어/영어 자연스럽게 혼용
- 기존 문서의 톤과 스타일을 따른다

## Git Workflow

### Branch Strategy

```
main              항상 배포 가능한 상태
 └── feat/xxx     기능별 단기 브랜치 (1-3일 내 merge)
 └── fix/xxx      버그 수정
 └── docs/xxx     문서 변경
```

- **장기 브랜치 금지**. 오래 살수록 conflict 지옥.
- 브랜치 이름: `feat/starfield`, `fix/ws-reconnect`, `docs/api-reference`

### Conventional Commits (필수)

StellaAgent는 [Conventional Commits](https://www.conventionalcommits.org/) 규칙을 따릅니다. GitPanel UI에서 커밋 타입별 시각화를 제공하므로 일관성이 중요합니다.

```
feat: 새 기능 추가
fix: 버그 수정
refactor: 코드 구조 변경 (기능 동일)
docs: 문서 수정
chore: 빌드/설정 변경
test: 테스트 추가/수정
perf: 성능 개선
style: 포맷팅 (세미콜론, 공백 등)
ci: CI/CD 설정
build: 빌드 시스템
revert: 이전 커밋 되돌리기
```

### Scope (선택)

괄호 안에 범위를 지정:

```
feat(parser): add Go language support
fix(ws): handle reconnection on network drop
refactor(layout): switch to Barnes-Hut approximation
docs(api): document git stats endpoint
```

### Commit 습관

```bash
# 원자적(atomic) 커밋: 한 커밋 = 한 변경
git add -p                    # 파일 일부만 staging (hunk 단위)
git commit -m "feat(parser): extract class methods from Python"

# 절대 이렇게 하지 않기
git add . && git commit -m "여러가지 수정"
```

### 작업 흐름

```bash
# 1. 브랜치 생성
git checkout -b feat/go-parser

# 2. 작업 중 main이 변경되면 rebase
git fetch origin && git rebase origin/main

# 3. 완료 후 push
git push -u origin feat/go-parser

# 4. PR 생성
gh pr create --title "feat(parser): add Go language support"

# 5. Merge 후 정리
git checkout main && git pull && git branch -d feat/go-parser
```

### Rebase 활용

```bash
# feature 브랜치를 main 최신으로 유지
git rebase main              # merge commit 없이 깔끔한 히스토리

# 작업 중 커밋 정리 (squash)
git rebase -i HEAD~3         # 최근 3개 커밋을 1개로 합치기
```

### 유용한 고급 명령

```bash
git stash                    # 작업 임시 저장 (브랜치 전환 시)
git stash pop                # 저장한 작업 복원
git bisect start             # 버그 도입 커밋 이진 탐색
git reflog                   # "다 날렸다" → 여기서 복구 가능
git worktree add ../review   # 브랜치 전환 없이 동시 작업
git blame -w                 # 공백 무시하고 진짜 변경자 찾기
git log --oneline --graph    # 브랜치 그래프 시각화
```

## Code Style

- TypeScript strict mode
- No `any` types
- Prefer `const` over `let`
- Use meaningful names (no single-letter variables outside loops)

## PR Guidelines

- PR 제목은 conventional commit 형식
- 본문에 변경 이유와 테스트 방법 기술
- 스크린샷 첨부 (UI 변경 시)
- 자기 자신의 코드를 먼저 리뷰 후 제출

## Testing

```bash
npm test                     # 전체 테스트
npm run lint                 # 타입 체크
```

파서/그래프 관련 변경은 반드시 테스트 추가.
