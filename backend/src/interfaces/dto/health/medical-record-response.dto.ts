import { Expose, Transform } from 'class-transformer'

export class MedicalRecordResponseDto {
  @Expose()
  id!: string

  @Expose()
  dogId!: string

  @Expose()
  @Transform(({ value }) => {
    return value.toISOString().split('T')[0]
  })
  visitDate!: string

  @Expose()
  chiefComplaint!: string

  @Expose()
  diagnosis!: string

  @Expose()
  treatment!: string | null

  @Expose()
  medications!: string[]

  @Expose()
  status!: string

  @Expose()
  @Transform(({ value }) => {
    return value ? value.toISOString().split('T')[0] : null
  })
  followUpDate!: string | null

  @Expose()
  veterinarian!: string | null

  @Expose()
  notes!: string | null

  @Expose()
  createdAt!: string

  @Expose()
  updatedAt!: string
}

export class MedicalRecordListResponseDto {
  @Expose()
  total!: number

  @Expose()
  records!: MedicalRecordResponseDto[]
}
