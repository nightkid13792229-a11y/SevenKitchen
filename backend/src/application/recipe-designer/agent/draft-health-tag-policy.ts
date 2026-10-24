/**
 * 草稿健康标签策略（P0b Task 5）。
 *
 * 依据 `docs/superpowers/specs/2026-10-24-ai-recipe-design-agent-design.md`
 * 第 5.5 节：v1 AI 只自动挂两个有机器可判证据的标签——「低脂」按湿基脂肪与
 * 水分门槛判定，「单一动物蛋白」按菜品里的动物物种判定；「易消化」只能人工挂，
 * 其余标签也不对 AI 开放。
 *
 * 只读草稿已有的营养摘要与物种，不查库、不改草稿。
 */
import type { HealthTagPolicy } from './agent-types';

/** 构造策略所需的草稿事实。 */
export interface DraftHealthTagPolicyInput {
  /** 湿基脂肪百分比；缺数据为 null。 */
  fatWetPercent: number | null;
  /** 水分百分比；缺数据为 null。 */
  moisturePercent: number | null;
  /** 菜品里出现的动物物种（可能含重复/大小写差异）。 */
  animalSpecies: string[];
  /**
   * 是否有 PROTEIN / ORGAN 项识别不出物种；缺省按 false（兼容旧调用）。
   * true 时「单一动物蛋白」必须 fail closed。
   */
  unknownAnimalProtein?: boolean;
}

/**
 * 「低脂」的湿基脂肪上限，按水分分三档。
 *
 * `<20 → 9`，`20..65 → 7`，`>65 → 4`。
 */
export function lowFatLimit(moisturePercent: number): number {
  if (moisturePercent < 20) {
    return 9;
  }
  if (moisturePercent <= 65) {
    return 7;
  }
  return 4;
}

export class DraftHealthTagPolicy implements HealthTagPolicy {
  private readonly fatWetPercent: number | null;
  private readonly moisturePercent: number | null;
  private readonly animalSpecies: string[];
  private readonly unknownAnimalProtein: boolean;

  constructor(input: DraftHealthTagPolicyInput) {
    this.fatWetPercent = input.fatWetPercent;
    this.moisturePercent = input.moisturePercent;
    this.animalSpecies = input.animalSpecies;
    this.unknownAnimalProtein = input.unknownAnimalProtein ?? false;
  }

  isAllowedTag(name: string): boolean {
    switch (name) {
      case '低脂':
        if (this.fatWetPercent === null || this.moisturePercent === null) {
          return false;
        }
        return this.fatWetPercent <= lowFatLimit(this.moisturePercent);
      case '单一动物蛋白':
        // 有识别不出的蛋白项时不能认定“单一”：宁可少挂，不可误挂。
        return !this.unknownAnimalProtein && this.countAnimalSpecies() === 1;
      case '易消化':
        // 只能人工挂：AI 无法举证“易消化”。
        return false;
      default:
        return false;
    }
  }

  /** trim 后按大小写不敏感去重；空数组自然为 0。 */
  private countAnimalSpecies(): number {
    const species = this.animalSpecies.map((name) => name.trim().toLowerCase());
    return new Set(species).size;
  }
}
