import { Expose, Transform } from 'class-transformer'

export class CheckupRecordResponseDto {
  @Expose()
  id!: string

  @Expose()
  dogId!: string

  @Expose()
  checkupType!: string

  @Expose()
  @Transform(({ value }) => {
    return value.toISOString().split('T')[0]
  })
  checkupDate!: string

  @Expose()
  findings!: string | null

  @Expose()
  recommendations!: string | null

  @Expose()
  veterinarian!: string | null

  @Expose()
  attachments!: string[]

  @Expose()
  createdAt!: string

  @Expose()
  updatedAt!: string
}

export class CheckupRecordListResponseDto {
  @Expose()
  total!: number

  @Expose()
  records!: CheckupRecordResponseDto[]
}
