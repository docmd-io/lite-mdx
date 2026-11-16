/**
 * --------------------------------------------------------------------
 * Tokenizer & AST-free JSX/MDX Parser for lite-mdx
 * --------------------------------------------------------------------
 */

import { ParsedJsxTag } from './types.js';
import { safeEval } from './expression.js';

export interface FencedState {
  cleanedText: string;
  fences: string[];
}

/**
 * Temporarily extracts code blocks, comments, and frontmatter to ensure
 * they are never parsed as JSX or expressions.
 */
export function protectFences(text: string): FencedState {
  const fences: string[] = [];
  const lines = text.split('\n');
  const outputLines: string[] = [];

  let inFence = false;
  let fenceChar = '';
  let fenceLength = 0;
  let fenceBuffer: string[] = [];

  // 1. Frontmatter check at document start (must begin at line 0)
  let startLine = 0;
  if (lines.length > 0 && lines[0].replace(/\r$/, '') === '---') {
    let fmEnd = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].replace(/\r$/, '') === '---') {
        fmEnd = i;
        break;
      }
    }
    if (fmEnd !== -1) {
      const fmContent = lines.slice(0, fmEnd + 1).join('\n');
      fences.push(fmContent);
      outputLines.push(`\x00DOCMD_LITEMDX_FENCE_${fences.length - 1}\x00`);
      startLine = fmEnd + 1;
    }
  }

  // 2. Multi-line code fence blocks (``` or ~~~ with any info string, attributes, or titles)
  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    const lineClean = line.replace(/\r$/, '');

    if (!inFence) {
      // 0-3 spaces of indentation, then 3+ backticks or tildes
      const match = lineClean.match(/^[ \t]{0,3}(`{3,}|~{3,})(.*)$/);
      if (match) {
        const marker = match[1];
        const info = match[2];
        const ch = marker[0];
        // CommonMark: backtick fence info strings cannot contain backticks
        if (ch !== '`' || !info.includes('`')) {
          inFence = true;
          fenceChar = ch;
          fenceLength = marker.length;
          fenceBuffer = [line];
          continue;
        }
      }
      outputLines.push(line);
    } else {
      fenceBuffer.push(line);
      // Closing fence: 0-3 spaces, same fence character, at least fenceLength count, optional whitespace after
      const closeRegex = new RegExp(`^[ \\t]{0,3}${fenceChar}{${fenceLength},}[ \\t]*$`);
      if (closeRegex.test(lineClean)) {
        inFence = false;
        fences.push(fenceBuffer.join('\n'));
        outputLines.push(`\x00DOCMD_LITEMDX_FENCE_${fences.length - 1}\x00`);
        fenceBuffer = [];
      }
    }
  }

  if (inFence && fenceBuffer.length > 0) {
    fences.push(fenceBuffer.join('\n'));
    outputLines.push(`\x00DOCMD_LITEMDX_FENCE_${fences.length - 1}\x00`);
  }

  let cleaned = outputLines.join('\n');

  // 3. Protect HTML comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, (match) => {
    fences.push(match);
    return `\x00DOCMD_LITEMDX_FENCE_${fences.length - 1}\x00`;
  });

  // 4. Protect <script> and <style> blocks
  cleaned = cleaned.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, (match) => {
    fences.push(match);
    return `\x00DOCMD_LITEMDX_FENCE_${fences.length - 1}\x00`;
  });

  // 5. Protect inline code (backticks without paragraph breaks)
  cleaned = cleaned.replace(/(?<!`)(`+)(?!`)([^\r\n]+?)\1(?!`)/g, (match) => {
    fences.push(match);
    return `\x00DOCMD_LITEMDX_FENCE_${fences.length - 1}\x00`;
  });

  return { cleanedText: cleaned, fences };
}

/**
 * Restores protected blocks back into the text.
 */
export function restoreFences(text: string, fences: string[]): string {
  return text.replace(/\x00DOCMD_LITEMDX_FENCE_(\d+)\x00/g, (_, idx) => {
    const i = parseInt(idx, 10);
    return fences[i] !== undefined ? fences[i] : '';
  });
}

/**
 * Extracts import and export statements from the document top/body.
 */
export function parseImportsAndExports(
  text: string,
  scope: Record<string, any> = {}
): {
  cleanedText: string;
  imports: Array<{ raw: string; specifiers: string[]; source: string; defaultImport?: string }>;
  exports: Record<string, any>;
} {
  const imports: Array<{ raw: string; specifiers: string[]; source: string; defaultImport?: string }> = [];
  const exportsObj: Record<string, any> = {};

  // Parse imports: import { A, B } from 'source' or import A from 'source'
  const importRegex = /^import\s+(?:(?:(\w+)\s*,?\s*)?(?:\{([^}]+)\})?)\s+from\s+['"]([^'"]+)['"]\s*;?/gm;
  let cleaned = text.replace(importRegex, (match, defaultImport, namedImports, source) => {
    const specifiers: string[] = [];
    if (namedImports) {
      namedImports.split(',').forEach((s: string) => {
        const item = s.trim();
        if (item) specifiers.push(item);
      });
    }
    imports.push({
      raw: match,
      source,
      defaultImport: defaultImport ? defaultImport.trim() : undefined,
      specifiers
    });
    return '';
  });

  // Parse exports: export const name = value;
  const exportRegex = /^export\s+(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*([^;\r\n]+);?/gm;
  cleaned = cleaned.replace(exportRegex, (match, varName, valueRaw) => {
    const val = safeEval(valueRaw.trim(), { ...scope, ...exportsObj });
    exportsObj[varName] = val;
    return '';
  });

  return { cleanedText: cleaned, imports, exports: exportsObj };
}

/**
 * Parses JSX attributes from an attribute string:
 * e.g. `title="Hello" count={42} active items={['a', 'b']} {...rest}`
 */
export function parseAttributes(
  rawAttrs: string,
  scope: Record<string, any> = {}
): Record<string, any> {
  const props: Record<string, any> = {};
  if (!rawAttrs || !rawAttrs.trim()) return props;

  let str = rawAttrs.trim();
  let i = 0;

  while (i < str.length) {
    // Skip whitespace
    while (i < str.length && /\s/.test(str[i])) i++;
    if (i >= str.length) break;

    // Check for spread attribute: {...obj}
    if (str[i] === '{' && str[i + 1] === '.' && str[i + 2] === '.' && str[i + 3] === '.') {
      let depth = 1;
      let start = i + 4;
      i += 4;
      while (i < str.length && depth > 0) {
        if (str[i] === '{') depth++;
        else if (str[i] === '}') depth--;
        i++;
      }
      const spreadExpr = str.slice(start, i - 1).trim();
      const spreadVal = safeEval(spreadExpr, scope);
      if (spreadVal && typeof spreadVal === 'object') {
        Object.assign(props, spreadVal);
      }
      continue;
    }

    // Read attribute key
    let keyStart = i;
    while (i < str.length && /[a-zA-Z0-9_$.:-]/.test(str[i])) i++;
    const key = str.slice(keyStart, i);
    if (!key) {
      i++;
      continue;
    }

    // Skip whitespace after key
    while (i < str.length && /\s/.test(str[i])) i++;

    // Boolean flag if not followed by '=': e.g. `<Button disabled />`
    if (i >= str.length || str[i] !== '=') {
      props[key] = true;
      continue;
    }

    // Skip '='
    i++;
    while (i < str.length && /\s/.test(str[i])) i++;
    if (i >= str.length) {
      props[key] = true;
      break;
    }

    const quote = str[i];
    if (quote === '"' || quote === "'") {
      // String attribute: `key="value"`
      i++;
      let valStart = i;
      while (i < str.length && str[i] !== quote) {
        if (str[i] === '\\' && i + 1 < str.length) i++;
        i++;
      }
      props[key] = str.slice(valStart, i);
      i++; // Skip closing quote
    } else if (quote === '{') {
      // Expression attribute: `key={expr}`
      i++;
      let valStart = i;
      let depth = 1;
      let inStr: string | null = null;
      while (i < str.length && depth > 0) {
        const c = str[i];
        if (inStr) {
          if (c === '\\' && i + 1 < str.length) i++;
          else if (c === inStr) inStr = null;
        } else {
          if (c === '"' || c === "'" || c === '`') inStr = c;
          else if (c === '{') depth++;
          else if (c === '}') depth--;
        }
        if (depth > 0) i++;
      }
      const expr = str.slice(valStart, i).trim();
      props[key] = safeEval(expr, scope);
      i++; // Skip closing '}'
    } else {
      // Unquoted literal
      let valStart = i;
      while (i < str.length && !/\s/.test(str[i])) i++;
      const rawVal = str.slice(valStart, i);
      props[key] = safeEval(rawVal, scope);
    }
  }

  return props;
}

