/**
 * 药物剂量确定性后过滤（L2 首轮发现的真实缺陷）。
 *
 * 模型即使被提示"不要给剂量"，仍会引用指南里的 `30–60 mg/kg/天`。
 * 这里在最终答案落库/审计之前，把剂量片段替换成「按兽医处方」，
 * 保证任何回答都不会带出可执行的给药剂量。
 *
 * 只处理"药物剂量"形态：
 * - `30–60 mg/kg`、`5 mg/kg/天`、`2 ml/kg`、`400 IU/kg`；
 * - `每日 10 mg`、`每次 5 mg`。
 * 营养目标的 `% DM`、`mg/dl`、`g/1000kcal` 不受影响。
 */
const DOSE_PATTERNS: RegExp[] = [
  /\d+(?:\.\d+)?\s*(?:[-–~～]\s*\d+(?:\.\d+)?)?\s*(?:mg|μg|ug|mcg|IU|ml)\s*\/\s*kg(?:\s*(?:\/|每)\s*(?:天|日|次))?/gi,
  /(?:每日|每天)\s*\d+(?:\.\d+)?\s*(?:mg|μg|ug|mcg|IU|ml)/gi,
  /\d+(?:\.\d+)?\s*(?:mg|μg|ug|mcg|IU|ml)\s*\/\s*次/gi,
  /(?:每次|一次)\s*\d+(?:\.\d+)?\s*(?:mg|μg|ug|mcg|IU|ml)/gi,
];

export function redactDrugDoses(text: string): {
  text: string;
  redactions: number;
} {
  let redactions = 0;
  let output = String(text ?? '');
  for (const pattern of DOSE_PATTERNS) {
    output = output.replace(pattern, () => {
      redactions += 1;
      return '按兽医处方';
    });
  }
  return { text: output, redactions };
}
