import { inferType, typeFromDeclaration, type InferenceContext } from '../types/inferType';
import { parseDocType } from '../types/docType';
import { phpType, unionTypes, type PhpType } from '../types/phpType';
import {
  identifierName,
  isFunctionLike,
  isNode,
  nodeArray,
  stringValue,
  variableName,
  walk,
  type PhpNode,
} from './ast';
import { ClassIndex, type ClassInfo } from './classIndex';
import { docTagsOf, parseMethodTag, parsePropertyTag } from './docblock';
import { classTypeName, NameContext } from './names';
import { parsePhp } from './parser';

/** A class being read, filled while walking its body. */
interface ClassBuilder {
  readonly name: string;
  readonly parent: string | null;
  readonly properties: Map<string, PhpType>;
  readonly methods: Map<string, PhpType>;
  /** Types of `$this->x = ...` assignments, used for properties without a declared type. */
  readonly assigned: Map<string, PhpType>;
  modelReturnType: PhpType | null;
}

/** Builds the class index of a whole project from its PHP files. */
export function buildClassIndex(files: Iterable<{ code: string; path: string }>): ClassIndex {
  const index = new ClassIndex();
  for (const { code, path } of files) {
    indexFile(code, path, index);
  }
  return index;
}

/**
 * Adds the classes of one file to the index, and the properties that CodeIgniter 3 loader calls
 * (`$this->load->model()`, `->library()`, `->database()`) add to the CodeIgniter instance.
 */
export function indexFile(code: string, fileName: string, index: ClassIndex): void {
  const names = new NameContext();
  const builders: ClassBuilder[] = [];
  let functionDepth = 0;
  // Declared types only depend on names: other classes aren't needed yet.
  const context: InferenceContext = {
    names,
    classes: new ClassIndex(),
    variableType: () => undefined,
  };

  walk(parsePhp(code, fileName), {
    enter(node) {
      names.enter(node);
      if (node.kind === 'class') {
        builders.push(readClass(node, names, context));
      } else if (isFunctionLike(node)) {
        functionDepth += 1;
      } else if (node.kind === 'call') {
        trackLoaderCall(node, index);
      } else if (node.kind === 'assign' && functionDepth > 0) {
        trackPropertyAssignment(node, builders.at(-1), context);
      }
    },
    leave(node) {
      if (node.kind === 'class') {
        const builder = builders.pop();
        if (builder !== undefined && builder.name !== '') {
          index.add(finishClass(builder));
        }
      } else if (isFunctionLike(node)) {
        functionDepth -= 1;
      }
      names.leave(node);
    },
  });
}

function readClass(node: PhpNode, names: NameContext, context: InferenceContext): ClassBuilder {
  const builder: ClassBuilder = {
    name: names.currentClass ?? '',
    parent: names.parentClass,
    properties: new Map(),
    methods: new Map(),
    assigned: new Map(),
    modelReturnType: null,
  };
  const docType = (text: string): PhpType =>
    parseDocType(text, (name) => names.resolveName(name), names.currentClass);

  // Class docblock first: a declared property or method below takes over.
  for (const tag of docTagsOf(node)) {
    if (tag.name.startsWith('property')) {
      const property = parsePropertyTag(tag.text);
      if (property !== null) {
        builder.properties.set(property.name, docType(property.type));
      }
    } else if (tag.name === 'method') {
      const method = parseMethodTag(tag.text);
      if (method !== null) {
        builder.methods.set(method.name.toLowerCase(), docType(method.type));
      }
    }
  }

  for (const member of nodeArray(node.body)) {
    if (member.kind === 'propertystatement') {
      readProperties(member, builder, docType, context);
    } else if (member.kind === 'method') {
      readMethod(member, builder, docType, context);
    }
  }
  return builder;
}

function readProperties(
  statement: PhpNode,
  builder: ClassBuilder,
  docType: (text: string) => PhpType,
  context: InferenceContext,
): void {
  const varTag = docTagsOf(statement).find((tag) => tag.name === 'var');

  for (const property of nodeArray(statement.properties)) {
    const name = identifierName(property.name);
    if (name === null) {
      continue;
    }
    if (name === 'returnType') {
      builder.modelReturnType = readModelReturnType(property.value, context);
    }

    if (isNode(property.type)) {
      builder.properties.set(
        name,
        typeFromDeclaration(property.type, property.nullable === true, context),
      );
    } else if (varTag !== undefined) {
      // `@var Type` or `@var Type $name`: only the type matters here.
      builder.properties.set(name, docType(varTag.text.split(/\s+/)[0] ?? ''));
    }
  }
}

