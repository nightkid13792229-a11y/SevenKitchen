import { Expose, Transform } from 'class-transformer';
import { TimezoneUtil } from '../../../utils/timezone.util';

/**
 * 抗体检测记录的对外形状（2026-10-15 新增，需求 R9）。
 *
 * 界面上它和接种记录在**同一个列表**里显示，所以日期口径与
 * `VaccineRecordResponseDto` 保持一致（上海时区字符串，避免 UTC 偏移一天）。
 */
export class AntibodyTestResponseDto {
  @Expose()
  id!: string;

  @Expose()
  dogId!: string;

  @Expose()
  @Transform(({ value }) => TimezoneUtil.toShanghaiDateString(value))
  testedAt!: string;

  /** 检了什么：CORE（核心三项）/ RABIES */
  @Expose()
  targets!: string[];

  /** 目标的中文名（核心三项 / 狂犬）—— 前端不再自己映射一份 */
  @Expose()
  targetLabels!: string[];

  /** PASS / FAIL / UNKNOWN */
  @Expose()
  result!: string;

  /** 结论的中文名（合格 / 不合格 / 请让兽医判读） */
  @Expose()
  resultLabel!: string;

  @Expose()
  value!: string | null;

  @Expose()
  unit!: string | null;

  /**
   * 下次评估时间（合格 = 检测日 + 1 年；与免疫计划共用同一个常量；
   * 不合格 / 未判读为空）。2026-10-30（#1）：不再读记录上存的值，
   * 避免记录区与计划区出现两个日期。
   */
  @Expose()
  @Transform(({ value }) =>
    value ? TimezoneUtil.toShanghaiDateString(value) : null,
  )
  nextReviewAt!: string | null;

  @Expose()
  notes!: string | null;

  @Expose()
  attachments!: string[];

  @Expose()
  createdAt!: string;

  @Expose()
  updatedAt!: string;
}

export class AntibodyTestListResponseDto {
  @Expose()
  total!: number;

  @Expose()
  records!: AntibodyTestResponseDto[];
}
