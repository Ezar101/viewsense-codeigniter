import { arrayOf } from '../types/docType';
import { phpType, unionTypes, type PhpType } from '../types/phpType';
import { classTypeName } from './names';

/** What ViewSense knows about one class of the project. */
export interface ClassInfo {
  /** Fully qualified name without the leading backslash, e.g. `App\Models\ProductModel`. */
  readonly name: string;
  readonly parent: string | null;
  /** Type of each property, e.g. `products` to `Product_model`. */
  readonly properties: ReadonlyMap<string, PhpType>;
  /** Return type of each method, keyed by its lowercase name (PHP method names ignore case). */
  readonly methods: ReadonlyMap<string, PhpType>;
  /** CodeIgniter 4 model `$returnType`, e.g. `\App\Entities\Product`, or `null` if not set. */
  readonly modelReturnType: PhpType | null;
}

const CODEIGNITER_4_MODEL = 'codeigniter\\model';

/** CodeIgniter 4 model methods that return the model itself, so calls can be chained. */
const MODEL_CHAIN_METHODS = new Set([
  'select',
  'where',
  'orwhere',
  'wherein',
  'wherenotin',
  'like',
  'orlike',
  'join',
  'groupby',
  'having',
  'orderby',
  'limit',
  'offset',
  'withdeleted',
  'onlydeleted',
]);

/** Guards against `class A extends B` / `class B extends A` loops in broken code. */
const MAX_PARENTS = 32;

/** Classes of a project, to find the type of a property or of a method's return value. */
export class ClassIndex {
  private readonly classes = new Map<string, ClassInfo>();
  /**
   * CodeIgniter 3 adds what `$this->load->model()` and `->library()` load to the
   * CodeIgniter instance, so any controller, model or view can reach it through `$this`.
   */
  private readonly instanceProperties = new Map<string, PhpType>();

  add(info: ClassInfo): void {
    this.classes.set(key(info.name), info);
  }

  addInstanceProperty(name: string, type: PhpType): void {
    const known = this.instanceProperties.get(name);
    this.instanceProperties.set(name, known === undefined ? type : unionTypes(known, type));
  }

  instanceProperty(name: string): PhpType | undefined {
    return this.instanceProperties.get(name);
  }

  /** Accepts a type name as written in a `PhpType`, e.g. `\App\Models\ProductModel`. */
  find(name: string): ClassInfo | undefined {
    return this.classes.get(key(name));
  }

  /**
   * Finds a class by its short name, as `model('ProductModel')` does in CodeIgniter 4.
   * Returns `null` when no class or several classes have that name.
   */
  findByShortName(shortName: string): ClassInfo | null {
    const wanted = shortName.toLowerCase();
    const matches = [...this.classes.values()].filter(
      (info) => (info.name.split('\\').at(-1) ?? '').toLowerCase() === wanted,
    );
    return matches.length === 1 ? (matches[0] ?? null) : null;
  }

  /** Type of a property, looking in parent classes too. */
  propertyType(className: string, property: string): PhpType | undefined {
    for (const info of this.ancestors(className)) {
      const type = info.properties.get(property);
      if (type !== undefined) {
        return type;
      }
    }
    return undefined;
  }

  /** Return type of a method, looking in parent classes and in CodeIgniter 4 models. */
  methodReturnType(className: string, method: string): PhpType | undefined {
    const name = method.toLowerCase();
    const chain = this.ancestors(className);
    for (const info of chain) {
      const type = info.methods.get(name);
      if (type !== undefined) {
        return type;
      }
    }

    const last = chain.at(-1);
    if (last !== undefined && key(last.parent ?? '') === CODEIGNITER_4_MODEL) {
      return modelMethodType(chain, name);
    }
    return undefined;
  }

  /** Everything CodeIgniter 3 loaded into its instance, by property name. */
  get loadedProperties(): ReadonlyMap<string, PhpType> {
    return this.instanceProperties;
  }

  /** Classes that extend `ancestor`, directly or through other project classes. */
  subclassesOf(ancestor: string): ClassInfo[] {
    const wanted = key(ancestor);
    return [...this.classes.values()].filter((info) =>
      this.ancestors(info.name).some((parent) => key(parent.parent ?? '') === wanted),
    );
  }

  /** Properties of a class and its parents. A child class wins over its parent. */
  allProperties(className: string): Map<string, PhpType> {
    const properties = new Map<string, PhpType>();
    for (const info of this.ancestors(className).reverse()) {
      for (const [name, type] of info.properties) {
        properties.set(name, type);
      }
    }
    return properties;
  }

  /** The class and its known parents, starting with the class itself. */
  private ancestors(className: string): ClassInfo[] {
    const chain: ClassInfo[] = [];
    let current = this.find(className);
    while (current !== undefined && chain.length < MAX_PARENTS && !chain.includes(current)) {
      chain.push(current);
      current = current.parent === null ? undefined : this.find(current.parent);
    }
    return chain;
  }
}

/** Return type of the built-in methods of a CodeIgniter 4 model. */
function modelMethodType(chain: ClassInfo[], method: string): PhpType | undefined {
  const first = chain[0];
  if (first === undefined) {
    return undefined;
  }
  if (MODEL_CHAIN_METHODS.has(method)) {
    return phpType(classTypeName(first.name));
  }

  // CodeIgniter's own default for $returnType is 'array'.
  const row =
    chain.find((info) => info.modelReturnType !== null)?.modelReturnType ?? phpType('array');
  switch (method) {
    case 'find':
    case 'first':
      return unionTypes(row, phpType('null'));
    case 'findall':
      return arrayOf(row);
    default:
      return undefined;
  }
}

function key(name: string): string {
  return name.replace(/^\\/, '').toLowerCase();
}
