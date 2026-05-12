# Changelog

All notable changes to StellaCode will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
