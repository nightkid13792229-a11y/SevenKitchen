import {
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

/**
 * 抗体检测记录 · 新建（2026-10-15 新增，需求 R9）。
 *
 * 它**不是疫苗**（字段不同、不参与"接种记录"的判读），但要在同一个列表里显示，
 * 所以按现有架构单独一张表、单独一组接口（与就诊/体检/过敏一致）。
 *
 * ⚠️ 我们不设阈值：合格与否**以报告/兽医判定为准**，所以 `result` 是必填的结论，
 *    报告没给结论时用 `UNKNOWN`（界面写"请让兽医判读"）。
 */
export class CreateAntibodyTestDto {
  @IsOptional()
  @IsUUID()
  dogId?: string; // 来自 URL 参数 :dogId

  /** 检测日期（决策依据，必填） */
  @IsDateString()
  testedAt!: string;

  /**
   * 检了什么：`CORE`（核心三项）/ `RABIES`，可多值。
   *
   * 只有 `CORE` + 合格才会影响免疫计划；`RABIES` 只记录
   * （用途是出行 / 出入境证明，国内狂犬法定每年，法规优先）。
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targets?: string[];

  @IsOptional()
  @IsIn(['PASS', 'FAIL', 'UNKNOWN'])
  result?: 'PASS' | 'FAIL' | 'UNKNOWN';

  /** 报告上的原始数值与单位（可空，不强求） */
  @IsOptional()
  @IsString()
  value?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  /**
   * 下次评估时间。**不传时由后端算**：合格 = 检测日 + 3 年；
   * 不合格 / 未判读留空（下一针照常按计划打）。
   */
  @IsOptional()
  @IsDateString()
  nextReviewAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /** 报告原件（与其它记录同一套存法：COS 图片 URL 数组） */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];
}
