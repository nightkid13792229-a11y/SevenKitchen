/**
 * Dog Entity
 * Aggregate root for Dog domain
 */

import {
  DogGender,
  ActivityLevel,
  LifeStageOverride,
  DogSizeCategory,
  TreatInputMode,
  TreatLevel,
} from '../index';
import { ValidationError } from '../common/errors';
import { MAX_DOG_WEIGHT_KG } from './constants';

export class Dog {
  constructor(
    public readonly id: string,
    public readonly ownerId: string,
    public name: string,
    public breedId: string,
    public customBreedName: string | null,
    public birthday: Date,
    public gender: DogGender,
    public isNeutered: boolean,
    public currentWeightKg: number,
    public bcsScore: number,
    public activityLevel: ActivityLevel,
    public lifeStageOverride: LifeStageOverride,
    public sizeClassOverride: DogSizeCategory | null,
    public mealsPerDay: number,
    public treatInputMode: TreatInputMode,
    public treatLevel: TreatLevel,
    public manualTreatKcal: number | null,
    public medicalHistory: string | null,
    public allergyFoods: string | null,
    public pickyFoods: string | null,
    public cachedTargetFoodKcal: number, // System calculated, can be updated
    public avatarUrl: string | null = null,
    /**
     * 当前体重的最后更新时间（2026-09-27 新增）。
     *
     * 用于「体重超过 60 天就提醒顾客更新」（决策 8）。此前 dog 表只有 created_at，
     * 判断不出档案里这个体重是什么时候录的，这条规则无法落地。
     * 放在末尾并带默认值，避免影响已有的构造调用点。
     */
    public weightUpdatedAt: Date | null = null,
    /**
     * 「顾客是否亲自确认过」的时间戳（2026-09-27 新增）。
     *
     * 体况评分、活动量、每日餐数三项目前都有默认值，顾客不选也会被提交，
     * 因此值的存在不代表顾客选过。老板定的定制门槛按**是否确认过**判定：
     *   · NULL = 未确认（老档案一律 NULL，因为我们不追溯）
     *   · 有值 = 顾客在某次建档/改档里亲自点过这一项
     */
    public bcsScoreConfirmedAt: Date | null = null,
    public activityLevelConfirmedAt: Date | null = null,
    public mealsPerDayConfirmedAt: Date | null = null,
    /**
     * 喜欢的食材（2026-09-27，决策 7）。
     *
     * 该列一直存在，且配方设计器/AI 早就在读它，但**顾客端完全没有人能写** ——
     * 生产 4544 只狗里这一列为空。老板要求"喜欢的食材和不吃的食材都值得正式记录"，
     * 因此把顾客端这条写入路径打通（不吃的食材复用既有的 pickyFoods）。
     *
     * 追加在参数末尾是为了不打乱已有的位置参数顺序（避免误传）。
     */
    public preferredFoods: string | null = null,
    /**
     * ===== 繁殖期信息（2026-09-29 新增，阶段 A）=====
     *
     * 原来顾客无法把狗切到怀孕/哺乳，也没有任何日期字段，
     * 算法只能对孕期给全程平铺的定值（旧值 3.0），而 FEDIAF 表 VII-8b
     * 是按孕周分段（前 4 周 132、后 5 周 +26×体重）、哺乳按窝仔数与产后周数分段的。
     *
     * 同样追加在参数末尾，避免打乱已有的位置参数顺序。
     */
    public matingDate: Date | null = null,
    /** 预产期（兽医 B 超值更准）；与配种日同时存在时以本字段为准 */
    public expectedDueDate: Date | null = null,
    /** 分娩日：哺乳期分期的唯一依据 */
    public deliveryDate: Date | null = null,
    /** 窝仔数：哺乳期系数随窝仔数变化 */
    public litterSize: number | null = null,
  ) {
    this.validateInvariants();
  }

