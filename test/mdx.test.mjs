import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, evaluate, parseAttributes } from '../dist/index.js';

test('1. Basic JSX component compilation', () => {
  const mdx = `# Title\n\n<Button variant="primary">Click Me</Button>\n`;
  const result = compile(mdx, {
    components: {
      Button: (props, children) => `<button class="${props.variant}">${children}</button>`
    }
  });

  assert.ok(result.content.includes('<button class="primary">Click Me</button>'));
  assert.ok(result.content.includes('# Title'));
});

test('2. Self-closing components with diverse prop types', () => {
  const mdx = `<Badge text="v0.9" count={42} active disabled={false} items={['a', 'b']} />`;
  let capturedProps = null;

  compile(mdx, {
    components: {
      Badge: (props) => {
        capturedProps = props;
        return `[BADGE]`;
      }
    }
  });

  assert.deepEqual(capturedProps, {
    text: 'v0.9',
    count: 42,
    active: true,
    disabled: false,
    items: ['a', 'b']
  });
});

test('3. Attribute spread operator {...props}', () => {
  const scope = {
    cardMeta: {
      title: 'Dynamic Card',
      count: 10
    }
  };
  const mdx = `<Card {...cardMeta} active />`;
  let captured = null;

  compile(mdx, {
    scope,
    components: {
      Card: (props) => {
        captured = props;
        return `<div>${props.title}</div>`;
      }
    }
  });

  assert.equal(captured.title, 'Dynamic Card');
  assert.equal(captured.count, 10);
  assert.equal(captured.active, true);
});

test('4. Text expression evaluation', () => {
  const mdx = `Hello {user.name}, the version is {config.version}. Year: {2020 + 6}`;
  const res = evaluate(mdx, {
    user: { name: 'Alice' },
    config: { version: '0.9.10' }
  });

  assert.equal(res, 'Hello Alice, the version is 0.9.10. Year: 2026');
});

test('5. Nested components rendering', () => {
  const mdx = `
<Tabs default="npm">
  <Tab value="npm">npm i docmd</Tab>
  <Tab value="pnpm">pnpm add docmd</Tab>
</Tabs>
`;

  const res = compile(mdx, {
    components: {
      Tabs: (props, children) => `<div class="tabs" data-default="${props.default}">${children}</div>`,
      Tab: (props, children) => `<div class="tab-pane" data-value="${props.value}">${children}</div>`
    }
  });

  assert.ok(res.content.includes('class="tabs" data-default="npm"'));
  assert.ok(res.content.includes('class="tab-pane" data-value="npm">npm i docmd</div>'));
  assert.ok(res.content.includes('class="tab-pane" data-value="pnpm">pnpm add docmd</div>'));
});

test('6. Code block fence preservation (JSX inside code must NOT be compiled)', () => {
  const mdx = `
# Demo

Here is code:
\`\`\`jsx
<Button variant="danger">Do Not Touch</Button>
{expression.inside.code}
\`\`\`

Inline \`<Button />\` in backticks.

<Button variant="success">Compile Me</Button>
`;

  const res = compile(mdx, {
    components: {
      Button: (props, children) => `<btn>${children || ''}</btn>`
    }
  });

  // Code block is preserved untouched
  assert.ok(res.content.includes('<Button variant="danger">Do Not Touch</Button>'));
  assert.ok(res.content.includes('{expression.inside.code}'));
  assert.ok(res.content.includes('`<Button />`'));

  // Outer component is compiled
  assert.ok(res.content.includes('<btn>Compile Me</btn>'));
});

test('7. Import and export declarations extraction', () => {
  const mdx = `
import { MyWidget } from './widget';
import DefaultComponent from './default';

export const title = "Awesome Guide";
export const count = 100;

# {title}
Total: {count * 2}
`;

  const res = compile(mdx);

  assert.equal(res.exports.title, "Awesome Guide");
  assert.equal(res.exports.count, 100);
  assert.equal(res.imports.length, 2);
  assert.equal(res.imports[0].source, './widget');
  assert.deepEqual(res.imports[0].specifiers, ['MyWidget']);
  assert.equal(res.imports[1].defaultImport, 'DefaultComponent');

  assert.ok(res.content.includes('# Awesome Guide'));
  assert.ok(res.content.includes('Total: 200'));
  // Imports & exports stripped from final markdown
  assert.ok(!res.content.includes('import { MyWidget }'));
  assert.ok(!res.content.includes('export const title'));
});

test('8. Unknown HTML/Web Components preservation', () => {
  const mdx = `<my-custom-element foo="bar" count={123}>Some text</my-custom-element>`;
  const res = compile(mdx, { allowUnknownTags: true });

  assert.ok(res.content.includes('<my-custom-element foo="bar" count="123">Some text</my-custom-element>'));
});

test('9. Security boundary sandbox', () => {
  const mdx = `Secret: {typeof process} and {typeof require}`;
  const res = evaluate(mdx);

  assert.equal(res, 'Secret: undefined and undefined');
});

test('10. Dotted components <Tabs.Tab>', () => {
  const mdx = `<Tabs.Tab value="npm">CLI</Tabs.Tab>`;
  const res = compile(mdx, {
    components: {
      'Tabs.Tab': (props, children) => `<tab value="${props.value}">${children}</tab>`
    }
  });

  assert.equal(res.content, '<tab value="npm">CLI</tab>');
});

test('11. Multi-line attributes and slash after prop', () => {
  const mdx = `<Card\n  title="Multi"\n  count={10}/>`;
  let captured = null;
  compile(mdx, {
    components: {
      Card: (props) => {
        captured = props;
        return '[CARD]';
      }
    }
  });

  assert.equal(captured.title, 'Multi');
  assert.equal(captured.count, 10);
});

test('12. Escaped expression \\{expr\\} is not evaluated', () => {
  const mdx = `Literal \\{2 + 2\\} should remain.`;
  const res = evaluate(mdx);
  assert.ok(res.includes('{2 + 2}'));
});
