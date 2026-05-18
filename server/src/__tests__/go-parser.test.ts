import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseGoFile } from '../parser/go-parser.js';

let tmpDir: string;

function writeTmpFile(name: string, content: string): string {
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stella-go-test-'));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('parseGoFile - imports', () => {
  it('parses single import', () => {
    const file = writeTmpFile('imp1.go', `package main\n\nimport "fmt"\n`);
    const result = parseGoFile(file, 'imp1.go');
    expect(result.imports).toHaveLength(1);
    expect(result.imports[0].source).toBe('fmt');
    expect(result.imports[0].specifiers).toEqual(['fmt']);
    expect(result.imports[0].isDefault).toBe(true);
  });

  it('parses single import with path', () => {
    const file = writeTmpFile('imp2.go', `package main\n\nimport "net/http"\n`);
    const result = parseGoFile(file, 'imp2.go');
    expect(result.imports).toHaveLength(1);
    expect(result.imports[0].source).toBe('net/http');
    expect(result.imports[0].specifiers).toEqual(['http']);
  });

  it('parses grouped imports', () => {
    const content = `package main\n\nimport (\n\t"fmt"\n\t"os"\n\t"net/http"\n)\n`;
    const file = writeTmpFile('imp3.go', content);
    const result = parseGoFile(file, 'imp3.go');
    expect(result.imports).toHaveLength(3);
    expect(result.imports[0].source).toBe('fmt');
    expect(result.imports[1].source).toBe('os');
    expect(result.imports[2].source).toBe('net/http');
    expect(result.imports[2].specifiers).toEqual(['http']);
  });

  it('parses aliased import', () => {
    const file = writeTmpFile('imp4.go', `package main\n\nimport myfmt "fmt"\n`);
    const result = parseGoFile(file, 'imp4.go');
    expect(result.imports).toHaveLength(1);
    expect(result.imports[0].source).toBe('fmt');
    expect(result.imports[0].specifiers).toEqual(['myfmt']);
    expect(result.imports[0].isDefault).toBe(false);
  });

  it('parses aliased import in block', () => {
    const content = `package main\n\nimport (\n\tmyfmt "fmt"\n\t. "testing"\n)\n`;
    const file = writeTmpFile('imp5.go', content);
    const result = parseGoFile(file, 'imp5.go');
    expect(result.imports).toHaveLength(2);
    expect(result.imports[0].specifiers).toEqual(['myfmt']);
    expect(result.imports[1].isNamespace).toBe(true);
  });
});

describe('parseGoFile - functions', () => {
  it('detects exported function', () => {
    const file = writeTmpFile('func1.go', `package main\n\nfunc Hello() {\n}\n`);
    const result = parseGoFile(file, 'func1.go');
    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0].name).toBe('Hello');
    expect(result.symbols[0].kind).toBe('function');
    expect(result.symbols[0].exported).toBe(true);
  });

  it('detects unexported function', () => {
    const file = writeTmpFile('func2.go', `package main\n\nfunc hello() {\n}\n`);
    const result = parseGoFile(file, 'func2.go');
    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0].name).toBe('hello');
    expect(result.symbols[0].exported).toBe(false);
  });

  it('detects main function', () => {
    const file = writeTmpFile('func3.go', `package main\n\nfunc main() {\n}\n`);
    const result = parseGoFile(file, 'func3.go');
    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0].name).toBe('main');
    expect(result.symbols[0].kind).toBe('function');
  });
});

describe('parseGoFile - methods', () => {
  it('detects method with value receiver', () => {
    const content = `package main\n\nfunc (s Server) Start() {\n}\n`;
    const file = writeTmpFile('meth1.go', content);
    const result = parseGoFile(file, 'meth1.go');
    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0].name).toBe('Start');
    expect(result.symbols[0].kind).toBe('method');
    expect(result.symbols[0].exported).toBe(true);
  });

  it('detects method with pointer receiver', () => {
    const content = `package main\n\nfunc (s *Server) Stop() {\n}\n`;
    const file = writeTmpFile('meth2.go', content);
    const result = parseGoFile(file, 'meth2.go');
    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0].name).toBe('Stop');
    expect(result.symbols[0].kind).toBe('method');
  });

  it('detects unexported method', () => {
    const content = `package main\n\nfunc (s *Server) listen() {\n}\n`;
    const file = writeTmpFile('meth3.go', content);
    const result = parseGoFile(file, 'meth3.go');
    expect(result.symbols[0].exported).toBe(false);
  });
});

describe('parseGoFile - structs and interfaces', () => {
  it('detects struct', () => {
    const content = `package main\n\ntype Server struct {\n\tPort int\n}\n`;
    const file = writeTmpFile('struct1.go', content);
    const result = parseGoFile(file, 'struct1.go');
    const structs = result.symbols.filter(s => s.kind === 'class');
    expect(structs).toHaveLength(1);
    expect(structs[0].name).toBe('Server');
    expect(structs[0].exported).toBe(true);
  });

  it('detects unexported struct', () => {
    const content = `package main\n\ntype config struct {\n\tport int\n}\n`;
    const file = writeTmpFile('struct2.go', content);
    const result = parseGoFile(file, 'struct2.go');
    const structs = result.symbols.filter(s => s.kind === 'class');
    expect(structs).toHaveLength(1);
    expect(structs[0].name).toBe('config');
    expect(structs[0].exported).toBe(false);
  });

  it('detects interface', () => {
    const content = `package main\n\ntype Reader interface {\n\tRead(p []byte) (n int, err error)\n}\n`;
    const file = writeTmpFile('iface1.go', content);
    const result = parseGoFile(file, 'iface1.go');
    const ifaces = result.symbols.filter(s => s.kind === 'interface');
    expect(ifaces).toHaveLength(1);
    expect(ifaces[0].name).toBe('Reader');
    expect(ifaces[0].exported).toBe(true);
  });
});

