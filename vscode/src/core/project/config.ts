import type { CodeIgniterVersion } from './detectProject';
import type { ProjectFiles } from './projectFiles';

export const CONFIG_FILE = '.viewsense.json';

/**
 * A project method or function that renders a view, e.g. `MY_Controller::render($view, $data)`
 * or a helper `include_view($view, $data)`.
 */
export interface ViewCallRule {
  /** `method` matches `$object->name()` and `Class::name()`, `function` matches `name()`. */
  readonly kind: 'method' | 'function';
  readonly name: string;
  /** Position of the view name argument, starting at 0. */
  readonly viewArgument: number;
  /** Position of the data argument, or `null` when the call passes no data. */
  readonly dataArgument: number | null;
  /** A layout the method also renders with the same data, e.g. `layouts/main`. */
  readonly layout: string | null;
}

/** Settings read from `.viewsense.json`. Every setting is optional. */
export interface ViewSenseConfig {
  readonly version?: CodeIgniterVersion;
  readonly appFolder?: string;
  readonly viewsFolder?: string;
  readonly viewCalls: readonly ViewCallRule[];
}

export interface ConfigResult {
  readonly config: ViewSenseConfig;
  /** Problems found in the file, written for the user. The valid parts are still used. */
  readonly problems: readonly string[];
}

const EMPTY_CONFIG: ViewSenseConfig = { viewCalls: [] };

const TOP_LEVEL_KEYS = new Set(['$schema', 'version', 'appFolder', 'viewsFolder', 'viewCalls']);
const RULE_KEYS = new Set(['method', 'function', 'view', 'data', 'layout']);

/** Reads `.viewsense.json` at the project root. A missing file gives the default settings. */
export async function loadConfig(files: ProjectFiles): Promise<ConfigResult> {
  const text = await files.read(CONFIG_FILE);
  return text === null ? { config: EMPTY_CONFIG, problems: [] } : parseConfig(text);
}

/** Parses and checks the content of `.viewsense.json`. */
export function parseConfig(text: string): ConfigResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { config: EMPTY_CONFIG, problems: [`${CONFIG_FILE} isn't valid JSON: ${reason}`] };
  }
  if (!isObject(data)) {
    return { config: EMPTY_CONFIG, problems: [`${CONFIG_FILE} must contain a JSON object.`] };
  }

  const problems: string[] = [];
  for (const key of Object.keys(data)) {
    if (!TOP_LEVEL_KEYS.has(key)) {
      problems.push(`Unknown setting "${key}".`);
    }
  }

  const config: {
    version?: CodeIgniterVersion;
    appFolder?: string;
    viewsFolder?: string;
    viewCalls: ViewCallRule[];
  } = { viewCalls: [] };

  if (data.version !== undefined) {
    if (data.version === 3 || data.version === 4) {
      config.version = data.version;
    } else {
      problems.push('"version" must be 3 or 4.');
    }
  }

  for (const key of ['appFolder', 'viewsFolder'] as const) {
    const value = data[key];
    if (value === undefined) {
      continue;
    }
    const folder = typeof value === 'string' ? normalizeFolder(value) : '';
    if (folder === '') {
      problems.push(`"${key}" must be a folder path relative to the project root.`);
    } else {
      config[key] = folder;
    }
  }

  if (data.viewCalls !== undefined) {
    if (Array.isArray(data.viewCalls)) {
      data.viewCalls.forEach((rule: unknown, index) => {
        const parsed = parseRule(rule, `viewCalls[${String(index)}]`, problems);
        if (parsed !== null) {
          config.viewCalls.push(parsed);
        }
      });
    } else {
      problems.push('"viewCalls" must be a list.');
    }
  }

  return { config, problems };
}

function parseRule(rule: unknown, where: string, problems: string[]): ViewCallRule | null {
  if (!isObject(rule)) {
    problems.push(`${where} must be an object.`);
    return null;
  }
  for (const key of Object.keys(rule)) {
    if (!RULE_KEYS.has(key)) {
      problems.push(`${where}: unknown setting "${key}".`);
    }
  }

  const method = rule.method;
  const function_ = rule.function;
  if ((method === undefined) === (function_ === undefined)) {
    problems.push(`${where} needs either "method" or "function", not both.`);
    return null;
  }
  const name = method ?? function_;
  if (typeof name !== 'string' || !/^[A-Za-z_]\w*$/.test(name)) {
    problems.push(`${where}: the name must be a PHP method or function name, e.g. "render".`);
    return null;
  }

  const viewArgument = rule.view ?? 0;
  if (!isArgumentPosition(viewArgument)) {
    problems.push(`${where}: "view" must be an argument position: 0, 1, 2...`);
    return null;
  }
  const dataArgument = rule.data === undefined ? viewArgument + 1 : rule.data;
  if (dataArgument !== null && !isArgumentPosition(dataArgument)) {
    problems.push(`${where}: "data" must be an argument position, or null for no data.`);
    return null;
  }
  const layout = rule.layout ?? null;
  if (layout !== null && (typeof layout !== 'string' || layout.trim() === '')) {
    problems.push(`${where}: "layout" must be a view name, e.g. "layouts/main".`);
    return null;
  }

  return {
    kind: method === undefined ? 'function' : 'method',
    name,
    viewArgument,
    dataArgument,
    layout: layout === null ? null : layout.trim(),
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isArgumentPosition(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** `./application/` becomes `application`. Folders outside the project are refused. */
function normalizeFolder(folder: string): string {
  const normalized = folder.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '').trim();
  if (normalized.startsWith('/') || normalized.split('/').includes('..')) {
    return '';
  }
  return normalized;
}
