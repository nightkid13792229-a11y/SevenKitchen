const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const unique = (values: string[]): string[] =>
  values.filter((value, index) => values.indexOf(value) === index);

const splitCommaSegments = (value: string): string[] =>
  value
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean);

export const isUuidLike = (value: string): boolean => UUID_RE.test(value);

export const extractLegacyPreparationMethodIds = (
  values: Array<string | null | undefined>,
): string[] =>
  unique(
    values.flatMap((value) =>
      value
        ? splitCommaSegments(value).filter((segment) => isUuidLike(segment))
        : [],
    ),
  );

export const resolvePreparationMethodText = (
  value: string | null | undefined,
  methodMap: Map<string, string> = new Map(),
): string | undefined => {
  if (!value?.trim()) {
    return undefined;
  }

  const commaSegments = splitCommaSegments(value);
  const looksLegacy =
    commaSegments.length > 0 &&
    commaSegments.every(
      (segment) => isUuidLike(segment) || methodMap.has(segment),
    );

  if (looksLegacy) {
    const names = unique(
      commaSegments
        .map((segment) => methodMap.get(segment))
        .filter((segment): segment is string => Boolean(segment)),
    );
    return names.length > 0 ? names.join('、') : undefined;
  }

  return value.trim();
};

export const resolvePreparationMethodTokens = (
  value: string | null | undefined,
  methodMap: Map<string, string> = new Map(),
): string[] => {
  const readable = resolvePreparationMethodText(value, methodMap);
  if (!readable) {
    return [];
  }

  return unique(
    readable
      .split(/[、,，]/)
      .map((segment) => segment.trim())
      .filter(Boolean),
  );
};

export const normalizePreparationMethodHistoryText = (
  value: string | null | undefined,
): string | undefined => {
  if (!value?.trim()) {
    return undefined;
  }

  const normalized = value
    .trim()
    .replace(/[，,]/g, '、')
    .replace(/\s*、\s*/g, '、')
    .replace(/\s+/g, ' ');

  return normalized || undefined;
};