describe('parseGoFile - variables and constants', () => {
  it('detects exported var', () => {
    const content = `package main\n\nvar DefaultPort int = 8080\n`;
    const file = writeTmpFile('var1.go', content);
    const result = parseGoFile(file, 'var1.go');
    const vars = result.symbols.filter(s => s.kind === 'variable');
    expect(vars).toHaveLength(1);
    expect(vars[0].name).toBe('DefaultPort');
  });

  it('detects exported const', () => {
    const content = `package main\n\nconst MaxRetries = 3\n`;
    const file = writeTmpFile('const1.go', content);
    const result = parseGoFile(file, 'const1.go');
    const vars = result.symbols.filter(s => s.kind === 'variable');
    expect(vars).toHaveLength(1);
    expect(vars[0].name).toBe('MaxRetries');
  });

  it('skips unexported var', () => {
    const content = `package main\n\nvar defaultPort = 8080\n`;
    const file = writeTmpFile('var2.go', content);
    const result = parseGoFile(file, 'var2.go');
    const vars = result.symbols.filter(s => s.kind === 'variable');
    expect(vars).toHaveLength(0);
  });
});

describe('parseGoFile - metadata', () => {
  it('reports go as language', () => {
    const file = writeTmpFile('meta.go', `package main\n`);
    const result = parseGoFile(file, 'meta.go');
    expect(result.language).toBe('go');
  });

  it('counts lines', () => {
    const content = `package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("hi")\n}\n`;
    const file = writeTmpFile('lines.go', content);
    const result = parseGoFile(file, 'lines.go');
    expect(result.lineCount).toBe(8);
  });

  it('reports size', () => {
    const content = `package main\n`;
    const file = writeTmpFile('size.go', content);
    const result = parseGoFile(file, 'size.go');
    expect(result.size).toBe(content.length);
  });
});

describe('parseGoFile - comments', () => {
  it('skips comment lines', () => {
    const content = `package main\n\n// Hello prints a greeting\nfunc Hello() {\n}\n`;
    const file = writeTmpFile('comment.go', content);
    const result = parseGoFile(file, 'comment.go');
    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0].name).toBe('Hello');
  });
});

describe('parseGoFile - error handling', () => {
  it('returns empty result for non-existent file', () => {
    const result = parseGoFile('/nonexistent/file.go', 'file.go');
    expect(result.symbols).toEqual([]);
    expect(result.imports).toEqual([]);
    expect(result.lineCount).toBe(0);
  });
});

describe('parseGoFile - complex file', () => {
  it('parses a realistic Go file', () => {
    const content = `package server

import (
\t"context"
\t"fmt"
\t"net/http"

\t"github.com/gorilla/mux"
)

// Server handles HTTP requests.
type Server struct {
\trouter *mux.Router
\tport   int
}

// NewServer creates a new Server instance.
func NewServer(port int) *Server {
\treturn &Server{port: port}
}

func (s *Server) Start(ctx context.Context) error {
\treturn http.ListenAndServe(fmt.Sprintf(":%d", s.port), s.router)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
\tw.WriteHeader(http.StatusOK)
}

type Handler interface {
\tServeHTTP(w http.ResponseWriter, r *http.Request)
}

var DefaultTimeout = 30

const MaxConnections = 100
`;
    const file = writeTmpFile('complex.go', content);
    const result = parseGoFile(file, 'complex.go');

    // Imports: context, fmt, net/http, github.com/gorilla/mux
    expect(result.imports).toHaveLength(4);
    expect(result.imports[3].source).toBe('github.com/gorilla/mux');
    expect(result.imports[3].specifiers).toEqual(['mux']);

    // Symbols
    const structs = result.symbols.filter(s => s.kind === 'class');
    expect(structs).toHaveLength(1);
    expect(structs[0].name).toBe('Server');

    const funcs = result.symbols.filter(s => s.kind === 'function');
    expect(funcs).toHaveLength(1);
    expect(funcs[0].name).toBe('NewServer');

    const methods = result.symbols.filter(s => s.kind === 'method');
    expect(methods).toHaveLength(2);
    expect(methods[0].name).toBe('Start');
    expect(methods[1].name).toBe('handleHealth');
    expect(methods[1].exported).toBe(false);

    const ifaces = result.symbols.filter(s => s.kind === 'interface');
    expect(ifaces).toHaveLength(1);
    expect(ifaces[0].name).toBe('Handler');

    const vars = result.symbols.filter(s => s.kind === 'variable');
    expect(vars).toHaveLength(2);

    expect(result.language).toBe('go');
  });
});
