import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import {
  PrismaWeightRecordRepository,
  WeightRecordData,
} from '../../infrastructure/repositories/prisma-weight-record.repository';
import { PrismaDogRepository } from '../../infrastructure/repositories/prisma-dog.repository';
import { CreateWeightRecordDto } from '../../interfaces/dto/weight-record/create-weight-record.dto';
import { DOG_REPOSITORY } from '../dog/dog.service';

@Injectable()
export class WeightRecordService {
  constructor(
    @Inject('PrismaWeightRecordRepository')
    private readonly weightRecordRepo: PrismaWeightRecordRepository,
    @Inject(DOG_REPOSITORY)
    private readonly dogRepo: PrismaDogRepository,
  ) {}

  async create(
    customerId: string,
    dto: CreateWeightRecordDto & { dogId: string }, // dogId required (added by controller)
  ): Promise<WeightRecordData> {
    // Verify dog exists and belongs to customer
    const dog = await this.dogRepo.findById(dto.dogId);
    if (!dog) {
      throw new NotFoundException('Dog not found');
    }
    if (dog.ownerId !== customerId) {
      throw new ForbiddenException('Access denied');
    }

    // Create weight record
    return this.weightRecordRepo.create({
      dogId: dto.dogId,
      recordDate: new Date(dto.recordDate),
      weightKg: dto.weightKg,
      note: dto.note,
      syncedToProfile: dto.syncedToProfile ?? false,
    });
  }

  async findByDogId(
    customerId: string,
    dogId: string,
    limit?: number,
    offset?: number,
  ): Promise<{ records: WeightRecordData[]; total: number }> {
    // Verify dog exists and belongs to customer
    const dog = await this.dogRepo.findById(dogId);
    if (!dog) {
      throw new NotFoundException('Dog not found');
    }
    if (dog.ownerId !== customerId) {
      throw new ForbiddenException('Access denied');
    }

    return this.weightRecordRepo.findByDogId(dogId, { limit, offset });
  }

  async delete(customerId: string, recordId: string): Promise<void> {
    // Verify record exists and belongs to customer's dog
    const record = await this.weightRecordRepo.findById(recordId);
    if (!record) {
      throw new NotFoundException('Weight record not found');
    }

    const dog = await this.dogRepo.findById(record.dogId);
    if (!dog || dog.ownerId !== customerId) {
      throw new ForbiddenException('Access denied');
    }

    await this.weightRecordRepo.delete(recordId);
  }

  async updateSyncedToProfile(
    customerId: string,
    recordId: string,
    synced: boolean,
  ): Promise<WeightRecordData> {
    // Verify record exists and belongs to customer's dog
    const record = await this.weightRecordRepo.findById(recordId);
    if (!record) {
      throw new NotFoundException('Weight record not found');
    }

    const dog = await this.dogRepo.findById(record.dogId);
    if (!dog || dog.ownerId !== customerId) {
      throw new ForbiddenException('Access denied');
    }

    return this.weightRecordRepo.updateSyncedToProfile(recordId, synced);
  }
}
