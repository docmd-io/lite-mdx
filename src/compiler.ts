/**
 * --------------------------------------------------------------------
 * High-performance MDX Compiler for lite-mdx
 * --------------------------------------------------------------------
 */

import { MdxCompileOptions, MdxResult, ParsedJsxTag } from './types.js';
import { safeEval } from './expression.js';
import {
  protectFences,
  restoreFences,
  parseImportsAndExports,
  findNextJsxTag
} from './parser.js';

function escapeHtmlAttr(val: any): string {
  if (typeof val === 'object') {
    val = JSON.stringify(val);
  }
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function propsToHtmlAttrs(props: Record<string, any>): string {
  const attrs: string[] = [];
  for (const [key, val] of Object.entries(props)) {
    if (val === false || val === null || val === undefined) continue;
    if (val === true) {
      attrs.push(key);
    } else {
      attrs.push(`${key}="${escapeHtmlAttr(val)}"`);
    }
  }
  return attrs.length > 0 ? ' ' + attrs.join(' ') : '';
}

/**
 * Replaces inline `{expression}` tags in markdown with evaluated values,
 * and unescapes `\{` and `\}`.
 */
function evaluateTextExpressions(text: string, scope: Record<string, any>): string {
  // Matches {expression} outside of escaped \{}
  const exprRegex = /(?<!\\)\{([^}\r\n]+)\}/g;
  let evaluated = text.replace(exprRegex, (match, expr) => {
    const trimmed = expr.trim();
    if (!trimmed) return match;
    const res = safeEval(trimmed, scope);
    if (res === undefined) return '';
    if (typeof res === 'object') return JSON.stringify(res);
    return String(res);
  });

  // Unescape \ { and \ }
  return evaluated.replace(/\\\{/g, '{').replace(/\\\}/g, '}');
}

/**
 * Recursively renders parsed JSX tags within a text string.
 */
function processJsxInText(
  text: string,
  options: MdxCompileOptions,
  mergedScope: Record<string, any>
): string {
  const components = options.components || {};
  const allowUnknown = options.allowUnknownTags !== false;
  let result = '';
  let cursor = 0;

  while (cursor < text.length) {
    const tag = findNextJsxTag(text, cursor, mergedScope);
    if (!tag) {
      result += text.slice(cursor);
      break;
    }

    // Append text leading up to the tag
    result += text.slice(cursor, tag.start);

    // Recursively process children if present
    let processedChildren = tag.children;
    if (processedChildren && (processedChildren.includes('<') || processedChildren.includes('{'))) {
      processedChildren = processJsxInText(processedChildren, options, mergedScope);
    }

    // Render component
    let rendered = '';
    const customHandler = components[tag.tagName];

    if (typeof customHandler === 'function') {
      rendered = String(customHandler(tag.props, processedChildren));
    } else if (typeof customHandler === 'string') {
      rendered = customHandler;
    } else if (options.onUnknownComponent) {
      rendered = options.onUnknownComponent(tag.tagName, tag.props, processedChildren);
    } else if (allowUnknown) {
      const attrsStr = propsToHtmlAttrs(tag.props);
      if (tag.isSelfClosing) {
        rendered = `<${tag.tagName}${attrsStr} />`;
      } else {
        rendered = `<${tag.tagName}${attrsStr}>${processedChildren || ''}</${tag.tagName}>`;
      }
    } else {
      rendered = tag.raw;
    }

    result += rendered;
    cursor = tag.end;
  }

  return result;
}

/**
 * Compiles MDX source text into clean Markdown / HTML output.
 */
export function compile(mdx: string, options: MdxCompileOptions = {}): MdxResult {
  if (!mdx) {
    return { content: '', exports: {}, imports: [] };
  }

  // 1. Protect code blocks, backticks, comments, and frontmatter
  const { cleanedText: textNoFences, fences } = protectFences(mdx);

  // 2. Extract and strip import/export statements
  const initialScope = options.scope || {};
  const { cleanedText: textNoImports, imports, exports: parsedExports } = parseImportsAndExports(
    textNoFences,
    initialScope
  );

  const mergedScope = {
    ...initialScope,
    ...parsedExports
  };

  // 3. Process JSX components
  let transformed = processJsxInText(textNoImports, options, mergedScope);

  // 4. Evaluate text expressions { ... } if enabled
  if (options.evaluateExpressions !== false) {
    transformed = evaluateTextExpressions(transformed, mergedScope);
  }

  // 5. Restore protected code blocks & frontmatter untouched
  const finalContent = restoreFences(transformed, fences);

  return {
    content: finalContent,
    exports: parsedExports,
    imports
  };
}

/**
 * Shortcut to compile and evaluate MDX directly to string.
 */
export function evaluate(mdx: string, scope: Record<string, any> = {}): string {
  const result = compile(mdx, { scope });
  return result.content;
}
