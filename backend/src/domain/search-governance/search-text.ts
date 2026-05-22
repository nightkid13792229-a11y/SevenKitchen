const SEARCH_PUNCTUATION_PATTERN = /[()（）【】[\]{}_/\\·•.,，。:：;；'"`-]/g;
const CJK_PATTERN = /^[\u3400-\u9fff]+$/;

export function normalizeSearchText(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, '')
    .replace(SEARCH_PUNCTUATION_PATTERN, '');
}

export function isCjkOnlyQuery(value: string): boolean {
  const normalized = normalizeSearchText(value);
  return normalized.length >= 2 && normalized.length <= 8 && CJK_PATTERN.test(normalized);
}

export function calculateEditDistance(left: string, right: string): number {
  const normalizedLeft = normalizeSearchText(left);
  const normalizedRight = normalizeSearchText(right);
  const rows = normalizedLeft.length + 1;
  const cols = normalizedRight.length + 1;
  const matrix = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  for (let row = 0; row < rows; row += 1) {
    matrix[row][0] = row;
  }

  for (let col = 0; col < cols; col += 1) {
    matrix[0][col] = col;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = normalizedLeft[row - 1] === normalizedRight[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost,
      );
    }
  }

  return matrix[normalizedLeft.length][normalizedRight.length];
}
