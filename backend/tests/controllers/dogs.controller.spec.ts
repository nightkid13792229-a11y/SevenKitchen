import { DogsController } from '../../src/interfaces/controllers/dogs.controller';
import { Dog } from '../../src/domain/dog/dog.entity';
import {
  ActivityLevel,
  DogGender,
  LifeStageOverride,
  TreatInputMode,
  TreatLevel,
} from '../../src/domain';
import { UpdateDogDto } from '../../src/interfaces/dto/dogs/update-dog.dto';

describe('DogsController attachment cleanup', () => {
  function createDog(overrides: Partial<Dog> = {}) {
    return Object.assign(
      new Dog(
        'dog-1',
        'owner-1',
        'Seven',
        'breed-1',
        null,
        new Date('2025-04-09T00:00:00.000Z'),
        DogGender.MALE,
        true,
        12,
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
        0,
        null,
      ),
      overrides,
    );
  }

  function createController() {
    const dogRepository = {
      findById: jest.fn(),
      save: jest.fn(),
    };
    const dogBreedRepository = {
      findById: jest.fn(),
    };
    const recipeRepository = {};
    const medicalRecordRepository = {
      findByDogId: jest.fn().mockResolvedValue([]),
      delete: jest.fn(),
      create: jest.fn(),
    };
    const checkupRecordRepository = {
      findByDogId: jest.fn().mockResolvedValue([]),
      delete: jest.fn(),
      create: jest.fn(),
    };
    const allergyRecordRepository = {
      findByDogId: jest.fn().mockResolvedValue([]),
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
      uploadImage: jest.fn(),
      deleteImage: jest.fn(),
      deleteImageByUrl: jest.fn(),
    };
    const orderService = {
      listDogFinishedFoodHistory: jest.fn(),
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
      orderService as any,
    );

    return {
      controller,
      dogRepository,
      dogBreedRepository,
      medicalRecordRepository,
      checkupRecordRepository,
      allergyRecordRepository,
      dogService,
      cosService,
      orderService,
    };
  }

  it('lists finished-food order history only for the current customer dog', async () => {
    const { controller, dogRepository, orderService } = createController();
    dogRepository.findById.mockResolvedValue(createDog({ ownerId: 'owner-1' }));
    orderService.listDogFinishedFoodHistory.mockResolvedValue([
      {
        orderId: 'order-1',
        recipeName: '鸡肉牛肉鲜食',
      },
    ]);

    const result = await (controller as any).listFinishedFoodHistory(
      'dog-1',
      { customerId: 'owner-1' },
    );

    expect(dogRepository.findById).toHaveBeenCalledWith('dog-1');
    expect(orderService.listDogFinishedFoodHistory).toHaveBeenCalledWith(
      'dog-1',
      'owner-1',
    );
    expect(result.code).toBe(0);
    expect(result.data[0]).toMatchObject({
      orderId: 'order-1',
      recipeName: '鸡肉牛肉鲜食',
    });
  });

  it('does not expose another customer dog finished-food history', async () => {
    const { controller, dogRepository, orderService } = createController();
    dogRepository.findById.mockResolvedValue(createDog({ ownerId: 'owner-2' }));

    const result = await (controller as any).listFinishedFoodHistory(
      'dog-1',
      { customerId: 'owner-1' },
    );

    expect(result.code).toBe(404);
    expect(orderService.listDogFinishedFoodHistory).not.toHaveBeenCalled();
  });

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

  it('fails the dog update instead of deleting old records when medical record creation fails', async () => {
    const {
      controller,
      medicalRecordRepository,
      dogService,
    } = createController();

    const dogId = 'dog-1';
    medicalRecordRepository.findByDogId.mockResolvedValue([
      {
        id: 'medical-old',
        attachments: [],
      },
    ]);
    medicalRecordRepository.create.mockRejectedValue(new Error('medical create failed'));
    dogService.updateDogProfile.mockResolvedValue(createDog({ id: dogId }));
    dogService.calcPreview.mockResolvedValue(null);

    await expect(
      controller.updateDog(dogId, {
        medicalRecords: [
          {
            chiefComplaint: '胃炎',
            visitDate: '2026-04-09',
            diagnosis: '恢复中',
            notes: '',
            attachments: [],
          },
        ],
      } as any),
    ).rejects.toThrow('medical create failed');

    expect(medicalRecordRepository.delete).not.toHaveBeenCalled();
  });

  it('returns freshly loaded health records after saving a dog health section', async () => {
    const {
      controller,
      medicalRecordRepository,
      checkupRecordRepository,
      allergyRecordRepository,
      dogService,
    } = createController();

    const dogId = 'dog-1';
    medicalRecordRepository.findByDogId
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'medical-new',
          chiefComplaint: '胃炎',
          visitDate: new Date('2026-04-09T00:00:00.000Z'),
          diagnosis: '恢复中',
          notes: '继续观察',
          attachments: [],
        },
      ]);
    checkupRecordRepository.findByDogId.mockResolvedValue([
      {
        id: 'checkup-1',
        checkupDate: new Date('2026-04-10T00:00:00.000Z'),
        checkupType: '年度体检',
        findings: '正常',
        attachments: [],
      },
    ]);
    allergyRecordRepository.findByDogId.mockResolvedValue([
      {
        id: 'allergy-1',
        allergen: '鸡肉',
        notes: '腹泻',
        attachments: [],
      },
    ]);
    medicalRecordRepository.create.mockResolvedValue(undefined);
    dogService.updateDogProfile.mockResolvedValue(createDog({ id: dogId }));
    dogService.calcPreview.mockResolvedValue(null);

    const result: any = await controller.updateDog(dogId, {
      medicalRecords: [
        {
          chiefComplaint: '胃炎',
          visitDate: '2026-04-09',
          diagnosis: '恢复中',
          notes: '继续观察',
          attachments: [],
        },
      ],
    } as any);

    expect(result.data.profile.medicalRecords).toEqual([
      {
        id: 'medical-new',
        chiefComplaint: '胃炎',
        visitDate: '2026-04-09',
        diagnosis: '恢复中',
        notes: '继续观察',
        attachments: [],
      },
    ]);
    expect(result.data.profile.checkupRecords).toEqual([
      {
        id: 'checkup-1',
        checkupDate: '2026-04-10',
        checkupType: '年度体检',
        notes: '正常',
        attachments: [],
      },
    ]);
    expect(result.data.profile.allergyRecords).toEqual([
      {
        id: 'allergy-1',
        allergen: '鸡肉',
        notes: '腹泻',
        attachments: [],
      },
    ]);
  });

  it('does not clear health records when only diet reminders are updated', async () => {
    const {
      controller,
      medicalRecordRepository,
      checkupRecordRepository,
      allergyRecordRepository,
      dogService,
    } = createController();

    const dogId = 'dog-1';
    const dto = Object.assign(new UpdateDogDto(), {
      pickyFoods: '鸡蛋',
      medicalRecords: undefined,
      checkupRecords: undefined,
      allergyRecords: undefined,
    });

    medicalRecordRepository.findByDogId.mockResolvedValue([
      {
        id: 'medical-1',
        chiefComplaint: '胃炎',
        visitDate: new Date('2026-04-09T00:00:00.000Z'),
        diagnosis: '恢复中',
        notes: '继续观察',
        attachments: [],
      },
    ]);
    checkupRecordRepository.findByDogId.mockResolvedValue([
      {
        id: 'checkup-1',
        checkupDate: new Date('2026-04-10T00:00:00.000Z'),
        checkupType: 'ROUTINE',
        findings: '正常',
        attachments: [],
      },
    ]);
    allergyRecordRepository.findByDogId.mockResolvedValue([
      {
        id: 'allergy-1',
        allergen: '鸡肉',
        notes: '腹泻',
        attachments: [],
      },
    ]);
    dogService.updateDogProfile.mockResolvedValue(createDog({ id: dogId }));
    dogService.calcPreview.mockResolvedValue(null);

    await controller.updateDog(dogId, dto);

    expect(medicalRecordRepository.findByDogId).toHaveBeenCalledTimes(1);
    expect(checkupRecordRepository.findByDogId).toHaveBeenCalledTimes(1);
    expect(allergyRecordRepository.findByDogId).toHaveBeenCalledTimes(1);
    expect(medicalRecordRepository.delete).not.toHaveBeenCalled();
    expect(checkupRecordRepository.delete).not.toHaveBeenCalled();
    expect(allergyRecordRepository.delete).not.toHaveBeenCalled();
    expect(medicalRecordRepository.create).not.toHaveBeenCalled();
    expect(checkupRecordRepository.create).not.toHaveBeenCalled();
    expect(allergyRecordRepository.create).not.toHaveBeenCalled();
  });

  it('loads allergy records without legacy allergy fields on dog detail', async () => {
    const {
      controller,
      dogRepository,
      dogBreedRepository,
      allergyRecordRepository,
      dogService,
    } = createController();

    const dog = createDog();
    dogRepository.findById.mockResolvedValue(dog);
    dogBreedRepository.findById.mockResolvedValue(null);
    allergyRecordRepository.findByDogId.mockResolvedValue([
      {
        id: 'allergy-1',
        allergen: '鸡肉',
        notes: '腹泻',
        attachments: [],
      },
    ]);
    dogService.calcPreview.mockResolvedValue(null);

    const result: any = await controller.getDog(dog.id);

    expect(result.data.profile.allergyRecords).toEqual([
      {
        id: 'allergy-1',
        allergen: '鸡肉',
        notes: '腹泻',
        attachments: [],
      },
    ]);
  });

  it('persists the uploaded dog avatar url back onto the dog profile', async () => {
    const {
      controller,
      dogRepository,
      cosService,
    } = createController();

    const dog = createDog();
    dogRepository.findById.mockResolvedValue(dog);
    dogRepository.save.mockImplementation(async (nextDog) => nextDog);
    cosService.uploadImage.mockResolvedValue({
      url: 'https://img.sevenkitchen.cloud/dogs/avatars/new-avatar.png',
      key: 'dogs/avatars/new-avatar.png',
    });

    const result: any = await controller.uploadDogAvatar(
      dog.id,
      {
        size: 1024,
        mimetype: 'image/png',
        originalname: 'avatar.png',
        buffer: Buffer.from('avatar'),
      } as any,
      { customerId: dog.ownerId } as any,
    );

    expect(dogRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      id: dog.id,
      avatarUrl: 'https://img.sevenkitchen.cloud/dogs/avatars/new-avatar.png',
    }));
    expect(result.data.url).toBe('https://img.sevenkitchen.cloud/dogs/avatars/new-avatar.png');
  });

  it('deletes the previous dog avatar from COS after the new avatar is saved', async () => {
    const {
      controller,
      dogRepository,
      cosService,
    } = createController();

    const dog = createDog({
      avatarUrl: 'https://img.sevenkitchen.cloud/dogs/avatars/old-avatar.png',
    });
    dogRepository.findById.mockResolvedValue(dog);
    dogRepository.save.mockImplementation(async (nextDog) => nextDog);
    cosService.uploadImage.mockResolvedValue({
      url: 'https://img.sevenkitchen.cloud/dogs/avatars/new-avatar.png',
      key: 'dogs/avatars/new-avatar.png',
    });
    cosService.deleteImageByUrl.mockResolvedValue(undefined);

    await controller.uploadDogAvatar(
      dog.id,
      {
        size: 1024,
        mimetype: 'image/png',
        originalname: 'avatar.png',
        buffer: Buffer.from('avatar'),
      } as any,
      { customerId: dog.ownerId } as any,
    );

    expect(cosService.deleteImageByUrl).toHaveBeenCalledWith(
      'https://img.sevenkitchen.cloud/dogs/avatars/old-avatar.png',
    );
  });

  it('accepts HEIC medical attachments from iPhone uploads', async () => {
    const {
      controller,
      cosService,
    } = createController();

    cosService.uploadImage.mockResolvedValue({
      url: 'https://img.sevenkitchen.cloud/medical-reports/temp/report.heic',
      key: 'medical-reports/temp/report.heic',
    });

    const result: any = await controller.uploadMedicalAttachment(
      {
        size: 1024,
        mimetype: 'image/heic',
        originalname: 'report.heic',
        buffer: Buffer.from('image'),
      } as any,
      { customerId: 'owner-1' } as any,
    );

    expect(cosService.uploadImage).toHaveBeenCalledWith(
      expect.objectContaining({ originalname: 'report.heic' }),
      'report.heic',
      'medical-reports/temp',
    );
    expect(result.data.url).toBe(
      'https://img.sevenkitchen.cloud/medical-reports/temp/report.heic',
    );
  });

  it('accepts HEIF checkup attachments by file extension when mimetype is generic', async () => {
    const {
      controller,
      cosService,
    } = createController();

    cosService.uploadImage.mockResolvedValue({
      url: 'https://img.sevenkitchen.cloud/checkup-reports/temp/report.heif',
      key: 'checkup-reports/temp/report.heif',
    });

    const result: any = await controller.uploadCheckupAttachment(
      {
        size: 1024,
        mimetype: 'application/octet-stream',
        originalname: 'report.HEIF',
        buffer: Buffer.from('image'),
      } as any,
      { customerId: 'owner-1' } as any,
    );

    expect(cosService.uploadImage).toHaveBeenCalledWith(
      expect.objectContaining({ originalname: 'report.HEIF' }),
      'report.HEIF',
      'checkup-reports/temp',
    );
    expect(result.data.url).toBe(
      'https://img.sevenkitchen.cloud/checkup-reports/temp/report.heif',
    );
  });
});
