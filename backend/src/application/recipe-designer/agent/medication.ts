/**
 * 营养方案与食谱设计不涉及药物：不是“药品剂量脱敏”，而是整个话题不出现。
 * 仅用于方案/选材文本的清洗；聊天安全网仍保留 dose-redaction。
 */
const MEDICATION_PATTERN =
  /用药|药物|处方|服药|口服|注射|抗生素|止痛药|激素|mg\/kg/i;

export function stripMedicationSentences(text: string): string {
  return text
    .split(/(?<=[。；;！？!?\n])/)
    .filter((sentence) => !MEDICATION_PATTERN.test(sentence))
    .join('')
    .trim();
}

export function isMedicationItem(item: {
  key?: string;
  label?: string;
  value?: string;
}): boolean {
  return MEDICATION_PATTERN.test(
    `${item.key ?? ''} ${item.label ?? ''} ${item.value ?? ''}`,
  );
}
