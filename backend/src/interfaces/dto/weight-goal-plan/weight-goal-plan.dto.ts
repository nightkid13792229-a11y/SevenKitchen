/**
 * 体重管理计划 · 请求 DTO（阶段 B）
 */

export interface CreateWeightGoalPlanDto {
  /** 目标体重（公斤）。不传则用系统建议值。 */
  targetWeightKg?: number;
  /**
   * 力度档位：STANDARD / GENTLE / GENTLER。
   * 只影响起步能量（RER(目标体重) × 倍数），不传按 STANDARD。
   */
  intensity?: WeightGoalIntensityKey;
  /**
   * 增重前的 5 个排查问题答案。
   * **增重计划必填**：前 3 项任一为「是」时不允许建计划，先就医。
   */
  screening?: Record<string, boolean>;
}

export type WeightGoalIntensityKey = 'STANDARD' | 'GENTLE' | 'GENTLER';

export interface UpdateWeightGoalTargetDto {
  /** 新的目标体重（公斤）。完全自由可调，只提示不拦截。 */
  targetWeightKg: number;
}

export interface UpdateWeightGoalIntensityDto {
  /** 新的力度档位。**只能往更温和方向调**。 */
  intensity: WeightGoalIntensityKey;
}

export interface EndWeightGoalPlanDto {
  /** 结束原因（可选，仅作记录） */
  reason?: string;
}
