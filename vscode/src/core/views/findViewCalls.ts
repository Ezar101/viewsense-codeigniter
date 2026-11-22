import {
  identifierName,
  isFunctionLike,
  isNode,
  nodeArray,
  stringValue,
  variableName,
  walk,
  type PhpNode,
} from '../php/ast';
import { parsePhp } from '../php/parser';

/** A variable a view receives, with the PHP expression that gives its value. */
export interface ViewVariable {
  readonly name: string;
  readonly value: PhpNode;
}

/** One place in the code that renders a view. */
export interface ViewCall {
  /** View name as CodeIgniter resolves it, e.g. `products/list` (no `.php`). */
  readonly view: string;
  readonly variables: readonly ViewVariable[];
  /** 1-based line of the call. */
  readonly line: number;
}

/** Keys known so far for each array variable of the current function, e.g. `$data`. */
type ArrayScope = Map<string, Map<string, PhpNode>>;

/**
 * Finds the view calls in a PHP file:
 * - CodeIgniter 3: `$this->load->view('name', $data)`
 * - CodeIgniter 4: `view('name', $data)`
 *
 * The data can be an inline array or a variable built earlier in the same function
 * (`$data = [...]`, `$data['key'] = ...`). Calls whose view name isn't a plain string are skipped.
 */
export function findViewCalls(code: string, fileName: string): ViewCall[] {
  const calls: ViewCall[] = [];
  // The first scope holds the code outside functions, e.g. a view file.
  const scopes: ArrayScope[] = [newScope()];
  const currentScope = (): ArrayScope => scopes.at(-1) ?? newScope();

  walk(parsePhp(code, fileName), {
    enter(node) {
      if (isFunctionLike(node)) {
        scopes.push(newScope());
      } else if (node.kind === 'assign') {
        trackAssignment(node, currentScope());
      } else if (node.kind === 'call') {
        const call = readViewCall(node, currentScope());
        if (call !== null) {
          calls.push(call);
        }
      }
    },
    leave(node) {
      if (isFunctionLike(node)) {
        scopes.pop();
      }
    },
  });

  return calls;
}

function newScope(): ArrayScope {
  return new Map();
}

function readViewCall(node: PhpNode, scope: ArrayScope): ViewCall | null {
  if (!isViewFunction(node.what)) {
    return null;
  }

  const [viewArgument, dataArgument] = nodeArray(node.arguments);
  const view = stringValue(viewArgument);
  if (view === null) {
    return null;
  }

  return {
    view: normalizeViewName(view),
    variables: [...readArrayKeys(dataArgument, scope)].map(([name, value]) => ({ name, value })),
    line: node.loc?.start.line ?? 0,
  };
}

/** True for `view(...)` and for `...->load->view(...)`. */
function isViewFunction(what: unknown): boolean {
  if (!isNode(what)) {
    return false;
  }
  if (what.kind === 'name') {
    return identifierName(what) === 'view';
  }

  return (
    what.kind === 'propertylookup' &&
    identifierName(what.offset) === 'view' &&
    isNode(what.what) &&
    what.what.kind === 'propertylookup' &&
    identifierName(what.what.offset) === 'load'
  );
}

function normalizeViewName(view: string): string {
  return view.trim().replace(/\.php$/i, '');
}

/** Records `$data = [...]`, `$data = $other`, `$data += [...]` and `$data['key'] = ...`. */
function trackAssignment(node: PhpNode, scope: ArrayScope): void {
  const { left, right, operator } = node;
  if (!isNode(right)) {
    return;
  }

  const target = variableName(left);
  if (target !== null) {
    if (operator === '=') {
      scope.set(target, readArrayKeys(right, scope));
    } else if (operator === '+=') {
      // `+` keeps the existing keys and only adds the new ones.
      const merged = new Map([...readArrayKeys(right, scope), ...(scope.get(target) ?? [])]);
      scope.set(target, merged);
    }
    return;
  }

  if (operator !== '=' || !isNode(left) || left.kind !== 'offsetlookup') {
    return;
  }
  const arrayName = variableName(left.what);
  const key = stringValue(left.offset);
  if (arrayName === null || key === null) {
    return;
  }

  const keys = scope.get(arrayName) ?? new Map<string, PhpNode>();
  keys.set(key, right);
  scope.set(arrayName, keys);
}

/** Returns the string keys of an inline array, or of an array variable tracked in scope. */
function readArrayKeys(node: unknown, scope: ArrayScope): Map<string, PhpNode> {
  const keys = new Map<string, PhpNode>();

  const name = variableName(node);
  if (name !== null) {
    for (const [key, value] of scope.get(name) ?? []) {
      keys.set(key, value);
    }
    return keys;
  }

  if (!isNode(node) || node.kind !== 'array') {
    return keys;
  }
  for (const item of nodeArray(node.items)) {
    const key = item.kind === 'entry' ? stringValue(item.key) : null;
    if (key !== null && isNode(item.value)) {
      keys.set(key, item.value);
    }
  }
  return keys;
}
