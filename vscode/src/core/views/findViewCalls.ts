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
import { ClassIndex } from '../php/classIndex';
import { NameContext } from '../php/names';
import { parsePhp } from '../php/parser';
import { inferType, typeFromDeclaration, type InferenceContext } from '../types/inferType';
import { MIXED, phpType, type PhpType } from '../types/phpType';

/** A variable a view receives, with the type guessed from the calling code. */
export interface ViewVariable {
  readonly name: string;
  readonly type: PhpType;
}

/** One place in the code that renders a view. */
export interface ViewCall {
  /** View name as CodeIgniter resolves it, e.g. `products/list` (no `.php`). */
  readonly view: string;
  readonly variables: readonly ViewVariable[];
  /** 1-based line of the call. */
  readonly line: number;
}

/** What we know about the variables of one function while walking it. */
interface Scope {
  /** Type of each local variable, e.g. `$product`. */
  readonly variables: Map<string, PhpType>;
  /** Keys known so far for each array variable, e.g. `$data['title']`. */
  readonly arrays: Map<string, Map<string, PhpType>>;
}

/**
 * Finds the view calls in a PHP file:
 * - CodeIgniter 3: `$this->load->view('name', $data)`
 * - CodeIgniter 4: `view('name', $data)`
 *
 * The data can be an inline array or a variable built earlier in the same function
 * (`$data = [...]`, `$data['key'] = ...`). Calls whose view name isn't a plain string are skipped.
 * `classes` gives the types of properties and methods of the project's classes.
 */
export function findViewCalls(
  code: string,
  fileName: string,
  classes: ClassIndex = new ClassIndex(),
): ViewCall[] {
  const calls: ViewCall[] = [];
  const names = new NameContext();
  // The first scope holds the code outside functions, e.g. a view file.
  const scopes: Scope[] = [newScope()];
  const currentScope = (): Scope => scopes.at(-1) ?? newScope();
  const context: InferenceContext = {
    names,
    classes,
    variableType: (name) => currentScope().variables.get(name),
  };

  walk(parsePhp(code, fileName), {
    enter(node) {
      names.enter(node);
      if (isFunctionLike(node)) {
        scopes.push(newScope());
        trackParameters(node, currentScope(), context);
      } else if (node.kind === 'assign') {
        trackAssignment(node, currentScope(), context);
      } else if (node.kind === 'call') {
        const call = readViewCall(node, currentScope(), context);
        if (call !== null) {
          calls.push(call);
        }
      }
    },
    leave(node) {
      if (isFunctionLike(node)) {
        scopes.pop();
      }
      names.leave(node);
    },
  });

  return calls;
}

function newScope(): Scope {
  return { variables: new Map(), arrays: new Map() };
}

function readViewCall(node: PhpNode, scope: Scope, context: InferenceContext): ViewCall | null {
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
    variables: [...readArrayKeys(dataArgument, scope, context)].map(([name, type]) => ({
      name,
      type,
    })),
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

/** Gives each typed parameter its declared type, e.g. `int $id`. */
function trackParameters(node: PhpNode, scope: Scope, context: InferenceContext): void {
  for (const parameter of nodeArray(node.arguments)) {
    const name = identifierName(parameter.name);
    if (name !== null && isNode(parameter.type)) {
      scope.variables.set(
        name,
        typeFromDeclaration(parameter.type, parameter.nullable === true, context),
      );
    }
  }
}

/** Records `$x = ...`, `$data = [...]`, `$data += [...]` and `$data['key'] = ...`. */
function trackAssignment(node: PhpNode, scope: Scope, context: InferenceContext): void {
  const { left, right, operator } = node;
  if (!isNode(right)) {
    return;
  }

  const target = variableName(left);
  if (target !== null) {
    if (operator === '=') {
      scope.variables.set(target, inferType(right, context));
      scope.arrays.set(target, readArrayKeys(right, scope, context));
    } else if (operator === '+=') {
      // `+` keeps the existing keys and only adds the new ones.
      const merged = new Map([
        ...readArrayKeys(right, scope, context),
        ...(scope.arrays.get(target) ?? []),
      ]);
      scope.arrays.set(target, merged);
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

  const keys = scope.arrays.get(arrayName) ?? new Map<string, PhpType>();
  keys.set(key, inferType(right, context));
  scope.arrays.set(arrayName, keys);
  scope.variables.set(arrayName, phpType('array'));
}

/** Returns the string keys and value types of an inline array, or of a tracked array variable. */
function readArrayKeys(
  node: unknown,
  scope: Scope,
  context: InferenceContext,
): Map<string, PhpType> {
  const keys = new Map<string, PhpType>();

  const name = variableName(node);
  if (name !== null) {
    for (const [key, type] of scope.arrays.get(name) ?? []) {
      keys.set(key, type);
    }
    return keys;
  }

  if (!isNode(node) || node.kind !== 'array') {
    return keys;
  }
  for (const item of nodeArray(node.items)) {
    const key = item.kind === 'entry' ? stringValue(item.key) : null;
    if (key !== null) {
      keys.set(key, isNode(item.value) ? inferType(item.value, context) : MIXED);
    }
  }
  return keys;
}
