import { Expose, Transform } from 'class-transformer';
import { TimezoneUtil } from '../../../utils/timezone.util';

export class MedicalRecordResponseDto {
  @Expose()
  id!: string;

  @Expose()
  dogId!: string;

  @Expose()
  @Transform(({ value }) => {
    // 使用上海时区转换，避免UTC导致的日期偏移
    return TimezoneUtil.toShanghaiDateString(value);
  })
  visitDate!: string;

  @Expose()
  chiefComplaint!: string;

  @Expose()
  diagnosis!: string;

  /// 化验数据原文（2026-10-02 新增）
  @Expose()
  labValues!: string | null;

  /// 医嘱 / 回家注意
  @Expose()
  treatment!: string | null;

  /// 这次做的检查
  @Expose()
  exams!: string | null;

  /// 体征
  @Expose()
  vitals!: string | null;

  @Expose()
  medications!: string[];

  @Expose()
  status!: string;

  @Expose()
  @Transform(({ value }) => {
    // 使用上海时区转换，避免UTC导致的日期偏移
    return value ? TimezoneUtil.toShanghaiDateString(value) : null;
  })
  followUpDate!: string | null;

  @Expose()
  veterinarian!: string | null;

  @Expose()
  notes!: string | null;

  @Expose()
  attachments!: string[];

  @Expose()
  createdAt!: string;

  @Expose()
  updatedAt!: string;
}

export class MedicalRecordListResponseDto {
  @Expose()
  total!: number;

  @Expose()
  records!: MedicalRecordResponseDto[];
}
