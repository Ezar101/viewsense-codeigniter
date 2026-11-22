import { describe, expect, it } from 'vitest';
import { parseConfig } from '../../../src/core/project/config';

describe('parseConfig', () => {
  it('reads every setting', () => {
    const text = JSON.stringify({
      $schema: './schema.json',
      version: 3,
      appFolder: './application/',
      viewsFolder: 'application\\views',
      viewCalls: [
        { method: 'render', view: 0, data: 1, layout: 'layouts/main' },
        { function: 'include_view' },
        { method: 'partial', view: 1, data: null },
      ],
    });

    expect(parseConfig(text)).toEqual({
      config: {
        version: 3,
        appFolder: 'application',
        viewsFolder: 'application/views',
        viewCalls: [
          {
            kind: 'method',
            name: 'render',
            viewArgument: 0,
            dataArgument: 1,
            layout: 'layouts/main',
          },
          {
            kind: 'function',
            name: 'include_view',
            viewArgument: 0,
            dataArgument: 1,
            layout: null,
          },
          { kind: 'method', name: 'partial', viewArgument: 1, dataArgument: null, layout: null },
        ],
      },
      problems: [],
    });
  });

  it('gives the defaults for an empty object', () => {
    expect(parseConfig('{}')).toEqual({ config: { viewCalls: [] }, problems: [] });
  });

  it('reports a file that is not valid JSON', () => {
    const { config, problems } = parseConfig('{ "version": 3, }');

    expect(config).toEqual({ viewCalls: [] });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^\.viewsense\.json isn't valid JSON/);
  });

  it('reports a file that is not an object', () => {
    expect(parseConfig('[]').problems).toEqual(['.viewsense.json must contain a JSON object.']);
  });

  it('keeps the valid settings and reports the others', () => {
    const text = JSON.stringify({
      version: 5,
      appFolder: '../outside',
      viewsFolder: 'views',
      extra: true,
      viewCalls: [
        { method: 'render', function: 'render' },
        { method: 'render-page' },
        { function: 'include_view', view: -1 },
        { function: 'partial', data: 'one' },
        { function: 'with_layout', layout: '' },
        { function: 'with_typo', layuot: 'main' },
        'render',
      ],
    });

    const { config, problems } = parseConfig(text);
    expect(config).toEqual({
      viewsFolder: 'views',
      viewCalls: [
        {
          kind: 'function',
          name: 'with_typo',
          viewArgument: 0,
          dataArgument: 1,
          layout: null,
        },
      ],
    });
    expect(problems).toEqual([
      'Unknown setting "extra".',
      '"version" must be 3 or 4.',
      '"appFolder" must be a folder path relative to the project root.',
      'viewCalls[0] needs either "method" or "function", not both.',
      'viewCalls[1]: the name must be a PHP method or function name, e.g. "render".',
      'viewCalls[2]: "view" must be an argument position: 0, 1, 2...',
      'viewCalls[3]: "data" must be an argument position, or null for no data.',
      'viewCalls[4]: "layout" must be a view name, e.g. "layouts/main".',
      'viewCalls[5]: unknown setting "layuot".',
      'viewCalls[6] must be an object.',
    ]);
  });

  it('reports a viewCalls value that is not a list', () => {
    expect(parseConfig('{"viewCalls": {}}').problems).toEqual(['"viewCalls" must be a list.']);
  });
});
