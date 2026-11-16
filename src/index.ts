/**
 * --------------------------------------------------------------------
 * lite-mdx : ultra lightweight, zero-dependency MDX/JSX compiler
 *
 * @package     lite-mdx
 * @website     https://docmd.io
 * @repository  https://github.com/docmd-io/lite-mdx
 * @license     MIT
 * --------------------------------------------------------------------
 */

export * from './types.js';
export { compile, evaluate } from './compiler.js';
export { safeEval, safeEvalResult, type SafeEvalResult } from './expression.js';
export {
  parseAttributes,
  findNextJsxTag,
  protectFences,
  restoreFences,
  parseImportsAndExports
} from './parser.js';

import { compile } from './compiler.js';
export default compile;
