# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 1.3.x   | Yes                |
| < 1.3   | No                 |

## Reporting a Vulnerability

If you discover a security vulnerability in StellaCode, please report it responsibly.

**Do NOT open a public issue.**

Instead, email **juvenilehex@gmail.com** with:

- A description of the vulnerability
- Steps to reproduce
- Potential impact assessment
- Suggested fix (if any)

You will receive an acknowledgment within 48 hours. We aim to release a patch within 7 days for critical issues.

## Security Model

StellaCode is designed as a **local development tool** running on `127.0.0.1`. It is not intended for public-facing deployment.

### Current Security Measures

- **CORS**: Strict origin allowlist (localhost only by default)
- **CSP**: Content Security Policy headers on all responses
- **Rate Limiting**: 120 requests/minute per IP on API endpoints
- **Input Validation**: Path traversal protection, null byte rejection, blocked system directories
- **WebSocket**: Origin validation, connection limits (20 max), message size limits (1MB)
- **No Authentication**: By design, as StellaCode binds to localhost only

### Known Limitations

- No authentication layer (acceptable for localhost-only tool)
- `unsafe-eval` required in CSP for Three.js GLSL shader compilation
- Rate limiter is in-memory (resets on server restart)

## Scope

The following are **in scope** for security reports:

- Path traversal or directory escape in `/api/target`
- Arbitrary code execution via parsed files
- Denial of service via crafted input
- Information disclosure beyond the target directory
- WebSocket hijacking or injection

The following are **out of scope**:

- Issues requiring physical access to the machine
- Social engineering attacks
- Vulnerabilities in dependencies (report upstream; we monitor via Dependabot)
