import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parsePythonFile } from '../parser/python-parser.js';

let tmpDir: string;

function writeTmpFile(name: string, content: string): string {
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stella-py-test-'));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('parsePythonFile - imports', () => {
  it('parses from X import Y', () => {
    const file = writeTmpFile('imp1.py', `from os import path\n`);
    const result = parsePythonFile(file, 'imp1.py');
    expect(result.imports).toHaveLength(1);
    expect(result.imports[0].source).toBe('os');
    expect(result.imports[0].specifiers).toEqual(['path']);
  });

  it('parses from X import multiple', () => {
    const file = writeTmpFile('imp2.py', `from typing import List, Dict, Optional\n`);
    const result = parsePythonFile(file, 'imp2.py');
    expect(result.imports).toHaveLength(1);
    expect(result.imports[0].specifiers).toEqual(['List', 'Dict', 'Optional']);
  });

  it('parses import X', () => {
    const file = writeTmpFile('imp3.py', `import json\n`);
    const result = parsePythonFile(file, 'imp3.py');
    expect(result.imports).toHaveLength(1);
    expect(result.imports[0].source).toBe('json');
    expect(result.imports[0].isDefault).toBe(true);
  });

  it('parses import X as Y (aliased)', () => {
    const file = writeTmpFile('imp4.py', `import numpy as np\n`);
    const result = parsePythonFile(file, 'imp4.py');
    expect(result.imports).toHaveLength(1);
    expect(result.imports[0].source).toBe('numpy');
  });

  it('parses from X import Y as Z', () => {
    const file = writeTmpFile('imp5.py', `from collections import OrderedDict as OD\n`);
    const result = parsePythonFile(file, 'imp5.py');
    expect(result.imports[0].specifiers).toEqual(['OD']);
  });

  it('parses relative imports', () => {
    const file = writeTmpFile('imp6.py', `from .utils import helper\n`);
    const result = parsePythonFile(file, 'imp6.py');
    expect(result.imports[0].source).toBe('.utils');
    expect(result.imports[0].specifiers).toEqual(['helper']);
  });
});

describe('parsePythonFile - symbols', () => {
  it('detects top-level functions', () => {
    const file = writeTmpFile('func.py', `def hello():\n    pass\n`);
    const result = parsePythonFile(file, 'func.py');
    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0].name).toBe('hello');
    expect(result.symbols[0].kind).toBe('function');
    expect(result.symbols[0].exported).toBe(true);
  });

  it('detects async functions', () => {
    const file = writeTmpFile('afunc.py', `async def fetch_data():\n    pass\n`);
    const result = parsePythonFile(file, 'afunc.py');
    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0].name).toBe('fetch_data');
    expect(result.symbols[0].kind).toBe('function');
  });

  it('detects classes', () => {
    const file = writeTmpFile('cls.py', `class MyService:\n    pass\n`);
    const result = parsePythonFile(file, 'cls.py');
    const classes = result.symbols.filter(s => s.kind === 'class');
    expect(classes).toHaveLength(1);
    expect(classes[0].name).toBe('MyService');
  });

  it('detects methods inside classes', () => {
    const content = `class Foo:\n    def bar(self):\n        pass\n    def baz(self):\n        pass\n`;
    const file = writeTmpFile('methods.py', content);
    const result = parsePythonFile(file, 'methods.py');
    const methods = result.symbols.filter(s => s.kind === 'method');
    expect(methods).toHaveLength(2);
    expect(methods.map(m => m.name)).toEqual(['bar', 'baz']);
  });

  it('skips private functions (underscore prefix)', () => {
    const content = `def public_func():\n    pass\ndef _private_func():\n    pass\n`;
    const file = writeTmpFile('private.py', content);
    const result = parsePythonFile(file, 'private.py');
    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0].name).toBe('public_func');
  });

  it('includes __init__ despite underscore prefix', () => {
    const content = `class Foo:\n    def __init__(self):\n        pass\n    def __str__(self):\n        pass\n`;
    const file = writeTmpFile('init.py', content);
    const result = parsePythonFile(file, 'init.py');
    const methods = result.symbols.filter(s => s.kind === 'method');
    // __init__ is included, __str__ is not (starts with _ but isn't __init__)
    expect(methods.map(m => m.name)).toContain('__init__');
  });

  it('detects top-level UPPERCASE constants', () => {
    const content = `MAX_SIZE = 100\nDEFAULT_NAME = "foo"\nlowercase_var = 1\n`;
    const file = writeTmpFile('consts.py', content);
    const result = parsePythonFile(file, 'consts.py');
    const vars = result.symbols.filter(s => s.kind === 'variable');
    expect(vars).toHaveLength(2);
    expect(vars.map(v => v.name)).toEqual(['MAX_SIZE', 'DEFAULT_NAME']);
  });

  it('does not detect indented variables as top-level', () => {
    const content = `class Foo:\n    MAX = 10\n`;
    const file = writeTmpFile('indent.py', content);
    const result = parsePythonFile(file, 'indent.py');
    const vars = result.symbols.filter(s => s.kind === 'variable');
    expect(vars).toHaveLength(0);
  });
});

describe('parsePythonFile - metadata', () => {
  it('always reports python as language', () => {
    const file = writeTmpFile('meta.py', `x = 1\n`);
    const result = parsePythonFile(file, 'meta.py');
    expect(result.language).toBe('python');
  });

  it('counts lines', () => {
    const content = `a = 1\nb = 2\nc = 3\n`;
    const file = writeTmpFile('lines.py', content);
    const result = parsePythonFile(file, 'lines.py');
    expect(result.lineCount).toBe(4);
  });

  it('reports size', () => {
    const content = `x = 42\n`;
    const file = writeTmpFile('size.py', content);
    const result = parsePythonFile(file, 'size.py');
    expect(result.size).toBe(content.length);
  });
});

describe('parsePythonFile - comments', () => {
  it('skips comment lines', () => {
    const content = `# This is a comment\ndef real():\n    pass\n`;
    const file = writeTmpFile('comment.py', content);
    const result = parsePythonFile(file, 'comment.py');
    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0].name).toBe('real');
  });

  it('skips empty lines', () => {
    const content = `\n\ndef hello():\n    pass\n\n`;
    const file = writeTmpFile('empty.py', content);
    const result = parsePythonFile(file, 'empty.py');
    expect(result.symbols).toHaveLength(1);
  });
});

describe('parsePythonFile - error handling', () => {
  it('returns empty result for non-existent file', () => {
    const result = parsePythonFile('/nonexistent/file.py', 'file.py');
    expect(result.symbols).toEqual([]);
    expect(result.imports).toEqual([]);
    expect(result.lineCount).toBe(0);
  });
});
