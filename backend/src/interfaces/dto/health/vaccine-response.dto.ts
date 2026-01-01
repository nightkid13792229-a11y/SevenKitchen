import { Expose, Transform } from 'class-transformer'

export class VaccineRecordResponseDto {
  @Expose()
  id!: string

  @Expose()
  dogId!: string

  @Expose()
  vaccineName!: string

  @Expose()
  @Transform(({ value }) => {
    return value.toISOString().split('T')[0]
  })
  vaccinationDate!: string

  @Expose()
  @Transform(({ value }) => {
    return value ? value.toISOString().split('T')[0] : null
  })
  nextDueDate!: string | null

  @Expose()
  notes!: string | null

  @Expose()
  status!: string

  @Expose()
  createdAt!: string

  @Expose()
  updatedAt!: string
}

export class VaccineRecordListResponseDto {
  @Expose()
  total!: number

  @Expose()
  records!: VaccineRecordResponseDto[]
}
