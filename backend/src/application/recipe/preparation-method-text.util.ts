const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const unique = (values: string[]): string[] =>
  values.filter((value, index) => values.indexOf(value) === index);

const splitPreparationMethodSegments = (value: string): string[] =>
  value
    .split(/[、,，]/)
    .map((segment) => segment.trim())
    .filter(Boolean);

export const isUuidLike = (value: string): boolean => UUID_RE.test(value);

export const extractLegacyPreparationMethodIds = (
  values: Array<string | null | undefined>,
): string[] =>
  unique(
    values.flatMap((value) =>
      value
        ? splitPreparationMethodSegments(value).filter((segment) =>
            isUuidLike(segment),
          )
        : [],
    ),
  );

export interface ResolvePreparationMethodTextOptions {
  preserveUnresolvedLegacy?: boolean;
}

export const resolvePreparationMethodText = (
  value: string | null | undefined,
  methodMap: Map<string, string> = new Map(),
  options: ResolvePreparationMethodTextOptions = {},
): string | undefined => {
  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return undefined;
  }

  const segments = splitPreparationMethodSegments(trimmedValue);
  const isUuidOnlyValue = segments.every((segment) => isUuidLike(segment));
  if (isUuidOnlyValue) {
    const resolvedUuidSegments = segments.map((segment) => methodMap.get(segment));
    if (resolvedUuidSegments.every(Boolean)) {
      return unique(resolvedUuidSegments as string[]).join('、');
    }

    if (options.preserveUnresolvedLegacy) {
      return trimmedValue;
    }

    const readableFallback = unique(
      resolvedUuidSegments.filter((segment): segment is string => !!segment),
    );
    return readableFallback.length > 0
      ? readableFallback.join('、')
      : undefined;
  }

  const resolvedSegments = unique(
    segments.flatMap((segment) => {
      if (isUuidLike(segment)) {
        const resolved = methodMap.get(segment);
        return resolved ? [resolved] : [];
      }

      return [segment];
    }),
  );

  if (resolvedSegments.length > 0) {
    return resolvedSegments.join('、');
  }

  return undefined;
};

/**
 * 展示用（制作单 / 制作单详情）：人写的原文原样返回。
 *
 * 和 `resolvePreparationMethodText` 的区别：那个会把句子按逗号拆开、去重、
 * 再用顿号拼回去（给历史数据做归一化）；制作单上要的是设计器里那一格的原话，
 * 标点、斜杠、先后顺序都不该被改写。
 *
 * 历史数据里存的是字典 UUID，这种必须解析成名字（原文本来就不是人话）。
 */
export const resolvePreparationMethodTextAsIs = (
  value: string | null | undefined,
  methodMap: Map<string, string> = new Map(),
): string | undefined => {
  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return undefined;
  }

  const segments = splitPreparationMethodSegments(trimmedValue);
  const hasLegacyId = segments.some((segment) => isUuidLike(segment));
  if (!hasLegacyId) {
    return trimmedValue;
  }

  const resolvedSegments = segments
    .map((segment) => (isUuidLike(segment) ? methodMap.get(segment) : segment))
    .filter((segment): segment is string => Boolean(segment && segment.trim()));

  return resolvedSegments.length > 0
    ? unique(resolvedSegments).join('、')
    : undefined;
};

export const resolvePreparationMethodTokens = (
  value: string | null | undefined,
  methodMap: Map<string, string> = new Map(),
  options: ResolvePreparationMethodTextOptions = {},
): string[] => {
  const readable = resolvePreparationMethodText(value, methodMap, options);
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
