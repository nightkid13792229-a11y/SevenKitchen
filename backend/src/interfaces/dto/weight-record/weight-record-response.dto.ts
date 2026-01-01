import { Expose, Transform } from 'class-transformer'

export class WeightRecordResponseDto {
  @Expose()
  id!: string

  @Expose()
  dogId!: string

  @Expose()
  @Transform(({ value }) => {
    return value.toISOString().split('T')[0]
  })
  recordDate!: string

  @Expose()
  weightKg!: number

  @Expose()
  note!: string | null

  @Expose()
  syncedToProfile!: boolean

  @Expose()
  createdAt!: string
}

export class WeightRecordListResponseDto {
  @Expose()
  total!: number

  @Expose()
  records!: WeightRecordResponseDto[]
}
