import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma.service'

export interface WeightRecordData {
  id: string
  dogId: string
  recordDate: Date
  weightKg: number
  note: string | null
  syncedToProfile: boolean
  createdAt: Date
}

@Injectable()
export class PrismaWeightRecordRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    dogId: string
    recordDate: Date
    weightKg: number
    note?: string
    syncedToProfile?: boolean
  }): Promise<WeightRecordData> {
    const record = await this.prisma.weightRecord.create({
      data: {
        dogId: data.dogId,
        recordDate: data.recordDate,
        weightKg: data.weightKg,
        note: data.note || null,
        syncedToProfile: data.syncedToProfile ?? false,
      },
    })
    return this.mapFromPrisma(record)
  }

  async findById(id: string): Promise<WeightRecordData | null> {
    const record = await this.prisma.weightRecord.findUnique({
      where: { id },
    })
    return record ? this.mapFromPrisma(record) : null
  }

  async findByDogId(
    dogId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{ records: WeightRecordData[]; total: number }> {
    const limit = options?.limit || 20
    const offset = options?.offset || 0

    const [records, total] = await Promise.all([
      this.prisma.weightRecord.findMany({
        where: { dogId },
        orderBy: { recordDate: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.weightRecord.count({
        where: { dogId },
      }),
    ])

    return {
      records: records.map((r) => this.mapFromPrisma(r)),
      total,
    }
  }

  async delete(id: string): Promise<void> {
    await this.prisma.weightRecord.delete({
      where: { id },
    })
  }

  async updateSyncedToProfile(id: string, synced: boolean): Promise<WeightRecordData> {
    const record = await this.prisma.weightRecord.update({
      where: { id },
      data: { syncedToProfile: synced },
    })
    return this.mapFromPrisma(record)
  }

  private mapFromPrisma(record: any): WeightRecordData {
    return {
      id: record.id,
      dogId: record.dogId,
      recordDate: record.recordDate,
      weightKg: record.weightKg,
      note: record.note,
      syncedToProfile: record.syncedToProfile,
      createdAt: record.createdAt,
    }
  }
}
