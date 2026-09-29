import {
  Injectable,
  Logger,
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
import type { DogRepository } from '../../domain/dog/dog.repository';
import type { Dog } from '../../domain/dog/dog.entity';
import { WeightGoalPlanService } from '../weight-goal-plan/weight-goal-plan.service';

@Injectable()
export class WeightRecordService {
  private readonly logger = new Logger(WeightRecordService.name);

  constructor(
    @Inject('PrismaWeightRecordRepository')
    private readonly weightRecordRepo: PrismaWeightRecordRepository,
    @Inject(DOG_REPOSITORY)
    private readonly dogRepo: DogRepository,
    @Inject('PrismaDogRepository')
    private readonly prismaDogRepo: PrismaDogRepository,
    private readonly weightGoalPlanService: WeightGoalPlanService,
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

    await this.ensureDogPersistedInPrisma(dog);

    // Create weight record
    const record = await this.weightRecordRepo.create({
      dogId: dto.dogId,
      recordDate: new Date(dto.recordDate),
      weightKg: dto.weightKg,
      note: dto.note,
      syncedToProfile: dto.syncedToProfile ?? false,
    });

    /**
     * 计划生效时，按这次称重自动校正力度（阶段 B1-5）。
     *
     * **双层保护**：applyWeighIn 内部自己有 try/catch，这里再包一层。
     * 理由 —— 记录体重是顾客手输的数据，丢了没法补；而计划调整只是锦上添花。
     * 任何情况下都不该让后者把前者的响应变成失败。
     */
    try {
      await this.weightGoalPlanService.applyWeighIn(
        dto.dogId,
        dto.weightKg,
        new Date(dto.recordDate),
      );
    } catch (error) {
      this.logger.error(
        `称重后触发计划校正失败（dogId=${dto.dogId}）：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return record;
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

  private async ensureDogPersistedInPrisma(dog: Dog): Promise<void> {
    const prismaDog = await this.prismaDogRepo.findById(dog.id);
    if (!prismaDog) {
      await this.prismaDogRepo.save(dog);
    }
  }
}
