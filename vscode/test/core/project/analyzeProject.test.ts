import { describe, expect, it } from 'vitest';
import { analyzeProject, viewFilePath } from '../../../src/core/project/analyzeProject';
import { detectProject } from '../../../src/core/project/detectProject';
import { nodeProjectFiles, type ProjectFiles } from '../../../src/core/project/projectFiles';
import { formatType } from '../../../src/core/types/phpType';
import { fixturePath } from '../../fixtures';

/** In-memory project, for cases the fixtures don't cover. */
function memoryFiles(files: Record<string, string>): ProjectFiles {
  const paths = Object.keys(files).sort();
  return {
    exists: (path) =>
      Promise.resolve(path in files || paths.some((file) => file.startsWith(`${path}/`))),
    read: (path) => Promise.resolve(files[path] ?? null),
    listPhpFiles: (folder) =>
      Promise.resolve(
        paths.filter((path) => path.startsWith(`${folder}/`) && path.endsWith('.php')),
      ),
  };
}

async function analyzeFixture(name: string): Promise<Record<string, Record<string, string>>> {
  const files = nodeProjectFiles(fixturePath(name));
  const project = await detectProject(files);
  if (project === null) {
    throw new Error(`No project detected in ${name}`);
  }

  const { views } = await analyzeProject(project, files);
  return Object.fromEntries(
    [...views].map(([path, variables]) => [
      path,
      Object.fromEntries([...variables].map(([name, type]) => [name, formatType(type)])),
    ]),
  );
}

describe('detectProject', () => {
  it('detects the CodeIgniter 3 fixture', async () => {
    expect(await detectProject(nodeProjectFiles(fixturePath('ci3')))).toEqual({
      version: 3,
      appFolder: 'application',
      viewsFolder: 'application/views',
    });
  });

  it('detects the CodeIgniter 4 fixture', async () => {
    expect(await detectProject(nodeProjectFiles(fixturePath('ci4')))).toEqual({
      version: 4,
      appFolder: 'app',
      viewsFolder: 'app/Views',
    });
  });

  it('detects CodeIgniter 4 from composer.json alone', async () => {
    const files = memoryFiles({
      'composer.json': '{"require": {"codeigniter4/framework": "^4.6"}}',
    });
    expect((await detectProject(files))?.version).toBe(4);
  });

  it('detects CodeIgniter 3 from the system folder alone', async () => {
    const files = memoryFiles({ 'system/core/CodeIgniter.php': '<?php' });
    expect((await detectProject(files))?.version).toBe(3);
  });

  it('returns null for another kind of project', async () => {
    expect(
      await detectProject(memoryFiles({ 'composer.json': '{"name": "acme/blog"}' })),
    ).toBeNull();
  });
});

describe('analyzeProject', () => {
  it('gives the variables of each CodeIgniter 3 view file, merged across controllers', async () => {
    expect(await analyzeFixture('ci3')).toEqual({
      'application/views/products/list.php': {
        title: 'string|null',
        products: 'mixed',
        page: 'int|string',
      },
      'application/views/products/show.php': { product: 'mixed', in_cart: 'mixed' },
      'application/views/layouts/main.php': { content: 'mixed' },
      'application/views/partials/product_card.php': { product: 'mixed' },
    });
  });

  it('gives the variables of each CodeIgniter 4 view file', async () => {
    expect(await analyzeFixture('ci4')).toEqual({
      'app/Views/products/index.php': { title: 'string', products: 'mixed' },
      'app/Views/products/show.php': { product: 'mixed' },
      'app/Views/partials/product_card.php': { product: 'mixed' },
    });
  });

  it('lists the views whose file is missing', async () => {
    const files = memoryFiles({
      spark: '',
      'app/Controllers/Home.php': "<?php view('home', ['a' => 1]); view('missing');",
      'app/Views/home.php': '<h1>Home</h1>',
    });
    const project = await detectProject(files);
    if (project === null) {
      throw new Error('No project detected');
    }

    const analysis = await analyzeProject(project, files);
    expect([...analysis.views.keys()]).toEqual(['app/Views/home.php']);
    expect(analysis.missingViews).toEqual(['missing']);
  });

  it('gives an empty list to a view that has a block but no caller anymore', async () => {
    const files = memoryFiles({
      spark: '',
      'app/Views/old.php':
        '<?php /* viewsense:start - generated */\n/** @var int $a */\n/* viewsense:end */ ?>\n<p>Old</p>',
    });
    const project = await detectProject(files);
    if (project === null) {
      throw new Error('No project detected');
    }

    const analysis = await analyzeProject(project, files);
    expect(analysis.views.get('app/Views/old.php')?.size).toBe(0);
  });
});

describe('viewFilePath', () => {
  it('maps a view name to its file', () => {
    const project = {
      version: 3,
      appFolder: 'application',
      viewsFolder: 'application/views',
    } as const;
    expect(viewFilePath(project, 'products/list')).toBe('application/views/products/list.php');
    expect(viewFilePath(project, '/home')).toBe('application/views/home.php');
  });
});
