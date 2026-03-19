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

  @Expose()
  treatment!: string | null;

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
