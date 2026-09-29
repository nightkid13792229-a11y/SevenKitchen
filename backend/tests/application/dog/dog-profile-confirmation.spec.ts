/**
 * 档案项目的「顾客是否亲自确认过」（2026-09-27）
 *
 * 背景：建档表单给体况评分、活动量、每日餐数都预填了默认值并渲染成"已选中"，
 * 顾客一路点下一步也会提交 —— 于是数据库里这几项**永远有值**，
 * 却分不清"顾客真的选过"还是"系统替他选的"（生产里 4544 只狗有 3466 只
 * 体况评分等于默认值 5，占 76%）。
 *
 * 老板定的定制门槛因此改成按"是否确认过"判定。这组测试锁住三条语义：
 *   1. 只有前端明确说"顾客点过"才记确认时间
 *   2. 不传确认标记 ≠ 未确认（新建时确实未确认）
 *   3. 改档案时不传确认标记，**不能清掉**已有的确认（改个名字不该让确认失效）
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  DogService,
  DOG_BREED_REPOSITORY,
  DOG_REPOSITORY,
  PRISMA_SERVICE,
  RECIPE_REPOSITORY,
} from 'src/application/dog/dog.service';
import type { DogRepository } from 'src/domain/dog/dog.repository';
import type { DogBreedRepository } from 'src/domain/dog/dog-breed.repository';
import type { RecipeRepository } from 'src/domain/recipe/recipe.repository';
import { Dog } from 'src/domain/dog/dog.entity';
import {
  ActivityLevel,
  DogGender,
  DogSizeCategory,
  GrowthCurveType,
  LifeStageOverride,
  TreatInputMode,
  TreatLevel,
} from 'src/domain';
import { DogBreed } from 'src/domain/dog/dog-breed.entity';
import { SearchGovernanceService } from 'src/application/search-governance/search-governance.service';
import { WeightGoalPlanService } from 'src/application/weight-goal-plan/weight-goal-plan.service';

describe('DogService 档案确认状态', () => {
  let service: DogService;
  let dogRepository: jest.Mocked<DogRepository>;
  let dogBreedRepository: jest.Mocked<DogBreedRepository>;

  const breedId = 'breed-mini-schnauzer';

  const mockDogRepository: jest.Mocked<DogRepository> = {
    findById: jest.fn(),
    findByOwnerId: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };

  const mockRecipeRepository = {
    findById: jest.fn(),
    findByIdAndVersion: jest.fn(),
    findPublicRecipes: jest.fn(),
  } as unknown as jest.Mocked<RecipeRepository>;

  const mockDogBreedRepository: jest.Mocked<DogBreedRepository> = {
    findById: jest.fn(),
    findAll: jest.fn(),
    findHotBreeds: jest.fn(),
    findBySizeCategory: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };

  const mockPrismaService = { order: { count: jest.fn() } };

  const createBreed = () =>
    new DogBreed(
      breedId,
      '迷你雪纳瑞',
      [],
      DogSizeCategory.SMALL,
      GrowthCurveType.STANDARD,
      12,
      8,
      8,
      false,
    );

  /** 取出 service 交给仓储保存的那个实体 */
  const savedDog = (): Dog => {
    expect(dogRepository.save).toHaveBeenCalledTimes(1);
    return dogRepository.save.mock.calls[0][0] as Dog;
  };

  const baseCreateDto = () => ({
    ownerId: 'owner-1',
    name: '豆豆',
    breedId,
    birthday: new Date('2023-04-06T00:00:00.000Z'),
    gender: DogGender.MALE,
    isNeutered: false,
    currentWeightKg: 6.7,
    bcsScore: 5,
    activityLevel: ActivityLevel.LOW,
    lifeStageOverride: LifeStageOverride.NONE,
    mealsPerDay: 2,
    treatInputMode: TreatInputMode.ESTIMATE_LEVEL,
    treatLevel: TreatLevel.LOW,
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DogService,
        {
          // 阶段 D1/D2：DogService 注入计划服务以让 calcPreview 反映计划。
          // 这里默认「没有生效中的计划」，保持既有用例的数值口径不变。
          provide: WeightGoalPlanService,
          useValue: {
            applyActivePlanOverride: jest.fn(
              async (_dogId: string, gross: number, treat: number) => ({
                finalFoodKcal: gross - treat,
                grossKcal: gross,
                source: 'ALGORITHM',
                planKcal: null,
              }),
            ),
          },
        },
        { provide: DOG_REPOSITORY, useValue: mockDogRepository },
        { provide: RECIPE_REPOSITORY, useValue: mockRecipeRepository },
        { provide: DOG_BREED_REPOSITORY, useValue: mockDogBreedRepository },
        { provide: PRISMA_SERVICE, useValue: mockPrismaService },
        {
          provide: SearchGovernanceService,
          useValue: {
            expandQuery: jest.fn(async (_d: string, q: string) => (q ? [q] : [])),
            recordSearchEvent: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DogService>(DogService);
    dogRepository = module.get(DOG_REPOSITORY);
    dogBreedRepository = module.get(DOG_BREED_REPOSITORY);

    dogBreedRepository.findById.mockResolvedValue(createBreed());
    dogRepository.save.mockImplementation(async (dog: Dog) => dog);
  });

  describe('新建档案', () => {
    it('前端说"顾客点过"，才记确认时间', async () => {
      await service.createDogProfile({
        ...baseCreateDto(),
        bcsScoreConfirmed: true,
        activityLevelConfirmed: true,
        mealsPerDayConfirmed: true,
      });

      const dog = savedDog();
      expect(dog.bcsScoreConfirmedAt).toBeInstanceOf(Date);
      expect(dog.activityLevelConfirmedAt).toBeInstanceOf(Date);
      expect(dog.mealsPerDayConfirmedAt).toBeInstanceOf(Date);
    });

    it('不传确认标记时保持未确认（默认值不代表顾客选过）', async () => {
      await service.createDogProfile(baseCreateDto());

      const dog = savedDog();
      expect(dog.bcsScoreConfirmedAt).toBeNull();
      expect(dog.activityLevelConfirmedAt).toBeNull();
      expect(dog.mealsPerDayConfirmedAt).toBeNull();
    });

    it('只确认了其中一项时，其余仍为未确认', async () => {
      await service.createDogProfile({
        ...baseCreateDto(),
        activityLevelConfirmed: true,
      });

      const dog = savedDog();
      expect(dog.activityLevelConfirmedAt).toBeInstanceOf(Date);
      expect(dog.bcsScoreConfirmedAt).toBeNull();
      expect(dog.mealsPerDayConfirmedAt).toBeNull();
    });

    it('建档时就记下体重更新时间（60 天提醒的数据基础）', async () => {
      await service.createDogProfile(baseCreateDto());

      expect(savedDog().weightUpdatedAt).toBeInstanceOf(Date);
    });
  });

  describe('修改档案', () => {
    const existingDog = (overrides: Partial<Dog> = {}) => {
      const dog = new Dog(
        'dog-1',
        'owner-1',
        '豆豆',
        breedId,
        null,
        new Date('2023-04-06T00:00:00.000Z'),
        DogGender.MALE,
        false,
        6.7,
        5,
        ActivityLevel.LOW,
        LifeStageOverride.NONE,
        null,
        2,
        TreatInputMode.ESTIMATE_LEVEL,
        TreatLevel.LOW,
        null,
        null,
        null,
        452,
      );
      // 已有档案：体况评分此前已确认过，活动量从未确认
      dog.bcsScoreConfirmedAt = new Date('2026-09-01T00:00:00.000Z');
      Object.assign(dog, overrides);
      return dog;
    };

    it('顾客这次确认了活动量，就补上确认时间', async () => {
      dogRepository.findById.mockResolvedValue(existingDog());

      await service.updateDogProfile('dog-1', {
        activityLevel: ActivityLevel.NORMAL,
        activityLevelConfirmed: true,
      });

      const dog = savedDog();
      expect(dog.activityLevelConfirmedAt).toBeInstanceOf(Date);
    });

    it('没传确认标记时，不能清掉已有的确认时间（改个名字不该让确认失效）', async () => {
      dogRepository.findById.mockResolvedValue(existingDog());

      await service.updateDogProfile('dog-1', { name: '豆豆二号' });

      const dog = savedDog();
      expect(dog.bcsScoreConfirmedAt).toEqual(
        new Date('2026-09-01T00:00:00.000Z'),
      );
      expect(dog.activityLevelConfirmedAt).toBeNull();
    });

    it('明确传 false 也不清掉已有确认（避免前端漏传/简化处理造成误清）', async () => {
      dogRepository.findById.mockResolvedValue(existingDog());

      await service.updateDogProfile('dog-1', { bcsScoreConfirmed: false });

      expect(savedDog().bcsScoreConfirmedAt).toEqual(
        new Date('2026-09-01T00:00:00.000Z'),
      );
    });
  });
});