  /**
   * Validate domain invariants
   * TODO: Implement validation rules based on Doc 07
   */
  private validateInvariants(): void {
    // BCS score must be between 1-9 (WSAVA Standard)
    if (this.bcsScore < 1 || this.bcsScore > 9) {
      throw new ValidationError(
        `BCS score must be between 1-9, got: ${this.bcsScore}`,
      );
    }

    // Weight must be positive and within a biologically possible range.
    // 只拦生物学上不可能的值（见 constants.ts 的 MAX_DOG_WEIGHT_KG 说明），
    // **不做「偏大/偏小/是不是填了斤」的判断**——那会给出错误提醒。
    if (this.currentWeightKg <= 0) {
      throw new ValidationError(
        `Weight must be positive, got: ${this.currentWeightKg}`,
      );
    }

    if (this.currentWeightKg > MAX_DOG_WEIGHT_KG) {
      throw new ValidationError(
        `Weight must not exceed ${MAX_DOG_WEIGHT_KG} kg, got: ${this.currentWeightKg}`,
      );
    }

    // Meals per day must be positive
    if (this.mealsPerDay <= 0) {
      throw new ValidationError(
        `Meals per day must be positive, got: ${this.mealsPerDay}`,
      );
    }

    // Treat logic validation
    if (this.treatInputMode === TreatInputMode.EXACT_KCAL) {
      if (this.manualTreatKcal === null || this.manualTreatKcal < 0) {
        throw new ValidationError(
          'manualTreatKcal must be provided and non-negative when treatInputMode is EXACT_KCAL',
        );
      }
    }

    // TODO: Add more validation rules as needed
  }

  /**
   * Update dog profile
   * Supports partial updates - only updates provided fields
   */
  updateProfile(updates: Partial<Dog>): void {
    // Update name if provided
    if (updates.name !== undefined) {
      if (!updates.name || updates.name.trim().length === 0) {
        throw new ValidationError('Name must be non-empty');
      }
      this.name = updates.name;
    }

    // Update mutable fields if provided (skip readonly: id, ownerId)
    if (updates.breedId !== undefined) {
      if (!updates.breedId || updates.breedId.trim().length === 0) {
        throw new ValidationError('breedId must be non-empty');
      }
      this.breedId = updates.breedId;
    }
    if (updates.birthday !== undefined) {
      if (!(updates.birthday instanceof Date) || Number.isNaN(updates.birthday.getTime())) {
        throw new ValidationError('birthday must be a valid date');
      }
      this.birthday = updates.birthday;
    }
    if (updates.gender !== undefined) {
      this.gender = updates.gender;
    }
    if (updates.isNeutered !== undefined) {
      this.isNeutered = updates.isNeutered;
    }
    if (updates.matingDate !== undefined) {
      this.matingDate = updates.matingDate;
    }
    if (updates.expectedDueDate !== undefined) {
      this.expectedDueDate = updates.expectedDueDate;
    }
    if (updates.deliveryDate !== undefined) {
      this.deliveryDate = updates.deliveryDate;
    }
    if (updates.litterSize !== undefined) {
      this.litterSize = updates.litterSize;
    }
    if (updates.currentWeightKg !== undefined) {
      this.currentWeightKg = updates.currentWeightKg;
    }
    if (updates.bcsScore !== undefined) {
      this.bcsScore = updates.bcsScore;
    }
    if (updates.activityLevel !== undefined) {
      this.activityLevel = updates.activityLevel;
    }
    if (updates.lifeStageOverride !== undefined) {
      this.lifeStageOverride = updates.lifeStageOverride;
    }
    if (updates.sizeClassOverride !== undefined) {
      this.sizeClassOverride = updates.sizeClassOverride;
    }
    if (updates.customBreedName !== undefined) {
      this.customBreedName = updates.customBreedName;
    }
    if (updates.mealsPerDay !== undefined) {
      this.mealsPerDay = updates.mealsPerDay;
    }
    if (updates.treatInputMode !== undefined) {
      this.treatInputMode = updates.treatInputMode;
    }
    if (updates.treatLevel !== undefined) {
      this.treatLevel = updates.treatLevel;
    }
    if (updates.manualTreatKcal !== undefined) {
      this.manualTreatKcal = updates.manualTreatKcal;
    }
    if (updates.medicalHistory !== undefined) {
      this.medicalHistory = updates.medicalHistory;
    }
    if (updates.avatarUrl !== undefined) {
      this.avatarUrl = updates.avatarUrl;
    }
    if (updates.allergyFoods !== undefined) {
      this.allergyFoods = updates.allergyFoods;
    }
    if (updates.preferredFoods !== undefined) {
      this.preferredFoods = updates.preferredFoods;
    }
    if (updates.pickyFoods !== undefined) {
      this.pickyFoods = updates.pickyFoods;
    }

    // Re-validate invariants after update
    this.validateInvariants();
  }
}
