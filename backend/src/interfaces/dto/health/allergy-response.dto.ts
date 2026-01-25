import { Expose } from 'class-transformer'

export class AllergyRecordResponseDto {
  @Expose()
  id!: string

  @Expose()
  dogId!: string

  @Expose()
  allergen!: string

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
