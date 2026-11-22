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

async function generatedFiles(name: string): Promise<ReadonlyMap<string, string>> {
  const files = nodeProjectFiles(fixturePath(name));
  const project = await detectProject(files);
  if (project === null) {
    throw new Error(`No project detected in ${name}`);
  }
  return (await analyzeProject(project, files)).generatedFiles;
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
    // `site_name` comes from `$this->load->vars()` in MY_Controller.
    const listVariables = {
      site_name: 'string',
      title: 'string|null',
      products: 'Product[]',
      page: 'int|string',
    };
    expect(await analyzeFixture('ci3')).toEqual({
      'application/views/products/list.php': { this: 'ViewSense_CI3_View', ...listVariables },
      'application/views/products/show.php': {
        site_name: 'string',
        product: 'Product|null',
        in_cart: 'bool',
      },
      'application/views/layouts/main.php': {
        this: 'ViewSense_CI3_View',
        site_name: 'string',
        content: 'mixed',
      },
      // The partial gets the variables of products/list, and `$product` from its foreach.
      'application/views/partials/product_card.php': { ...listVariables, product: 'Product' },
    });
  });

  it('gives the variables of each CodeIgniter 4 view file', async () => {
    expect(await analyzeFixture('ci4')).toEqual({
      'app/Views/products/index.php': {
        this: '\\CodeIgniter\\View\\View',
        title: 'string',
        products: '\\App\\Entities\\Product[]',
      },
      'app/Views/products/show.php': {
        this: '\\CodeIgniter\\View\\View',
        product: '\\App\\Entities\\Product|null',
      },
      'app/Views/products/form.php': {
        title: 'string',
        product: '\\App\\Entities\\Product',
        errors: 'array',
      },
      'app/Views/layouts/main.php': { this: '\\CodeIgniter\\View\\View' },
      // From products/index (view() in a foreach) and products/show ($this->include()).
      'app/Views/partials/product_card.php': {
        title: 'string',
        products: '\\App\\Entities\\Product[]',
        product: '\\App\\Entities\\Product|null',
      },
    });
  });

  it('shares load->vars() only with views of the class and its children', async () => {
    const files = memoryFiles({
      'application/config/config.php': '<?php',
      'application/core/Admin_Controller.php':
        "<?php class Admin_Controller extends CI_Controller { public function __construct() { $this->load->vars('admin', true); } }",
      'application/controllers/Users.php':
        "<?php class Users extends Admin_Controller { public function index() { $this->load->view('users', ['admin' => 'yes']); } }",
      'application/controllers/Home.php':
        "<?php class Home extends CI_Controller { public function index() { $this->load->view('home'); } }",
      'application/views/users.php': '<p>Users</p>',
      'application/views/home.php': '<p>Home</p>',
    });
    const project = await detectProject(files);
    if (project === null) {
      throw new Error('No project detected');
    }

    const { views } = await analyzeProject(project, files);
    // What the call passes itself wins over the shared value.
    expect(formatType(views.get('application/views/users.php')?.get('admin') ?? [])).toBe('string');
    expect(views.get('application/views/home.php')?.has('admin')).toBe(false);
  });

  it('stops on views that include each other', async () => {
    const files = memoryFiles({
      spark: '',
      'app/Controllers/Home.php': "<?php view('a', ['n' => 1]);",
      'app/Views/a.php': "<?= view('b', ['fromA' => 'x']) ?>",
      'app/Views/b.php': "<?= view('a', ['fromB' => 2.5]) ?>",
    });
    const project = await detectProject(files);
    if (project === null) {
      throw new Error('No project detected');
    }

    const { views } = await analyzeProject(project, files);
    expect([...(views.get('app/Views/a.php')?.keys() ?? [])].sort()).toEqual([
      'fromA',
      'fromB',
      'n',
    ]);
  });

  it('generates the class of $this for CodeIgniter 3 only', async () => {
    expect([...(await generatedFiles('ci3')).keys()]).toEqual([
      '.viewsense/ci3_view.php',
      '.viewsense/.gitignore',
    ]);
    expect((await generatedFiles('ci4')).size).toBe(0);
  });

  it('describes the loader and what the controllers reach in the CodeIgniter 3 stub', async () => {
    const stub = (await generatedFiles('ci3')).get('.viewsense/ci3_view.php') ?? '';

    expect(stub).toContain('class ViewSense_CI3_View extends CI_Loader');
    expect(stub).toContain(' * @property CI_Input $input\n');
    expect(stub).toContain(' * @property Cart $cart\n');
    expect(stub).toContain(' * @property Product_model $products\n');
    expect(stub).toContain(' * @property Product_model $product_model\n');
  });

  it('does not count the $this line of its own block as a use of $this', async () => {
    const files = memoryFiles({
      spark: '',
      'app/Views/old.php':
        '<?php /* viewsense:start - generated */\n/** @var \\CodeIgniter\\View\\View $this */\n/* viewsense:end */ ?>\n<p>Old</p>',
    });
    const project = await detectProject(files);
    if (project === null) {
      throw new Error('No project detected');
    }

    const analysis = await analyzeProject(project, files);
    expect(analysis.views.get('app/Views/old.php')?.size).toBe(0);
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
