import { isNode, nodeArray, type PhpNode } from '../php/ast';
import { classTypeName, type NameContext } from '../php/names';
import { MIXED, phpType, unionTypes, type PhpType } from './phpType';

export interface InferenceContext {
  readonly names: NameContext;
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
      return typeof node.name === 'string' ? (context.variableType(node.name) ?? MIXED) : MIXED;
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
