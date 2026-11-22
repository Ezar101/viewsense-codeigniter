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
import { itemTypeOf, MIXED, phpType, type PhpType } from '../types/phpType';

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
  /** Fully qualified name of the class the call is in, or `null` (e.g. in a view). */
  readonly fromClass: string | null;
}

/** Variables shared with every view rendered after them: CodeIgniter 3 `$this->load->vars()`. */
export interface SharedVariables {
  /** Class the call is in: the variables reach the views this class and its children render. */
  readonly fromClass: string | null;
  readonly variables: readonly ViewVariable[];
}

export interface FileAnalysis {
  readonly calls: ViewCall[];
  readonly shared: SharedVariables[];
}

export interface AnalyzeOptions {
  /** Classes of the project, to type `$this->model->method()`. */
  readonly classes?: ClassIndex;
  /** Variables known at the top of the file: for a view, the variables it receives. */
  readonly initialVariables?: ReadonlyMap<string, PhpType>;
}

/** What we know about the variables of one function while walking it. */
interface Scope {
  /** Type of each local variable, e.g. `$product`. */
  readonly variables: Map<string, PhpType>;
  /** Keys known so far for each array variable, e.g. `$data['title']`. */
  readonly arrays: Map<string, Map<string, PhpType>>;
  /** Data set so far on each CodeIgniter 4 renderer variable, e.g. `$renderer->setVar()`. */
  readonly renderers: Map<string, Map<string, PhpType>>;
}

type Keys = Map<string, PhpType>;

/** Finds the view calls of a PHP file. See `analyzeViewFile()`. */
export function findViewCalls(
  code: string,
  fileName: string,
  classes: ClassIndex = new ClassIndex(),
): ViewCall[] {
  return analyzeViewFile(code, fileName, { classes }).calls;
}

/**
 * Finds what a PHP file passes to views:
 * - CodeIgniter 3: `$this->load->view('name', $data)` and `$this->load->vars($data)`
 * - CodeIgniter 4: `view('name', $data)`, `$this->include('name')` in a view, and the renderer
 *   service: `$renderer->setVar()`, `->setData()`, then `->render('name')`
 *
 * The data can be an inline array or a variable built earlier in the same function
 * (`$data = [...]`, `$data['key'] = ...`). Calls whose view name isn't a plain string are skipped.
 */
export function analyzeViewFile(
  code: string,
  fileName: string,
  options: AnalyzeOptions = {},
): FileAnalysis {
  const calls: ViewCall[] = [];
  const shared: SharedVariables[] = [];
  const names = new NameContext();
  // The first scope holds the code outside functions, e.g. a view file.
  const topScope = newScope();
  for (const [name, type] of options.initialVariables ?? []) {
    topScope.variables.set(name, type);
  }
  const scopes: Scope[] = [topScope];
  const currentScope = (): Scope => scopes.at(-1) ?? newScope();
  const context: InferenceContext = {
    names,
    classes: options.classes ?? new ClassIndex(),
    variableType: (name) => currentScope().variables.get(name),
  };

  const addCall = (node: PhpNode, view: string, keys: Keys): void => {
    calls.push({
      view: normalizeViewName(view),
      variables: toVariables(keys),
      line: node.loc?.start.line ?? 0,
      fromClass: names.currentClass,
    });
  };

  walk(parsePhp(code, fileName), {
    enter(node) {
      names.enter(node);
      const scope = currentScope();
      if (isFunctionLike(node)) {
        scopes.push(newScope());
        trackParameters(node, currentScope(), context);
      } else if (node.kind === 'assign') {
        trackAssignment(node, scope, context);
      } else if (node.kind === 'foreach') {
        trackForeach(node, scope, context);
      } else if (node.kind === 'call') {
        readCall(node, scope, context, addCall, (variables) => {
          shared.push({ fromClass: names.currentClass, variables: toVariables(variables) });
        });
      }
    },
    leave(node) {
      if (isFunctionLike(node)) {
        scopes.pop();
      }
      names.leave(node);
    },
  });

  return { calls, shared };
}

function newScope(): Scope {
  return { variables: new Map(), arrays: new Map(), renderers: new Map() };
}

function toVariables(keys: Keys): ViewVariable[] {
  return [...keys].map(([name, type]) => ({ name, type }));
}

function normalizeViewName(view: string): string {
  return view.trim().replace(/\.php$/i, '');
}

