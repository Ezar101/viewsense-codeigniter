import type { ProjectFiles } from './projectFiles';

export type CodeIgniterVersion = 3 | 4;

export interface CodeIgniterProject {
  readonly version: CodeIgniterVersion;
  /** Folder with the application code, relative to the project root. */
  readonly appFolder: string;
  /** Folder CodeIgniter loads views from, relative to the project root. */
  readonly viewsFolder: string;
}

const CODEIGNITER_4_PACKAGES = ['codeigniter4/framework', 'codeigniter4/appstarter'];

/**
 * Finds out whether a folder holds a CodeIgniter 3 or 4 project, using the default folder names.
 * Returns `null` for any other folder.
 */
export async function detectProject(files: ProjectFiles): Promise<CodeIgniterProject | null> {
  if ((await files.exists('spark')) || (await requiresCodeIgniter4(files))) {
    return { version: 4, appFolder: 'app', viewsFolder: 'app/Views' };
  }

  if (
    (await files.exists('application/config/config.php')) ||
    (await files.exists('system/core/CodeIgniter.php'))
  ) {
    return { version: 3, appFolder: 'application', viewsFolder: 'application/views' };
  }

  return null;
}

async function requiresCodeIgniter4(files: ProjectFiles): Promise<boolean> {
  const composer = await files.read('composer.json');
  if (composer === null) {
    return false;
  }
  return CODEIGNITER_4_PACKAGES.some((name) => composer.includes(`"${name}"`));
}
