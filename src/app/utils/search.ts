export function includesSearch(
  target: string | undefined | null,
  keyword: string
): boolean {
  if (target == null) return false;
  const kw = keyword.trim();
  if (!kw) return false;
  return target.toLowerCase().includes(kw.toLowerCase());
}

export function matchesKeyword(
  fields: Array<string | number | undefined | null>,
  keyword: string
): boolean {
  const kw = keyword.trim();
  if (!kw) return false;
  return fields.some((f) => {
    if (f == null) return false;
    return String(f).toLowerCase().includes(kw.toLowerCase());
  });
}