/** Reads one function or method call and reports what it passes to views. */
function readCall(
  node: PhpNode,
  scope: Scope,
  context: InferenceContext,
  addCall: (node: PhpNode, view: string, keys: Keys) => void,
  addShared: (keys: Keys) => void,
): void {
  const what = node.what;
  const args = nodeArray(node.arguments);
  if (!isNode(what)) {
    return;
  }

  // view('name', $data)
  if (what.kind === 'name') {
    const view = stringValue(args[0]);
    if (identifierName(what) === 'view' && view !== null) {
      addCall(node, view, readArrayKeys(args[1], scope, context));
    }
    return;
  }

  if (what.kind !== 'propertylookup' || !isNode(what.what)) {
    return;
  }
  const method = identifierName(what.offset);
  const receiver = what.what;

  if (isLoader(receiver)) {
    const view = stringValue(args[0]);
    if (method === 'view' && view !== null) {
      // ->load->view('name', $data)
      addCall(node, view, readArrayKeys(args[1], scope, context));
    } else if (method === 'vars') {
      // ->load->vars($data) or ->load->vars('name', $value)
      addShared(readLoaderVars(args, scope, context));
    }
    return;
  }

  if (method === 'include' && variableName(receiver) === 'this') {
    // $this->include('name') in a CodeIgniter 4 view: the partial gets the view's own data.
    const view = stringValue(args[0]);
    if (view !== null) {
      addCall(node, view, new Map());
    }
    return;
  }

  if (method === 'render') {
    const view = stringValue(args[0]);
    const data = rendererData(receiver, scope, context);
    if (view !== null && data !== null) {
      addCall(node, view, data);
    }
  } else if (method === 'setVar' || method === 'setData') {
    // Remember the data on the renderer variable, for a later `$renderer->render()`.
    const base = chainBaseVariable(receiver);
    const data = rendererData(node, scope, context);
    if (base !== null && data !== null) {
      scope.renderers.set(base, data);
    }
  }
}

/** True for `$this->load` and `get_instance()->load`. */
function isLoader(node: PhpNode): boolean {
  return node.kind === 'propertylookup' && identifierName(node.offset) === 'load';
}

function readLoaderVars(args: PhpNode[], scope: Scope, context: InferenceContext): Keys {
  const name = stringValue(args[0]);
  if (name === null) {
    return readArrayKeys(args[0], scope, context);
  }
  const value = args[1];
  return new Map([[name, value === undefined ? MIXED : inferType(value, context)]]);
}

/**
 * Data held by a CodeIgniter 4 renderer expression, or `null` when the expression isn't a
 * renderer: a renderer variable, `service('renderer')`, or a chain of `setVar()`/`setData()`.
 */
function rendererData(node: PhpNode, scope: Scope, context: InferenceContext): Keys | null {
  const name = variableName(node);
  if (name !== null) {
    const data = scope.renderers.get(name);
    return data === undefined ? null : new Map(data);
  }
  if (isRendererService(node)) {
    return new Map();
  }
  if (node.kind !== 'call' || !isNode(node.what) || node.what.kind !== 'propertylookup') {
    return null;
  }

  const method = identifierName(node.what.offset);
  if (method !== 'setVar' && method !== 'setData') {
    return null;
  }
  // A setVar() chain on something we don't know (e.g. `$this->renderer`) still is a renderer.
  const data =
    (isNode(node.what.what) ? rendererData(node.what.what, scope, context) : null) ??
    new Map<string, PhpType>();
  const args = nodeArray(node.arguments);
  if (method === 'setData') {
    for (const [key, type] of readArrayKeys(args[0], scope, context)) {
      data.set(key, type);
    }
  } else {
    const key = stringValue(args[0]);
    const value = args[1];
    if (key !== null) {
      data.set(key, value === undefined ? MIXED : inferType(value, context));
    }
  }
  return data;
}

/** `service('renderer')`, `single_service('renderer')` and `Services::renderer()`. */
function isRendererService(node: PhpNode): boolean {
  if (node.kind !== 'call' || !isNode(node.what)) {
    return false;
  }
  const function_ = identifierName(node.what);
  if (node.what.kind === 'name' && (function_ === 'service' || function_ === 'single_service')) {
    return stringValue(nodeArray(node.arguments)[0]) === 'renderer';
  }
  return node.what.kind === 'staticlookup' && identifierName(node.what.offset) === 'renderer';
}

/** The variable at the start of a method chain: `$renderer` in `$renderer->setVar()->setVar()`. */
function chainBaseVariable(node: PhpNode): string | null {
  let current: unknown = node;
  while (isNode(current)) {
    const name = variableName(current);
    if (name !== null) {
      return name;
    }
    if (current.kind !== 'call' || !isNode(current.what)) {
      return null;
    }
    current = current.what.what;
  }
  return null;
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

/** `foreach ($products as $product)`: `$product` gets the item type of `$products`. */
function trackForeach(node: PhpNode, scope: Scope, context: InferenceContext): void {
  const value = variableName(node.value);
  if (value === null || !isNode(node.source)) {
    return;
  }
  scope.variables.set(value, itemTypeOf(inferType(node.source, context)));
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
      const renderer = rendererData(right, scope, context);
      if (renderer === null) {
        scope.renderers.delete(target);
      } else {
        scope.renderers.set(target, renderer);
      }
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
function readArrayKeys(node: unknown, scope: Scope, context: InferenceContext): Keys {
  const keys: Keys = new Map();

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
