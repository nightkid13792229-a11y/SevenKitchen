import { DogsController } from '../../src/interfaces/controllers/dogs.controller';

describe('DogsController attachment cleanup', () => {
  function createController() {
    const dogRepository = {};
    const dogBreedRepository = {};
    const recipeRepository = {};
    const medicalRecordRepository = {
      findByDogId: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(),
    };
    const checkupRecordRepository = {
      findByDogId: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(),
    };
    const allergyRecordRepository = {
      findByDogId: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(),
    };
    const dogService = {
      updateDogProfile: jest.fn(),
      calcPreview: jest.fn(),
    };
    const weightRecordService = {};
    const prisma = {};
    const cosService = {
      deleteImage: jest.fn(),
    };

    const controller = new DogsController(
      dogRepository as any,
      dogBreedRepository as any,
      recipeRepository as any,
      medicalRecordRepository as any,
      checkupRecordRepository as any,
      allergyRecordRepository as any,
      dogService as any,
      weightRecordService as any,
      prisma as any,
      cosService as any,
    );

    return {
      controller,
      medicalRecordRepository,
      checkupRecordRepository,
      allergyRecordRepository,
      dogService,
      cosService,
    };
  }

  it('deletes removed medical attachment files from COS after a successful update', async () => {
    const {
      controller,
      medicalRecordRepository,
      dogService,
      cosService,
    } = createController();

    const dogId = 'dog-1';
    medicalRecordRepository.findByDogId.mockResolvedValue([
      {
        id: 'medical-1',
        attachments: [
          'https://img.sevenkitchen.cloud/medical-records/keep.jpg',
          'https://img.sevenkitchen.cloud/medical-records/remove.jpg',
        ],
      },
    ]);
    medicalRecordRepository.delete.mockResolvedValue(undefined);
    medicalRecordRepository.create.mockResolvedValue(undefined);
    dogService.updateDogProfile.mockResolvedValue({
      id: dogId,
      ownerId: 'owner-1',
      name: 'Seven',
      breedId: 'breed-1',
      customBreedName: null,
      birthday: new Date('2025-04-09T00:00:00.000Z'),
      gender: 'MALE',
      isNeutered: true,
      currentWeightKg: 12,
      bcsScore: 5,
      activityLevel: 'NORMAL',
      lifeStageOverride: 'NONE',
      sizeClassOverride: null,
      mealsPerDay: 2,
      treatInputMode: 'ESTIMATE_LEVEL',
      treatLevel: 'LOW',
      manualTreatKcal: null,
      medicalHistory: null,
      allergyFoods: null,
      pickyFoods: null,
      cachedTargetFoodKcal: 0,
    });
    dogService.calcPreview.mockResolvedValue(null);
    cosService.deleteImage.mockResolvedValue(undefined);

    await controller.updateDog(dogId, {
      medicalRecords: [
        {
          chiefComplaint: '胃炎',
          visitDate: '2026-04-09',
          diagnosis: '恢复中',
          notes: '',
          attachments: ['https://img.sevenkitchen.cloud/medical-records/keep.jpg'],
        },
      ],
    } as any);

    expect(cosService.deleteImage).toHaveBeenCalledWith(
      'medical-records/remove.jpg',
    );
    expect(cosService.deleteImage).not.toHaveBeenCalledWith(
      'medical-records/keep.jpg',
    );
  });
});