function readMethod(
  method: PhpNode,
  builder: ClassBuilder,
  docType: (text: string) => PhpType,
  context: InferenceContext,
): void {
  const name = identifierName(method.name);
  if (name === null) {
    return;
  }

  // `@return Product[]` says more than the native `: array`, so it wins.
  const returnTag = docTagsOf(method).find((tag) => tag.name === 'return');
  if (returnTag !== undefined) {
    builder.methods.set(name.toLowerCase(), docType(returnTag.text.split(/\s+/)[0] ?? ''));
  } else if (isNode(method.type)) {
    builder.methods.set(
      name.toLowerCase(),
      typeFromDeclaration(method.type, method.nullable === true, context),
    );
  }
}

/** `protected $returnType = Product::class;` or `= 'array';` in a CodeIgniter 4 model. */
function readModelReturnType(value: unknown, context: InferenceContext): PhpType | null {
  if (!isNode(value)) {
    return null;
  }
  if (value.kind === 'staticlookup' && identifierName(value.offset) === 'class') {
    const name = isNode(value.what) ? context.names.resolveClass(value.what) : null;
    return name === null ? null : phpType(classTypeName(name));
  }

  const text = stringValue(value);
  if (text === null) {
    return null;
  }
  if (text === 'array' || text === 'object') {
    return phpType(text);
  }
  return phpType(classTypeName(text.replace(/^\\/, '')));
}

/** `$this->products = model(ProductModel::class);` gives a type to an untyped property. */
function trackPropertyAssignment(
  node: PhpNode,
  builder: ClassBuilder | undefined,
  context: InferenceContext,
): void {
  const { left, right } = node;
  if (builder === undefined || node.operator !== '=' || !isNode(left) || !isNode(right)) {
    return;
  }
  if (left.kind !== 'propertylookup' || variableName(left.what) !== 'this') {
    return;
  }
  const name = identifierName(left.offset);
  if (name === null) {
    return;
  }

  const type = inferType(right, context);
  const known = builder.assigned.get(name);
  builder.assigned.set(name, known === undefined ? type : unionTypes(known, type));
}

function finishClass(builder: ClassBuilder): ClassInfo {
  const properties = new Map(builder.properties);
  for (const [name, type] of builder.assigned) {
    if (!properties.has(name)) {
      properties.set(name, type);
    }
  }
  return {
    name: builder.name,
    parent: builder.parent,
    properties,
    methods: builder.methods,
    modelReturnType: builder.modelReturnType,
  };
}

/** Records what `...->load->model()`, `->library()` and `->database()` add in CodeIgniter 3. */
function trackLoaderCall(node: PhpNode, index: ClassIndex): void {
  const what = node.what;
  if (!isNode(what) || what.kind !== 'propertylookup' || !isNode(what.what)) {
    return;
  }
  if (what.what.kind !== 'propertylookup' || identifierName(what.what.offset) !== 'load') {
    return;
  }

  const method = identifierName(what.offset)?.toLowerCase();
  const args = nodeArray(node.arguments);
  if (method === 'model') {
    // load->model('Product_model', 'products'): the alias is the second argument.
    for (const { name, alias } of loadedNames(args[0], stringValue(args[1]))) {
      addLoaded(index, name, alias, false);
    }
  } else if (method === 'library') {
    // load->library('cart', $config, 'basket'): the alias is the third argument.
    for (const { name, alias } of loadedNames(args[0], stringValue(args[2]))) {
      addLoaded(index, name, alias, true);
    }
  } else if (method === 'database') {
    index.addInstanceProperty('db', phpType(classTypeName('CI_DB_query_builder')));
  }
}

/**
 * CodeIgniter 3 rules: the class name is the file name with a capital first letter. A model is
 * reached by its name as written, a library by its name in lowercase, unless an alias is given.
 */
function addLoaded(
  index: ClassIndex,
  path: string,
  alias: string | null,
  lowercase: boolean,
): void {
  const fileName = path.split('/').at(-1) ?? path;
  if (fileName === '') {
    return;
  }
  const className = fileName.charAt(0).toUpperCase() + fileName.slice(1);
  const property = alias ?? (lowercase ? fileName.toLowerCase() : fileName);
  index.addInstanceProperty(property, phpType(classTypeName(className)));
}

/**
 * What a loader call loads: `'cart'` with its alias argument, or an array such as
 * `['cart', 'product_model' => 'products']` where a string key is the name and its value the alias.
 */
function loadedNames(
  node: unknown,
  alias: string | null,
): { name: string; alias: string | null }[] {
  const single = stringValue(node);
  if (single !== null) {
    return [{ name: single, alias }];
  }
  if (!isNode(node) || node.kind !== 'array') {
    return [];
  }

  const loaded: { name: string; alias: string | null }[] = [];
  for (const item of nodeArray(node.items)) {
    const key = item.kind === 'entry' ? stringValue(item.key) : null;
    const value = stringValue(item.kind === 'entry' ? item.value : item);
    if (key !== null) {
      loaded.push({ name: key, alias: value });
    } else if (value !== null) {
      loaded.push({ name: value, alias: null });
    }
  }
  return loaded;
}
