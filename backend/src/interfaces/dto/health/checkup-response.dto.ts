import { Expose, Transform } from 'class-transformer';
import { TimezoneUtil } from '../../../utils/timezone.util';

export class CheckupRecordResponseDto {
  @Expose()
  id!: string;

  @Expose()
  dogId!: string;

  @Expose()
  checkupType!: string;

  @Expose()
  @Transform(({ value }) => {
    // 使用上海时区转换，避免UTC导致的日期偏移
    return TimezoneUtil.toShanghaiDateString(value);
  })
  checkupDate!: string;

  @Expose()
  findings!: string | null;

  @Expose()
  recommendations!: string | null;

  @Expose()
  veterinarian!: string | null;

  @Expose()
  attachments!: string[];

  @Expose()
  createdAt!: string;

  @Expose()
  updatedAt!: string;
}

export class CheckupRecordListResponseDto {
  @Expose()
  total!: number;

  @Expose()
  records!: CheckupRecordResponseDto[];
}
