export const splitPreparationMethodSegments = (value: string): string[] => {
  return value
    .split(/[、,，]/)
    .map((segment) => segment.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
};

export const normalizePreparationMethodText = (value: string): string => {
  return splitPreparationMethodSegments(value).join('、');
};

export const appendPreparationMethodText = (
  currentText: string,
  historyText: string,
): string => {
  const historySegments = splitPreparationMethodSegments(historyText);
  if (!historySegments.length) {
    return currentText;
  }

  const currentSegments = splitPreparationMethodSegments(currentText);
  if (!currentSegments.length) {
    return historySegments.join('、');
  }

  const normalizedCurrentSegments = new Set(
    currentSegments.map((segment) => normalizePreparationMethodText(segment)),
  );
  const newSegments = historySegments.filter((segment) => {
    const normalizedSegment = normalizePreparationMethodText(segment);
    return (
      normalizedSegment &&
      !normalizedCurrentSegments.has(normalizedSegment)
    );
  });

  if (!newSegments.length) {
    return currentText;
  }

  return [...currentSegments, ...newSegments].join('、');
};

export interface PreparationMethodHistoryItemLike {
  text?: string;
}

export const getDefaultPreparationMethodFromHistory = (
  currentText: string,
  history: PreparationMethodHistoryItemLike[],
): string => {
  if (splitPreparationMethodSegments(currentText).length > 0) {
    return currentText;
  }

  const firstHistoryText = history.find((item) =>
    splitPreparationMethodSegments(item.text || '').length > 0,
  )?.text;

  return firstHistoryText ? normalizePreparationMethodText(firstHistoryText) : currentText;
};
