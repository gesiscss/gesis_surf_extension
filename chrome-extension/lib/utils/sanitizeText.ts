const INVALID_SURROGATES = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function sanitizeText(value: string): string {
  return value.replace(INVALID_SURROGATES, '\uFFFD').replaceAll('\u0000', '');
}
