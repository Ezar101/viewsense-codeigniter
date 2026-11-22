import type { ViewCallRule, ViewSenseConfig } from './config';
import type { ProjectFiles } from './projectFiles';

export type CodeIgniterVersion = 3 | 4;

export interface CodeIgniterProject {
  readonly version: CodeIgniterVersion;
  /** Folder with the application code, relative to the project root. */
  readonly appFolder: string;
  /** Folder CodeIgniter loads views from, relative to the project root. */
  readonly viewsFolder: string;
  /** Project methods and functions that render views, from `.viewsense.json`. */
  readonly viewCalls: readonly ViewCallRule[];
}

const CODEIGNITER_4_PACKAGES = ['codeigniter4/framework', 'codeigniter4/appstarter'];

/** Default folders of each version, used when `.viewsense.json` doesn't set them. */
const DEFAULT_FOLDERS: Readonly<Record<CodeIgniterVersion, { app: string; views: string }>> = {
  3: { app: 'application', views: 'application/views' },
  4: { app: 'app', views: 'app/Views' },
};

/**
 * Finds out whether a folder holds a CodeIgniter 3 or 4 project. The settings of
 * `.viewsense.json` win over what's detected. Returns `null` for any other folder.
 */
export async function detectProject(
  files: ProjectFiles,
  config: ViewSenseConfig = { viewCalls: [] },
): Promise<CodeIgniterProject | null> {
  const version = config.version ?? (await detectVersion(files, config.appFolder));
  if (version === null) {
    return null;
  }

  const defaults = DEFAULT_FOLDERS[version];
  const appFolder = config.appFolder ?? defaults.app;
  return {
    version,
    appFolder,
    // A renamed application folder moves the default views folder with it.
    viewsFolder: config.viewsFolder ?? `${appFolder}${defaults.views.slice(defaults.app.length)}`,
    viewCalls: config.viewCalls,
  };
}

async function detectVersion(
  files: ProjectFiles,
  appFolder: string | undefined,
): Promise<CodeIgniterVersion | null> {
  if ((await files.exists('spark')) || (await requiresCodeIgniter4(files))) {
    return 4;
  }
  const ci3AppFolder = appFolder ?? DEFAULT_FOLDERS[3].app;
  if (
    (await files.exists(`${ci3AppFolder}/config/config.php`)) ||
    (await files.exists('system/core/CodeIgniter.php'))
  ) {
    return 3;
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
