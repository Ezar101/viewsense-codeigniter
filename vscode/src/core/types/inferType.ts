import { identifierName, isNode, nodeArray, stringValue, type PhpNode } from '../php/ast';
import type { ClassIndex } from '../php/classIndex';
import { classTypeName, type NameContext } from '../php/names';
import { MIXED, phpType, unionTypes, type PhpType } from './phpType';

export interface InferenceContext {
  readonly names: NameContext;
  /** Classes of the project, to read property and method types. */
  readonly classes: ClassIndex;
  /** Type of a local variable known at this point, e.g. `$product`. */
  variableType(name: string): PhpType | undefined;
}

/** PHP keywords that can be used as a type and keep their own name. */
const BUILTIN_TYPES = new Set([
  'array',
  'bool',
  'callable',
  'false',
  'float',
  'int',
  'iterable',
  'mixed',
  'null',
  'object',
  'string',
  'true',
  'void',
]);

const CAST_TYPES: Readonly<Record<string, string>> = {
  int: 'int',
  integer: 'int',
  bool: 'bool',
  boolean: 'bool',
  float: 'float',
  double: 'float',
  real: 'float',
  string: 'string',
  binary: 'string',
  array: 'array',
  object: 'object',
  unset: 'null',
};

const BOOLEAN_OPERATORS = new Set([
  '==',
  '===',
  '!=',
  '!==',
  '<>',
  '<',
  '>',
  '<=',
  '>=',
  '&&',
  '||',
  'and',
  'or',
  'xor',
  'instanceof',
]);

/** Guesses the type of a PHP expression. Returns `mixed` when it can't tell. */
export function inferType(node: PhpNode, context: InferenceContext): PhpType {
  switch (node.kind) {
    case 'string':
    case 'encapsed':
    case 'nowdoc':
      return phpType('string');
    case 'number':
      return phpType(isFloatLiteral(node.value) ? 'float' : 'int');
    case 'boolean':
      return phpType('bool');
    case 'nullkeyword':
      return phpType('null');
    case 'array':
      return phpType('array');
    case 'cast':
      return phpType(CAST_TYPES[String(node.type)] ?? 'mixed');
    case 'new':
      return inferNew(node, context);
    case 'variable':
      return inferVariable(node, context);
    case 'propertylookup':
    case 'nullsafepropertylookup':
      return inferProperty(node, context);
    case 'call':
      return inferCall(node, context);
    case 'staticlookup':
      // `Product::class` is the class name as a string.
      return identifierName(node.offset) === 'class' ? phpType('string') : MIXED;
    case 'retif':
      return inferTernary(node, context);
    case 'bin':
      return inferBinary(node, context);
    case 'unary':
      return inferUnary(node, context);
    default:
      return MIXED;
  }
}

/**
 * Reads a declared type: a parameter or property type such as `?int`, `Product|null`.
 * `nullable` is true for the `?Type` form.
 */
export function typeFromDeclaration(
  typeNode: unknown,
  nullable: boolean,
  context: InferenceContext,
): PhpType {
  if (!isNode(typeNode)) {
    return MIXED;
  }
  const declared = readDeclaredType(typeNode, context);
  return nullable ? unionTypes(declared, phpType('null')) : declared;
}

function readDeclaredType(node: PhpNode, context: InferenceContext): PhpType {
  if (node.kind === 'uniontype') {
    return unionTypes(...nodeArray(node.types).map((type) => readDeclaredType(type, context)));
  }
  if (node.kind === 'typereference' && typeof node.name === 'string') {
    const name = node.name.toLowerCase();
    if (name === 'self' || name === 'static') {
      return classType(context.names.currentClass);
    }
    return phpType(BUILTIN_TYPES.has(name) ? name : 'mixed');
  }
  return classType(context.names.resolveClass(node));
}

function inferVariable(node: PhpNode, context: InferenceContext): PhpType {
  if (typeof node.name !== 'string') {
    return MIXED;
  }
  if (node.name === 'this') {
    return classType(context.names.currentClass);
  }
  return context.variableType(node.name) ?? MIXED;
}

/** `$this->products`, `$product->category`, `$order?->customer`. */
function inferProperty(node: PhpNode, context: InferenceContext): PhpType {
  const property = identifierName(node.offset);
  if (property === null || !isNode(node.what)) {
    return MIXED;
  }

  const type = isThis(node.what)
    ? thisPropertyType(property, context)
    : memberType(inferType(node.what, context), (className) =>
        context.classes.propertyType(className, property),
      );
  return node.kind === 'nullsafepropertylookup' ? unionTypes(type, phpType('null')) : type;
}

/**
 * A property of `$this`. Outside a known class (a CodeIgniter 3 view, where `$this` is the
 * loader), or for a property the class doesn't declare, CodeIgniter 3 gives access to what the
 * loader loaded.
 */
