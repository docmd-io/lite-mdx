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

export interface SafeEvalResult {
  success: boolean;
  value?: any;
}

/**
 * Safely evaluates an inline expression string against an isolated scope,
 * returning both a success indicator and the evaluated value.
 */
export function safeEvalResult(expr: string, scope: Record<string, any> = {}): SafeEvalResult {
  const trimmed = expr.trim();
  if (!trimmed) return { success: true, value: '' };

  // 1. Primitive literal fast paths
  if (trimmed === 'true') return { success: true, value: true };
  if (trimmed === 'false') return { success: true, value: false };
  if (trimmed === 'null') return { success: true, value: null };
  if (trimmed === 'undefined') return { success: true, value: undefined };
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return { success: true, value: Number(trimmed) };
  // Exact single quoted string literal (without operations/methods)
  if (/^"([^"\\]|\\.)*"$/.test(trimmed)) {
    try {
      return { success: true, value: JSON.parse(trimmed) };
    } catch {
      return { success: true, value: trimmed.slice(1, -1) };
    }
  }
  if (/^'([^'\\]|\\.)*'$/.test(trimmed)) {
    return { success: true, value: trimmed.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, "\\") };
  }
  if (/^`([^`\\]|\\.)*`$/.test(trimmed)) {
    return { success: true, value: trimmed.slice(1, -1).replace(/\\`/g, "`").replace(/\\\\/g, "\\") };
  }

  // 2. Direct property path fast path (e.g. "frontmatter.title" or "config.siteTitle")
  if (/^[a-zA-Z_$][a-zA-Z0-9_$.]*$/.test(trimmed)) {
    const parts = trimmed.split('.');
    const rootVar = parts[0];
    if (!(rootVar in scope)) {
      return { success: false, value: undefined };
    }
    let curr: any = scope;
    for (const p of parts) {
      if (curr == null || typeof curr !== 'object') return { success: true, value: undefined };
      curr = curr[p];
    }
    return { success: true, value: curr };
  }

  // Security guard: block explicit eval calls
  if (/\beval\s*\(/.test(trimmed)) {
    return { success: false, value: undefined };
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
    const val = fn(...values);
    return { success: true, value: val };
  } catch (err) {
    return { success: false, value: undefined };
  }
}

/**
 * Safely evaluates an inline expression string against an isolated scope.
 */
export function safeEval(expr: string, scope: Record<string, any> = {}): any {
  return safeEvalResult(expr, scope).value;
}
