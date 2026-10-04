import { Expose } from 'class-transformer';
import type { AllergyCertainty } from '@prisma/client';

export class AllergyRecordResponseDto {
  @Expose()
  id!: string;

  @Expose()
  dogId!: string;

  @Expose()
  allergen!: string;

  @Expose()
  notes!: string | null;

  /**
   * 可信度（2026-10-04 第一期）。
   *
   * 注意这里**没有**恢复 2026-01-25 删掉的那批字段
   * （allergenType / discoveryDate / symptoms / severity / confirmedBy / treatment）——
   * 那些是让顾客自己填的医学判断，删掉是对的。
   * certainty 是系统按来源推出来的，两者不是一回事。
   */
  @Expose()
  certainty!: AllergyCertainty;

  /** 来源：REPORT / OWNER / STAFF / ORDER / PLAN */
  @Expose()
  source!: string;

  @Expose()
  attachments!: string[];

  @Expose()
  createdAt!: string;

  @Expose()
  updatedAt!: string;
}

export class AllergyRecordListResponseDto {
  @Expose()
  total!: number;

  @Expose()
  records!: AllergyRecordResponseDto[];
}
