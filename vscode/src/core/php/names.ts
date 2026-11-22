import { identifierName, isNode, nodeArray, type PhpNode } from './ast';

/**
 * Resolves class names the way PHP does, from the current namespace and `use` imports.
 * Filled while walking a file: call `enter()` for each node, `leave()` when leaving it.
 */
export class NameContext {
  private namespace = '';
  /** Lowercase alias to fully qualified name, e.g. `product` to `App\Entities\Product`. */
  private readonly imports = new Map<string, string>();
  /** Classes being walked, innermost last. An empty name stands for an anonymous class. */
  private readonly classes: { name: string; parent: string | null }[] = [];

  enter(node: PhpNode): void {
    if (node.kind === 'namespace' && typeof node.name === 'string') {
      this.namespace = node.name;
      this.imports.clear();
    } else if (node.kind === 'usegroup') {
      this.addImports(node);
    } else if (node.kind === 'class') {
      const name = identifierName(node.name);
      const parent = isNode(node.extends) ? this.resolveClass(node.extends) : null;
      // Anonymous classes have no name: `self` inside them stays unknown.
      this.classes.push({ name: name === null ? '' : this.qualify(name), parent });
    }
  }

  leave(node: PhpNode): void {
    if (node.kind === 'class') {
      this.classes.pop();
    }
  }

  /** Fully qualified name of the class being walked, or `null` outside a class. */
  get currentClass(): string | null {
    const current = this.classes.at(-1)?.name;
    return current === undefined || current === '' ? null : current;
  }

  /** Fully qualified name of the parent of the class being walked, or `null`. */
  get parentClass(): string | null {
    return this.classes.at(-1)?.parent ?? null;
  }

  /** Resolves a class name written as text, e.g. in a docblock: `Product`, `\App\Product`. */
  resolveName(name: string): string {
    return name.startsWith('\\') ? name.slice(1) : this.resolveImported(name);
  }

  /**
   * Resolves a class name node (`Product`, `Sub\Thing`, `\App\Product`, `self`) to its fully
   * qualified name without the leading backslash, or `null` when it can't be known.
   */
  resolveClass(node: PhpNode): string | null {
    if (node.kind === 'selfreference' || node.kind === 'staticreference') {
      return this.currentClass;
    }
    if (node.kind === 'parentreference') {
      return this.parentClass;
    }
    if (node.kind !== 'name' || typeof node.name !== 'string') {
      return null;
    }

    const name = node.name;
    switch (node.resolution) {
      case 'fqn':
        return name.replace(/^\\/, '');
      case 'rn':
        // `namespace\Foo` is relative to the current namespace.
        return this.qualify(name.replace(/^namespace\\/i, ''));
      default:
        return this.resolveImported(name);
    }
  }

  private resolveImported(name: string): string {
    const [first = '', ...rest] = name.split('\\');
    const imported = this.imports.get(first.toLowerCase());
    if (imported === undefined) {
      return this.qualify(name);
    }
    return [imported, ...rest].join('\\');
  }

  private qualify(name: string): string {
    return this.namespace === '' ? name : `${this.namespace}\\${name}`;
  }

  private addImports(group: PhpNode): void {
    // `use function` and `use const` import functions and constants, not classes.
    if (typeof group.type === 'string') {
      return;
    }
    const prefix = typeof group.name === 'string' ? `${group.name.replace(/^\\/, '')}\\` : '';

    for (const item of nodeArray(group.items)) {
      if (typeof item.name !== 'string' || typeof item.type === 'string') {
        continue;
      }
      const fullName = prefix + item.name.replace(/^\\/, '');
      const alias = isNode(item.alias) ? identifierName(item.alias) : null;
      const shortName = alias ?? fullName.split('\\').at(-1) ?? fullName;
      this.imports.set(shortName.toLowerCase(), fullName);
    }
  }
}

/** Writes a class name the way a view file (which has no namespace) must refer to it. */
export function classTypeName(fullyQualifiedName: string): string {
  return fullyQualifiedName.includes('\\') ? `\\${fullyQualifiedName}` : fullyQualifiedName;
}
