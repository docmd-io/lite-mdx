# lite-mdx

> Ultra lightweight, zero-dependency MDX and JSX compiler for markdown engines and browsers.

[![npm version](https://img.shields.io/npm/v/lite-mdx.svg)](https://www.npmjs.com/package/lite-mdx)
[![license](https://img.shields.io/npm/l/lite-mdx.svg)](https://github.com/docmd-io/lite-mdx/blob/main/LICENSE)

`lite-mdx` provides a minimal (<8KB), zero-dependency, ultra-fast alternative to `@mdx-js/mdx`. It parses JSX components, evaluates dynamic `{expressions}`, handles `{...spread}` props, and seamlessly integrates with standard Markdown engines without dragging in Babel, Unified, or heavy AST dependencies.

## Features

- ⚡ **Zero Dependencies**: Pure TypeScript/ESM, no heavy bundlers or Babel runtimes.
- 🧩 **Full Component Support**: Self-closing `<Card />`, block `<Callout>...</Callout>`, nested `<Tabs><Tab /></Tabs>`, and dotted `<Tabs.Item />`.
- 🏷️ **Rich Attributes**: Strings, numbers, booleans, objects/arrays, and `{...props}` spreads.
- 💡 **Expression Interpolation**: Evaluates inline text `{frontmatter.title}` and variable scopes.
- 🛡️ **Fence & Sandbox Isolation**: Code blocks and backticks are strictly protected; expressions execute in an isolated sandbox.
- 🌐 **Universal**: Runs identically in Node.js, browsers, Edge workers, and Cloudflare Workers.

## Installation

```bash
npm install lite-mdx
# or
pnpm add lite-mdx
```

## Quick Start

```typescript
import { compile, evaluate } from 'lite-mdx';

const mdx = `
# Welcome to {project.name}

<Callout type="tip">
  This is a tip for **v{project.version}**.
</Callout>

<Button variant="primary" active>Get Started</Button>
`;

const result = compile(mdx, {
  scope: {
    project: { name: 'docmd', version: '0.10.0' }
  },
  components: {
    Callout: (props, children) => `<div class="callout ${props.type}">${children}</div>`,
    Button: (props, children) => `<button class="${props.variant}">${children}</button>`
  }
});

console.log(result.content);
```

## API

### `compile(mdxString, options)`

Compiles MDX into standard Markdown/HTML.

- `options.components`: Map of custom component render functions `(props, children) => string` or template strings.
- `options.scope`: Variable dictionary for expression `{ ... }` evaluation and dynamic props.
- `options.allowUnknownTags`: When `true` (default), preserves unmapped components as HTML/Web Components.
- `options.evaluateExpressions`: When `true` (default), evaluates inline text expressions.

Returns:
- `content`: Transformed markdown/HTML string ready for your markdown parser.
- `exports`: Record of extracted `export const` declarations.
- `imports`: Array of extracted `import` statements.

### `evaluate(mdxString, scope)`

Evaluates expressions and returns the compiled string directly.

## License

[MIT](LICENSE) © [docmd.io](https://docmd.io)