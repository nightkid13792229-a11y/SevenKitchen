import { Expose, Transform } from 'class-transformer'
import { TimezoneUtil } from '../../../utils/timezone.util'

export class AllergyRecordResponseDto {
  @Expose()
  id!: string

  @Expose()
  dogId!: string

  @Expose()
  allergen!: string

  @Expose()
  allergenType!: string

  @Expose()
  @Transform(({ value }) => {
    // 使用上海时区转换，避免UTC导致的日期偏移
    return TimezoneUtil.toShanghaiDateString(value)
  })
  discoveryDate!: string

  @Expose()
  symptoms!: string

  @Expose()
  severity!: string

  @Expose()
  confirmedBy!: string

  @Expose()
  treatment!: string | null

  @Expose()
  notes!: string | null

  @Expose()
  attachments!: string[]

  @Expose()
  createdAt!: string

  @Expose()
  updatedAt!: string
}

export class AllergyRecordListResponseDto {
  @Expose()
  total!: number

  @Expose()
  records!: AllergyRecordResponseDto[]
}
