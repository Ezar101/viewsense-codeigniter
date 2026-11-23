import { phpType, type PhpType } from './phpType';

/**
 * Return types of common PHP functions and CodeIgniter helpers, so that
 * `'title' => sprintf('Order #%s', $id)` gives `string`.
 *
 * Only functions whose return type doesn't depend on their arguments are listed: `str_replace()`
 * or `html_escape()` return the type they're given, so they stay unknown (`mixed`).
 */
const KNOWN_FUNCTIONS: Readonly<Record<string, readonly string[]>> = {
  // PHP: strings
  addslashes: ['string'],
  bin2hex: ['string'],
  chr: ['string'],
  date: ['string'],
  gmdate: ['string'],
  htmlentities: ['string'],
  htmlspecialchars: ['string'],
  html_entity_decode: ['string'],
  implode: ['string'],
  join: ['string'],
  lcfirst: ['string'],
  ltrim: ['string'],
  md5: ['string'],
  mb_strtolower: ['string'],
  mb_strtoupper: ['string'],
  mb_substr: ['string'],
  nl2br: ['string'],
  number_format: ['string'],
  rtrim: ['string'],
  sha1: ['string'],
  sprintf: ['string'],
  str_pad: ['string'],
  str_repeat: ['string'],
  strip_tags: ['string'],
  strrev: ['string'],
  strtolower: ['string'],
  strtoupper: ['string'],
  strval: ['string'],
  substr: ['string'],
  trim: ['string'],
  ucfirst: ['string'],
  ucwords: ['string'],
  uniqid: ['string'],
  urlencode: ['string'],
  rawurlencode: ['string'],
  vsprintf: ['string'],
  wordwrap: ['string'],
  json_encode: ['string', 'false'],
  // PHP: numbers
  abs: ['float', 'int'],
  ceil: ['float'],
  count: ['int'],
  floatval: ['float'],
  floor: ['float'],
  intval: ['int'],
  mb_strlen: ['int'],
  mt_rand: ['int'],
  rand: ['int'],
  random_int: ['int'],
  round: ['float'],
  strlen: ['int'],
  time: ['int'],
  // PHP: booleans
  array_key_exists: ['bool'],
  boolval: ['bool'],
  in_array: ['bool'],
  is_array: ['bool'],
  is_bool: ['bool'],
  is_null: ['bool'],
  is_numeric: ['bool'],
  is_string: ['bool'],
  // PHP: arrays
  array_column: ['array'],
  array_filter: ['array'],
  array_keys: ['array'],
  array_map: ['array'],
  array_merge: ['array'],
  array_reverse: ['array'],
  array_slice: ['array'],
  array_unique: ['array'],
  array_values: ['array'],
  compact: ['array'],
  explode: ['array'],
  range: ['array'],

  // CodeIgniter 3 and 4 helpers (URL, form, language, security)
  anchor: ['string'],
  base_url: ['string'],
  csrf_hash: ['string'],
  csrf_token: ['string'],
  current_url: ['string'],
  form_checkbox: ['string'],
  form_close: ['string'],
  form_dropdown: ['string'],
  form_error: ['string'],
  form_hidden: ['string'],
  form_input: ['string'],
  form_label: ['string'],
  form_open: ['string'],
  form_open_multipart: ['string'],
  form_password: ['string'],
  form_submit: ['string'],
  form_textarea: ['string'],
  img: ['string'],
  link_tag: ['string'],
  mailto: ['string'],
  previous_url: ['string'],
  set_value: ['string'],
  site_url: ['string'],
  uri_string: ['string'],
  url_title: ['string'],
  validation_errors: ['string'],
  // CodeIgniter 3: the controller instance
  get_instance: ['\\CI_Controller'],
};

/** Return type of a known PHP function or CodeIgniter helper, or `undefined`. */
export function knownFunctionType(name: string): PhpType | undefined {
  const type = KNOWN_FUNCTIONS[name.replace(/^\\/, '').toLowerCase()];
  return type === undefined ? undefined : phpType(...type);
}
