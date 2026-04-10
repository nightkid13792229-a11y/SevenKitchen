import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { WeightRecordService } from 'src/application/weight-record/weight-record.service';
import { Dog } from 'src/domain/dog/dog.entity';
import {
  ActivityLevel,
  DogGender,
  LifeStageOverride,
  TreatInputMode,
  TreatLevel,
} from 'src/domain';

describe('WeightRecordService', () => {
  const createDog = () =>
    new Dog(
      'dog-1',
      'customer-1',
      'Seven',
      'breed-1',
      null,
      new Date('2023-01-01'),
      DogGender.MALE,
      true,
      6.7,
      5,
      ActivityLevel.NORMAL,
      LifeStageOverride.NONE,
      null,
      2,
      TreatInputMode.ESTIMATE_LEVEL,
      TreatLevel.LOW,
      null,
      null,
      null,
      null,
      452,
    );

  const createMocks = () => ({
    weightRecordRepo: {
      create: jest.fn(),
      findById: jest.fn(),
      findByDogId: jest.fn(),
      delete: jest.fn(),
      updateSyncedToProfile: jest.fn(),
    },
    dogRepo: {
      findById: jest.fn(),
      findByOwnerId: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    },
    prismaDogRepo: {
      findById: jest.fn(),
      findByOwnerId: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('persists the dog into Prisma before creating a weight record when only the active repo has it', async () => {
    const mocks = createMocks();
    const dog = createDog();
    const record = {
      id: 'record-1',
      dogId: dog.id,
      recordDate: new Date('2026-04-06'),
      weightKg: 6.5,
      note: 'after breakfast',
      syncedToProfile: false,
      createdAt: new Date('2026-04-06T12:00:00.000Z'),
    };

    mocks.dogRepo.findById.mockResolvedValue(dog);
    mocks.prismaDogRepo.findById.mockResolvedValue(null);
    mocks.prismaDogRepo.save.mockResolvedValue(dog);
    mocks.weightRecordRepo.create.mockResolvedValue(record);

    const service = new WeightRecordService(
      mocks.weightRecordRepo as any,
      mocks.dogRepo as any,
      mocks.prismaDogRepo as any,
    );

    await expect(
      service.create('customer-1', {
        dogId: dog.id,
        recordDate: '2026-04-06',
        weightKg: 6.5,
        note: 'after breakfast',
      }),
    ).resolves.toEqual(record);

    expect(mocks.prismaDogRepo.findById).toHaveBeenCalledWith(dog.id);
    expect(mocks.prismaDogRepo.save).toHaveBeenCalledWith(dog);
    expect(mocks.weightRecordRepo.create).toHaveBeenCalledWith({
      dogId: dog.id,
      recordDate: new Date('2026-04-06'),
      weightKg: 6.5,
      note: 'after breakfast',
      syncedToProfile: false,
    });
  });

  it('does not backfill Prisma when the dog already exists there', async () => {
    const mocks = createMocks();
    const dog = createDog();

    mocks.dogRepo.findById.mockResolvedValue(dog);
    mocks.prismaDogRepo.findById.mockResolvedValue(dog);
    mocks.weightRecordRepo.create.mockResolvedValue({
      id: 'record-1',
      dogId: dog.id,
      recordDate: new Date('2026-04-06'),
      weightKg: 6.5,
      note: null,
      syncedToProfile: false,
      createdAt: new Date('2026-04-06T12:00:00.000Z'),
    });

    const service = new WeightRecordService(
      mocks.weightRecordRepo as any,
      mocks.dogRepo as any,
      mocks.prismaDogRepo as any,
    );

    await service.create('customer-1', {
      dogId: dog.id,
      recordDate: '2026-04-06',
      weightKg: 6.5,
    });

    expect(mocks.prismaDogRepo.save).not.toHaveBeenCalled();
  });

  it('throws not found when the dog does not exist in the active repository', async () => {
    const mocks = createMocks();
    mocks.dogRepo.findById.mockResolvedValue(null);

    const service = new WeightRecordService(
      mocks.weightRecordRepo as any,
      mocks.dogRepo as any,
      mocks.prismaDogRepo as any,
    );

    await expect(
      service.create('customer-1', {
        dogId: 'missing-dog',
        recordDate: '2026-04-06',
        weightKg: 6.5,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws forbidden when the dog belongs to another customer', async () => {
    const mocks = createMocks();
    mocks.dogRepo.findById.mockResolvedValue(
      new Dog(
        'dog-1',
        'customer-2',
        'Seven',
        'breed-1',
        null,
        new Date('2023-01-01'),
        DogGender.MALE,
        true,
        6.7,
        5,
        ActivityLevel.NORMAL,
        LifeStageOverride.NONE,
        null,
        2,
        TreatInputMode.ESTIMATE_LEVEL,
        TreatLevel.LOW,
        null,
        null,
        null,
        null,
        452,
      ),
    );

    const service = new WeightRecordService(
      mocks.weightRecordRepo as any,
      mocks.dogRepo as any,
      mocks.prismaDogRepo as any,
    );

    await expect(
      service.create('customer-1', {
        dogId: 'dog-1',
        recordDate: '2026-04-06',
        weightKg: 6.5,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
