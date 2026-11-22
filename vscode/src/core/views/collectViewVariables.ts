import { unionTypes, type PhpType } from '../types/phpType';
import type { ViewCall } from './findViewCalls';

/** Variables of one view: name to type. */
export type ViewVariables = ReadonlyMap<string, PhpType>;

/**
 * Groups view calls by view and merges their variables. When several calls render the same view,
 * each variable gets the union of its types, e.g. `string` and `null` give `string|null`.
 */
export function collectViewVariables(calls: Iterable<ViewCall>): Map<string, ViewVariables> {
  const views = new Map<string, Map<string, PhpType>>();

  for (const call of calls) {
    const variables = views.get(call.view) ?? new Map<string, PhpType>();
    for (const { name, type } of call.variables) {
      const known = variables.get(name);
      variables.set(name, known === undefined ? type : unionTypes(known, type));
    }
    views.set(call.view, variables);
  }

  return views;
}
