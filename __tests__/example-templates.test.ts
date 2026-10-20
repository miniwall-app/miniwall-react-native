// The sample app's template sweep support (example/templates.ts): the deep link, the display by file name, the bundled library.
import * as fs from 'fs';
import * as path from 'path';

// The sample app bundles the spec's screens through example/templates.generated.ts, which tool/gen-templates.js writes from the spec
// (../.spec by scripts/fetch-spec.sh, or $MINIWALL_SPEC_DIR; the open spec has a small set, a bigger folder sweeps a bigger library).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { generate, specDir } = require('../example/tool/gen-templates.js') as { generate: () => number; specDir: () => string };
let bundledTemplates: Record<string, any>;
let loadTemplate: (name: string) => object | undefined;
let styleFor: (name: string) => unknown;
let templateFromUrl: (url: string | null | undefined) => string | null;

beforeAll(() => {
  generate();
  /* eslint-disable @typescript-eslint/no-require-imports */
  bundledTemplates = require('../example/templates.generated').bundledTemplates;
  ({ loadTemplate, styleFor, templateFromUrl } = require('../example/templates'));
  /* eslint-enable @typescript-eslint/no-require-imports */
});

describe('template sweep', () => {
  it('reads the template from the deep link', () => {
    expect(templateFromUrl('miniwall-example://present?tpl=free-trial')).toBe('free-trial');
    expect(templateFromUrl('miniwall-example:///?x=1&tpl=notice-bar')).toBe('notice-bar');
    expect(templateFromUrl('miniwall-example://present')).toBeNull();
    expect(templateFromUrl('miniwall-example://present?tpl=')).toBeNull();
    expect(templateFromUrl(null)).toBeNull();
  });

  it('shows by the file name, as the iOS and Android samples do', () => {
    expect(styleFor('stack-toast')).toEqual({ type: 'toast', seconds: 60 });
    expect(styleFor('app-update-bar')).toEqual({ type: 'banner', position: 'top' });
    expect(styleFor('autumn-banner')).toEqual({ type: 'banner', position: 'top' });
    expect(styleFor('bake-class-slide-in')).toEqual({ type: 'sheet' });
    expect(styleFor('x-drawer')).toEqual({ type: 'modal' });
    expect(styleFor('x-launcher')).toEqual({ type: 'modal' });
    expect(styleFor('free-trial')).toBeUndefined();
  });

  it('bundles every template and component of the spec, each with a root', () => {
    const fixtures = path.join(specDir(), 'fixtures');
    const expected = ['templates', 'components'].flatMap((dir) => fs.readdirSync(path.join(fixtures, dir)).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')));
    expect(Object.keys(bundledTemplates).sort()).toEqual([...new Set(expected)].sort());
    for (const name of expected) {
      const screen = loadTemplate(name) as { components_config?: unknown } | undefined;
      expect(screen?.components_config).toBeDefined();
    }
    expect(loadTemplate('nope')).toBeUndefined();
  });
});
