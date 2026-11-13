/**
 * --------------------------------------------------------------------
 * Safe sandboxed expression evaluator for lite-mdx
 * --------------------------------------------------------------------
 */

const BLACKLIST_GLOBALS = [
  'process',
  'require',
  'globalThis',
  'global',
  'Function',
  'module',
  '__dirname',
  '__filename',
  'child_process',
  'fs',
  'window',
  'document'
];

/**
 * Safely evaluates an inline expression string against an isolated scope.
 */
export function safeEval(expr: string, scope: Record<string, any> = {}): any {
  const trimmed = expr.trim();
  if (!trimmed) return '';

  // 1. Primitive literal fast paths
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  if (trimmed === 'undefined') return undefined;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  // Exact single quoted string literal (without operations/methods)
  if (/^"([^"\\]|\\.)*"$/.test(trimmed)) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  if (/^'([^'\\]|\\.)*'$/.test(trimmed)) {
    return trimmed.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, "\\");
  }
  if (/^`([^`\\]|\\.)*`$/.test(trimmed)) {
    return trimmed.slice(1, -1).replace(/\\`/g, "`").replace(/\\\\/g, "\\");
  }

  // 2. Direct property path fast path (e.g. "frontmatter.title" or "config.siteTitle")
  if (/^[a-zA-Z_$][a-zA-Z0-9_$.]*$/.test(trimmed)) {
    const parts = trimmed.split('.');
    let curr: any = scope;
    for (const p of parts) {
      if (curr == null || typeof curr !== 'object') return undefined;
      curr = curr[p];
    }
    return curr;
  }

  // Security guard: block explicit eval calls
  if (/\beval\s*\(/.test(trimmed)) {
    return undefined;
  }

  // 3. Fallback expression evaluator with strict boundary isolation
  try {
    const sandboxScope: Record<string, any> = { ...scope };
    for (const bad of BLACKLIST_GLOBALS) {
      if (!(bad in sandboxScope)) {
        sandboxScope[bad] = undefined;
      }
    }
    const keys = Object.keys(sandboxScope);
    const values = Object.values(sandboxScope);
    const fn = new Function(...keys, `"use strict"; return (${trimmed});`);
    return fn(...values);
  } catch (err) {
    return undefined;
  }
}
