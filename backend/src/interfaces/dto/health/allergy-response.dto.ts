import { Expose, Transform } from 'class-transformer'

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
    return value.toISOString().split('T')[0]
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