/**
 * Searches and parses top-level JSX tags within text.
 * Accurately tracks nesting depth for blocks with matching opening and closing tags.
 */
export function findNextJsxTag(
  text: string,
  startIndex: number = 0,
  scope: Record<string, any> = {}
): ParsedJsxTag | null {
  // Matches tag opening: <Card or <Tabs.Item or <my-component
  const openRegex = /<([A-Z][a-zA-Z0-9_$.-]*|[a-z0-9]+-[a-z0-9-]+)(\s+[\s\S]*?)?(\/?)>/g;
  openRegex.lastIndex = startIndex;

  let match: RegExpExecArray | null;
  while ((match = openRegex.exec(text)) !== null) {
    const rawOpening = match[0];
    const tagName = match[1];
    const rawAttrs = match[2] || '';
    const isSelfClosing = match[3] === '/' || rawOpening.endsWith('/>');
    const tagStart = match.index;

    const props = parseAttributes(rawAttrs, scope);

    if (isSelfClosing) {
      return {
        raw: rawOpening,
        tagName,
        props,
        isSelfClosing: true,
        start: tagStart,
        end: tagStart + rawOpening.length
      };
    }

    // Find matching closing tag </TagName> respecting nesting
    const closePattern = new RegExp(`</${tagName.replace('.', '\\.')}\\s*>`, 'g');
    const openPattern = new RegExp(`<${tagName.replace('.', '\\.')}(\\s+[\\s\S]*?)?(\\/?)>`, 'g');

    let depth = 1;
    let cursor = tagStart + rawOpening.length;
    let finalEnd = -1;
    let children = '';

    while (depth > 0 && cursor < text.length) {
      closePattern.lastIndex = cursor;
      openPattern.lastIndex = cursor;

      const nextClose = closePattern.exec(text);
      const nextOpen = openPattern.exec(text);

      if (!nextClose) {
        // Tag wasn't closed properly; treat as self-closing
        return {
          raw: rawOpening,
          tagName,
          props,
          isSelfClosing: true,
          start: tagStart,
          end: tagStart + rawOpening.length
        };
      }

      if (nextOpen && nextOpen.index < nextClose.index) {
        if (!nextOpen[0].endsWith('/>') && nextOpen[2] !== '/') {
          depth++;
        }
        cursor = nextOpen.index + nextOpen[0].length;
      } else {
        depth--;
        cursor = nextClose.index + nextClose[0].length;
        if (depth === 0) {
          finalEnd = cursor;
          children = text.slice(tagStart + rawOpening.length, nextClose.index);
        }
      }
    }

    if (finalEnd !== -1) {
      return {
        raw: text.slice(tagStart, finalEnd),
        tagName,
        props,
        children,
        isSelfClosing: false,
        start: tagStart,
        end: finalEnd
      };
    }
  }

  return null;
}
