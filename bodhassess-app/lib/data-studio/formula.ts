// Client-side evaluator for the Data Studio formula language. It mirrors the
// backend grammar in ExpressionService.java EXACTLY (same operators, same
// functions, same precedence) so a CLIENT-classified column computes in the
// browser identically to how the server validates it. Only row-local math
// runs here; population/cohort functions are SERVER-classified and evaluated
// by the backend (Phase 2), never by this evaluator.

export type FormulaValue = number | string | boolean | null;

/** Resolve a referenced column key to its raw cell value for one row. */
export type RowLookup = (columnKey: string) => unknown;

// Row-local functions supported client-side. Names match the backend whitelist.
const CLIENT_FUNCS = new Set([
  'IF', 'AND', 'OR', 'NOT', 'MIN', 'MAX', 'ROUND', 'ABS', 'SQRT', 'LOG',
]);

class FormulaError extends Error {}

/* ---------------- lexer ---------------- */

type Tok =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'ident'; v: string }
  | { k: 'op'; v: string }
  | { k: '('; v: '(' }
  | { k: ')'; v: ')' }
  | { k: ','; v: ',' }
  | { k: 'eof'; v: '' };

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const isIdentStart = (c: string) => /[A-Za-z_]/.test(c);
  const isIdentPart = (c: string) => /[A-Za-z0-9_:]/.test(c);
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(') { out.push({ k: '(', v: '(' }); i++; continue; }
    if (c === ')') { out.push({ k: ')', v: ')' }); i++; continue; }
    if (c === ',') { out.push({ k: ',', v: ',' }); i++; continue; }
    if (c === '"' || c === "'") {
      const quote = c; i++;
      let s = '';
      while (i < src.length && src[i] !== quote) { s += src[i]; i++; }
      if (i >= src.length) throw new FormulaError('Unterminated string.');
      i++;
      out.push({ k: 'str', v: s });
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let n = ''; let dot = false;
      while (i < src.length) {
        const d = src[i];
        if (/[0-9]/.test(d)) { n += d; i++; }
        else if (d === '.' && !dot) { dot = true; n += d; i++; }
        else break;
      }
      out.push({ k: 'num', v: Number(n) });
      continue;
    }
    if (isIdentStart(c)) {
      let s = c; i++;
      while (i < src.length && isIdentPart(src[i])) { s += src[i]; i++; }
      out.push({ k: 'ident', v: s });
      continue;
    }
    // operators (two-char first)
    const two = src.slice(i, i + 2);
    if (['==', '!=', '<=', '>=', '<>'].includes(two)) { out.push({ k: 'op', v: two }); i += 2; continue; }
    if ('+-*/=<>'.includes(c)) { out.push({ k: 'op', v: c }); i++; continue; }
    throw new FormulaError(`Unexpected character '${c}'.`);
  }
  out.push({ k: 'eof', v: '' });
  return out;
}

/* ---------------- parser → evaluator (single pass, value-producing) ---------------- */

class Evaluator {
  private pos = 0;
  constructor(private toks: Tok[], private lookup: RowLookup) {}

  private peek(): Tok { return this.toks[this.pos]; }
  private next(): Tok { return this.toks[this.pos++]; }
  private isKw(t: Tok, kw: string): boolean { return t.k === 'ident' && t.v.toUpperCase() === kw; }

  run(): FormulaValue {
    const v = this.orExpr();
    if (this.peek().k !== 'eof') throw new FormulaError(`Unexpected '${this.peek().v}'.`);
    return v;
  }

  private orExpr(): FormulaValue {
    let v = this.andExpr();
    while (this.isKw(this.peek(), 'OR')) { this.next(); const r = this.andExpr(); v = truthy(v) || truthy(r); }
    return v;
  }

  private andExpr(): FormulaValue {
    let v = this.notExpr();
    while (this.isKw(this.peek(), 'AND')) { this.next(); const r = this.notExpr(); v = truthy(v) && truthy(r); }
    return v;
  }

  private notExpr(): FormulaValue {
    if (this.isKw(this.peek(), 'NOT')) { this.next(); return !truthy(this.notExpr()); }
    return this.comparison();
  }

  private comparison(): FormulaValue {
    const left = this.additive();
    const t = this.peek();
    if (t.k === 'op' && ['=', '==', '!=', '<>', '<', '<=', '>', '>='].includes(t.v)) {
      this.next();
      const right = this.additive();
      return compare(t.v, left, right);
    }
    return left;
  }

  private additive(): FormulaValue {
    let v = this.multiplicative();
    while (this.peek().k === 'op' && (this.peek().v === '+' || this.peek().v === '-')) {
      const op = this.next().v;
      const r = this.multiplicative();
      v = op === '+' ? num(v) + num(r) : num(v) - num(r);
    }
    return v;
  }

  private multiplicative(): FormulaValue {
    let v = this.unary();
    while (this.peek().k === 'op' && (this.peek().v === '*' || this.peek().v === '/')) {
      const op = this.next().v;
      const r = this.unary();
      v = op === '*' ? num(v) * num(r) : num(v) / num(r);
    }
    return v;
  }

  private unary(): FormulaValue {
    if (this.peek().k === 'op' && this.peek().v === '-') { this.next(); return -num(this.unary()); }
    if (this.peek().k === 'op' && this.peek().v === '+') { this.next(); return this.unary(); }
    return this.primary();
  }

  private primary(): FormulaValue {
    const t = this.peek();
    if (t.k === 'num') { this.next(); return t.v; }
    if (t.k === 'str') { this.next(); return t.v; }
    if (t.k === '(') { this.next(); const v = this.orExpr(); this.expect(')'); return v; }
    if (t.k === 'ident') {
      if (this.isKw(t, 'AND') || this.isKw(t, 'OR') || this.isKw(t, 'NOT') || this.isKw(t, 'BY')) {
        throw new FormulaError(`Unexpected keyword '${t.v}'.`);
      }
      this.next();
      if (this.peek().k === '(') return this.call(t.v);
      return coerce(this.lookup(t.v));
    }
    throw new FormulaError(`Unexpected '${t.v}'.`);
  }

  private call(rawName: string): FormulaValue {
    const name = rawName.toUpperCase();
    if (!CLIENT_FUNCS.has(name)) {
      // SERVER functions are valid grammar but not evaluable client-side.
      throw new FormulaError(`${rawName}() is computed on the server.`);
    }
    this.expect('(');
    const args: FormulaValue[] = [];
    if (this.peek().k !== ')') {
      args.push(this.orExpr());
      while (this.peek().k === ',') { this.next(); args.push(this.orExpr()); }
    }
    this.expect(')');
    return applyFunction(name, args);
  }

  private expect(k: Tok['k']): void {
    if (this.peek().k !== k) throw new FormulaError(`Expected '${k}'.`);
    this.next();
  }
}

/* ---------------- runtime helpers ---------------- */

function coerce(raw: unknown): FormulaValue {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number' || typeof raw === 'boolean') return raw;
  const s = String(raw);
  const n = Number(s);
  return s.trim() !== '' && Number.isFinite(n) ? n : s;
}

function num(v: FormulaValue): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === null) return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function truthy(v: FormulaValue): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v);
  if (v === null) return false;
  return String(v).length > 0;
}