function thisPropertyType(property: string, context: InferenceContext): PhpType {
  const className = context.names.currentClass;
  const declared =
    className === null ? undefined : context.classes.propertyType(className, property);
  return declared ?? context.classes.instanceProperty(property) ?? MIXED;
}

/** Method calls (`$model->find()`), static calls (`Product::make()`) and `model()`. */
function inferCall(node: PhpNode, context: InferenceContext): PhpType {
  const what = node.what;
  if (!isNode(what)) {
    return MIXED;
  }

  if (what.kind === 'name') {
    return inferFunctionCall(identifierName(what), nodeArray(node.arguments), context);
  }

  const method = identifierName(what.offset);
  if (method === null || !isNode(what.what)) {
    return MIXED;
  }
  if (what.kind === 'staticlookup') {
    return memberType(classType(context.names.resolveClass(what.what)), (className) =>
      context.classes.methodReturnType(className, method),
    );
  }
  if (what.kind === 'propertylookup' || what.kind === 'nullsafepropertylookup') {
    const type = memberType(inferType(what.what, context), (className) =>
      context.classes.methodReturnType(className, method),
    );
    return what.kind === 'nullsafepropertylookup' ? unionTypes(type, phpType('null')) : type;
  }
  return MIXED;
}

/** CodeIgniter 4 `model('ProductModel')` and `model(ProductModel::class)` give the model. */
function inferFunctionCall(
  name: string | null,
  args: PhpNode[],
  context: InferenceContext,
): PhpType {
  if (name?.toLowerCase() !== 'model' || args[0] === undefined) {
    return MIXED;
  }
  const argument = args[0];

  if (argument.kind === 'staticlookup' && identifierName(argument.offset) === 'class') {
    return isNode(argument.what) ? classType(context.names.resolveClass(argument.what)) : MIXED;
  }

  const text = stringValue(argument);
  if (text === null) {
    return MIXED;
  }
  if (text.includes('\\')) {
    return classType(text.replace(/^\\/, ''));
  }
  const found = context.classes.findByShortName(text);
  return classType(found?.name ?? null);
}

/**
 * Applies a member lookup to each class of a type. `null` alternatives are ignored, as a call on
 * them would fail anyway. Returns `mixed` as soon as one alternative is unknown.
 */
function memberType(
  receiver: PhpType,
  lookup: (className: string) => PhpType | undefined,
): PhpType {
  const types: PhpType[] = [];
  for (const alternative of receiver) {
    if (alternative === 'null') {
      continue;
    }
    const type = isClassName(alternative) ? lookup(alternative) : undefined;
    if (type === undefined) {
      return MIXED;
    }
    types.push(type);
  }
  return types.length === 0 ? MIXED : unionTypes(...types);
}

function isThis(node: PhpNode): boolean {
  return node.kind === 'variable' && node.name === 'this';
}

function isClassName(type: string): boolean {
  return !type.endsWith('[]') && !BUILTIN_TYPES.has(type);
}

function inferNew(node: PhpNode, context: InferenceContext): PhpType {
  return isNode(node.what) ? classType(context.names.resolveClass(node.what)) : MIXED;
}

function inferTernary(node: PhpNode, context: InferenceContext): PhpType {
  // `$a ?: $b` has no true branch: the value is then the test itself.
  const whenTrue = isNode(node.trueExpr) ? node.trueExpr : node.test;
  if (!isNode(whenTrue) || !isNode(node.falseExpr)) {
    return MIXED;
  }
  return unionTypes(inferType(whenTrue, context), inferType(node.falseExpr, context));
}

function inferBinary(node: PhpNode, context: InferenceContext): PhpType {
  const operator = String(node.type);
  if (operator === '.') {
    return phpType('string');
  }
  if (BOOLEAN_OPERATORS.has(operator)) {
    return phpType('bool');
  }
  if (operator === '??' && isNode(node.left) && isNode(node.right)) {
    // When the left side is null, `??` returns the right side instead.
    const left = inferType(node.left, context).filter((name) => name !== 'null');
    return unionTypes(left, inferType(node.right, context));
  }
  return MIXED;
}

function inferUnary(node: PhpNode, context: InferenceContext): PhpType {
  if (node.type === '!') {
    return phpType('bool');
  }
  if ((node.type === '-' || node.type === '+') && isNode(node.what)) {
    return inferType(node.what, context);
  }
  return MIXED;
}

function classType(fullyQualifiedName: string | null): PhpType {
  return fullyQualifiedName === null ? MIXED : phpType(classTypeName(fullyQualifiedName));
}

function isFloatLiteral(value: unknown): boolean {
  const text = String(value).toLowerCase();
  if (text.startsWith('0x') || text.startsWith('0b')) {
    return false;
  }
  return /[.e]/.test(text);
}
