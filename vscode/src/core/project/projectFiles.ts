import { readdir, readFile, stat } from 'node:fs/promises';
import { join, posix } from 'node:path';

/**
 * Read access to the files of a project. Paths are relative to the project root and always use
 * forward slashes, e.g. `application/views/products/list.php`.
 */
export interface ProjectFiles {
  exists(path: string): Promise<boolean>;
  /** File content, or `null` when the file can't be read. */
  read(path: string): Promise<string | null>;
  /** PHP files of a folder and its subfolders. */
  listPhpFiles(folder: string): Promise<string[]>;
}

/** Folders that never hold application code. */
const SKIPPED_FOLDERS = new Set(['vendor', 'node_modules']);

/** Reads the files of a local folder with Node.js. */
export function nodeProjectFiles(root: string): ProjectFiles {
  const absolute = (path: string): string => join(root, ...path.split('/'));

  return {
    async exists(path) {
      try {
        await stat(absolute(path));
        return true;
      } catch {
        return false;
      }
    },

    async read(path) {
      try {
        return await readFile(absolute(path), 'utf8');
      } catch {
        return null;
      }
    },

    async listPhpFiles(folder) {
      const found: string[] = [];
      await collectPhpFiles(root, folder, found);
      return found.sort();
    },
  };
}

async function collectPhpFiles(root: string, folder: string, found: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(join(root, ...folder.split('/')), { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const path = posix.join(folder, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && !SKIPPED_FOLDERS.has(entry.name)) {
        await collectPhpFiles(root, path, found);
      }
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.php')) {
      found.push(path);
    }
  }
}