function compare(op: string, a: FormulaValue, b: FormulaValue): boolean {
  const an = num(a), bn = num(b);
  const numeric = !Number.isNaN(an) && !Number.isNaN(bn);
  const eq = numeric ? an === bn : String(a ?? '') === String(b ?? '');
  switch (op) {
    case '=': case '==': return eq;
    case '!=': case '<>': return !eq;
    case '<': return numeric ? an < bn : String(a ?? '') < String(b ?? '');
    case '<=': return numeric ? an <= bn : String(a ?? '') <= String(b ?? '');
    case '>': return numeric ? an > bn : String(a ?? '') > String(b ?? '');
    case '>=': return numeric ? an >= bn : String(a ?? '') >= String(b ?? '');
    default: return false;
  }
}

function applyFunction(name: string, args: FormulaValue[]): FormulaValue {
  switch (name) {
    case 'IF': return truthy(args[0]) ? args[1] ?? null : args[2] ?? null;
    case 'AND': return args.every(truthy);
    case 'OR': return args.some(truthy);
    case 'NOT': return !truthy(args[0]);
    case 'MIN': return reduceNums(args, Math.min);
    case 'MAX': return reduceNums(args, Math.max);
    case 'ABS': return safe(Math.abs(num(args[0])));
    case 'SQRT': return safe(Math.sqrt(num(args[0])));
    case 'LOG': {
      const base = args[1] != null ? num(args[1]) : 10;
      return safe(Math.log(num(args[0])) / Math.log(base));
    }
    case 'ROUND': {
      const digits = args[1] != null ? Math.trunc(num(args[1])) : 0;
      const f = Math.pow(10, digits);
      return safe(Math.round(num(args[0]) * f) / f);
    }
    default: throw new FormulaError(`Unsupported function ${name}().`);
  }
}

function reduceNums(args: FormulaValue[], fn: (...n: number[]) => number): FormulaValue {
  const nums = args.map(num).filter((n) => !Number.isNaN(n));
  return nums.length ? safe(fn(...nums)) : null;
}

function safe(n: number): FormulaValue {
  return Number.isFinite(n) ? n : null;
}

/**
 * Evaluate a CLIENT formula for one row. Returns null on any error (the cell
 * renders blank) so a bad formula never crashes the grid.
 */
export function evaluateFormula(expr: string, lookup: RowLookup): FormulaValue {
  try {
    return new Evaluator(lex(expr), lookup).run();
  } catch {
    return null;
  }
}
