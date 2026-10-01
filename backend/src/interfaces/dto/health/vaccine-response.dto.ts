import { Expose, Transform } from 'class-transformer';
import { TimezoneUtil } from '../../../utils/timezone.util';

export class VaccineRecordResponseDto {
  @Expose()
  id!: string;

  @Expose()
  dogId!: string;

  @Expose()
  vaccineName!: string;

  @Expose()
  @Transform(({ value }) => {
    // 使用上海时区转换，避免UTC导致的日期偏移
    return TimezoneUtil.toShanghaiDateString(value);
  })
  vaccinationDate!: string;

  @Expose()
  @Transform(({ value }) => {
    // 使用上海时区转换，避免UTC导致的日期偏移
    return value ? TimezoneUtil.toShanghaiDateString(value) : null;
  })
  nextDueDate!: string | null;

  @Expose()
  notes!: string | null;

  @Expose()
  status!: string;

  /// 报告原件（2026-10-01 新增）：拍疫苗本识别时存下的原图 URL 数组。
  /// 老记录与手工填写的记录是空数组。
  @Expose()
  attachments!: string[];

  @Expose()
  createdAt!: string;

  @Expose()
  updatedAt!: string;
}

export class VaccineRecordListResponseDto {
  @Expose()
  total!: number;

  @Expose()
  records!: VaccineRecordResponseDto[];
}
