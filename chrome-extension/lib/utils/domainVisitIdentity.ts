export const VISIT_TIME_SEPARATOR = '#';

export function visitTimeFromHint(hint: string): string | undefined {
  const suffix = hint.slice(hint.lastIndexOf(VISIT_TIME_SEPARATOR) + 1);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(suffix)) return undefined;
  return Number.isNaN(Date.parse(suffix)) ? undefined : suffix;
}

export function stableKeyOf(hint: string): string {
  return visitTimeFromHint(hint) ? hint.slice(0, hint.lastIndexOf(VISIT_TIME_SEPARATOR)) : hint;
}
