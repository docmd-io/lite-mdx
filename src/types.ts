/**
 * --------------------------------------------------------------------
 * lite-mdx : ultra lightweight, zero-dependency MDX/JSX compiler
 *
 * @website     https://docmd.io
 * @repository  https://github.com/docmd-io/lite-mdx
 * @license     MIT
 * --------------------------------------------------------------------
 */

export type ComponentRenderer = (
  props: Record<string, any>,
  children?: string
) => string | Promise<string>;

export interface MdxCompileOptions {
  /**
   * Custom component map. Values can be either a render function
   * `(props, children) => string`, an HTML template string, or a tag name string.
   */
  components?: Record<string, ComponentRenderer | string>;

  /**
   * Variable / scope dictionary available to inline expressions { ... }
   * and dynamic attribute values like <Card title={project.name} />.
   */
  scope?: Record<string, any>;

  /**
   * Whether to preserve unrecognized JSX tags as custom HTML elements
   * (e.g. <custom-element> or Web Components) instead of failing.
   * Default: true
   */
  allowUnknownTags?: boolean;

  /**
   * Optional custom handler for unmapped tags.
   */
  onUnknownComponent?: (
    tagName: string,
    props: Record<string, any>,
    children?: string
  ) => string;

  /**
   * If true, also evaluates expression placeholders inside markdown text: {expression}
   * Default: true
   */
  evaluateExpressions?: boolean;
}

export interface MdxResult {
  /**
   * The transformed markdown content ready to be consumed by any standard Markdown parser.
   */
  content: string;

  /**
   * Extracted exported variables and constants.
   */
  exports: Record<string, any>;

  /**
   * Extracted import declarations.
   */
  imports: Array<{
    raw: string;
    specifiers: string[];
    source: string;
    defaultImport?: string;
  }>;
}

export interface ParsedJsxTag {
  raw: string;
  tagName: string;
  props: Record<string, any>;
  children?: string;
  isSelfClosing: boolean;
  start: number;
  end: number;
}
