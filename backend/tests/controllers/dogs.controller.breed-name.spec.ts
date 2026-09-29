import { DogsController } from '../../src/interfaces/controllers/dogs.controller';
import { MIXED_BREED_VIRTUAL_ID } from '../../src/domain/dog/constants';
import { Dog } from '../../src/domain/dog/dog.entity';
import {
  ActivityLevel,
  DogGender,
  LifeStageOverride,
  TreatInputMode,
  TreatLevel,
} from '../../src/domain';

/**
 * 四个返回狗狗档案的接口必须给出**同一份 breedName**
 * （列表 / 详情 / 建档 / 更新）。
 *
 * 2026-09-28 修复的真实缺陷：建档（POST）与更新（PUT）当时没有传 breedMap，
 * 回的 breedName 恒为 null（除非有自定义品种名）。
 *
 * 顾客侧后果：「食谱定制」页确认定制门槛后把 PUT 响应合并回选中的狗，
 * 品种从"柯基"变成"未知品种"，而同一屏顶部的选择器（用的是列表阶段拼好的
 * 字符串）仍显示"面包 - 柯基"，同一屏自相矛盾。
 * 员工端、爱犬概览页保存后也有同样的问题（它们同样消费 PUT 响应）。
 */
describe('DogsController breedName consistency', () => {
  const OWNER_USER = {
    userId: 'owner-1',
    customerId: 'owner-1',
    role: 'CUSTOMER',
  } as any;

  function createDog(overrides: Partial<Dog> = {}) {
    return Object.assign(
      new Dog(
        'dog-1',
        'owner-1',
        '面包',
        'breed-corgi',
        null,
        new Date('2024-04-09T00:00:00.000Z'),
        DogGender.MALE,
        true,
        15,
        6,
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

  function createController(breed: any = { id: 'breed-corgi', name: '柯基' }) {
    const dog = createDog();
    // 注意：系统品种存在时 findById 命中；品种表里没有的品种才返回 null
    const CORGI = breed;

    const dogRepository = {
      findById: jest.fn().mockResolvedValue(dog),
      findByOwnerId: jest.fn().mockResolvedValue([dog]),
      save: jest.fn().mockResolvedValue(dog),
    };
    const dogBreedRepository = {
      findById: jest.fn(async (id: string) =>
        CORGI && id === CORGI.id ? CORGI : null,
      ),
      findAll: jest.fn().mockResolvedValue([CORGI]),
    };
    const dogService = {
      createDogProfile: jest.fn().mockResolvedValue(dog),
      updateDogProfile: jest.fn().mockResolvedValue(dog),
      calcPreview: jest.fn().mockRejectedValue(new Error('skip in test')),
    };

    const controller = new DogsController(
      dogRepository as any,
      dogBreedRepository as any,
      {} as any,
      { findByDogId: jest.fn().mockResolvedValue([]), delete: jest.fn(), create: jest.fn() } as any,
      { findByDogId: jest.fn().mockResolvedValue([]), delete: jest.fn(), create: jest.fn() } as any,
      { findByDogId: jest.fn().mockResolvedValue([]), delete: jest.fn(), create: jest.fn() } as any,
      dogService as any,
      {} as any,
      {} as any,
      { deleteImageByUrl: jest.fn() } as any,
      {} as any,
    );

    return { controller, dogRepository, dogBreedRepository, dogService, dog };
  }

  it('列表接口给出品种名（基准）', async () => {
    const { controller } = createController();

    const result: any = await (controller as any).listDogs(OWNER_USER);

    expect(result.code).toBe(0);
    expect(result.data[0].breedName).toBe('柯基');
  });

  it('详情接口给出品种名（基准）', async () => {
    const { controller } = createController();

    const result: any = await (controller as any).getDog('dog-1', OWNER_USER);

    expect(result.code).toBe(0);
    expect(result.data.profile.breedName).toBe('柯基');
  });

  it('更新接口必须给出品种名（曾经的缺陷：恒为 null）', async () => {
    const { controller } = createController();

    const result: any = await (controller as any).updateDog(
      'dog-1',
      { bcsScore: 6, bcsScoreConfirmed: true },
      OWNER_USER,
    );

    expect(result.code).toBe(0);
    // 顾客点一次"确认并继续"，页面上的品种不能因此变成"未知品种"
    expect(result.data.profile.breedName).toBe('柯基');
  });

  it('建档接口必须给出品种名（曾经的缺陷：恒为 null）', async () => {
    const { controller } = createController();

    const result: any = await (controller as any).createDog(
      { name: '面包', breedId: 'breed-corgi', birthday: '2024-04-09' } as any,
      OWNER_USER,
    );

    expect(result.code).toBe(0);
    // 建档完成后会把这条响应写进本地缓存，品种为空会让爱犬列表显示"未知品种"
    expect(result.data.profile.breedName).toBe('柯基');
  });

  it('自定义品种名优先于系统品种名（这条规则不能被改掉）', async () => {
    const { controller, dogRepository } = createController();
    dogRepository.findById.mockResolvedValue(
      createDog({ customBreedName: '柯基串串' }),
    );

    const result: any = await (controller as any).getDog('dog-1', OWNER_USER);

    expect(result.data.profile.breedName).toBe('柯基串串');
  });

  it('品种表里查不到时回 null，而不是编一个名字', async () => {
    const { controller, dogBreedRepository } = createController();
    dogBreedRepository.findById.mockResolvedValue(null);
    dogBreedRepository.findAll.mockResolvedValue([]);

    const detail: any = await (controller as any).getDog('dog-1', OWNER_USER);
    const updated: any = await (controller as any).updateDog(
      'dog-1',
      { bcsScore: 6 },
      OWNER_USER,
    );

    expect(detail.data.profile.breedName).toBeNull();
    expect(updated.data.profile.breedName).toBeNull();
  });

  it('四个接口对同一只狗给出的品种名完全一致', async () => {
    const { controller } = createController();

    const list: any = await (controller as any).listDogs(OWNER_USER);
    const detail: any = await (controller as any).getDog('dog-1', OWNER_USER);
    const created: any = await (controller as any).createDog(
      { name: '面包', breedId: 'breed-corgi' } as any,
      OWNER_USER,
    );
    const updated: any = await (controller as any).updateDog(
      'dog-1',
      { bcsScore: 5 },
      OWNER_USER,
    );

    expect([
      list.data[0].breedName,
      detail.data.profile.breedName,
      created.data.profile.breedName,
      updated.data.profile.breedName,
    ]).toEqual(['柯基', '柯基', '柯基', '柯基']);
  });
});

/**
 * 体况问卷的选项换算表（深胸细腰型犬）必须和品种名一样，四个接口给出同一份。
 *
 * 背景：灵缇、惠比特这类犬在理想体态下就能摸到肋骨且几乎没肉，
 * 按标准分 2/3/5/7/9 会被算成 2-3 分，算法据此把目标体重定高 33-54%、
 * 逼一只正常狗增重。换算表设在犬种表里（bcs_score_map），由这里随档案下发，
 * 小程序拿它把选项换算成体况分。
 *
 * 它和 breedName 走的是同一条链路（breedMap），所以同样有
 * "四个接口必须一致"的要求 —— 否则顾客在某一屏看到 2 分、另一屏看到 5 分。
 */
describe('DogsController bcsScoreMap consistency', () => {
  const OWNER_USER = {
    userId: 'owner-1',
    customerId: 'owner-1',
    role: 'CUSTOMER',
  } as any;

  function createDogFor(breedId: string, customBreedName: string | null = null) {
    return Object.assign(
      new Dog(
        'dog-1',
        'owner-1',
        '面包',
        breedId,
        customBreedName,
        new Date('2024-04-09T00:00:00.000Z'),
        DogGender.MALE,
        true,
        15,
        6,
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
      {},
    );
  }

  function controllerWith(dog: Dog, breed: any) {
    const dogRepository = {
      findById: jest.fn().mockResolvedValue(dog),
      findByOwnerId: jest.fn().mockResolvedValue([dog]),
      save: jest.fn().mockResolvedValue(dog),
    };
    const dogBreedRepository = {
      // 必须按 ID 命中：无视 ID 一律返回同一只犬种，会让"混血犬拿不到下限"
      // 这条规则在测试里假通过（真实仓储 findById 是按主键查的）
      findById: jest.fn(async (id: string) =>
        breed && id === breed.id ? breed : null,
      ),
      findAll: jest.fn().mockResolvedValue(breed ? [breed] : []),
    };
    const dogService = {
      createDogProfile: jest.fn().mockResolvedValue(dog),
      updateDogProfile: jest.fn().mockResolvedValue(dog),
      calcPreview: jest.fn().mockRejectedValue(new Error('skip in test')),
    };
    return new DogsController(
      dogRepository as any,
      dogBreedRepository as any,
      {} as any,
      { findByDogId: jest.fn().mockResolvedValue([]), delete: jest.fn(), create: jest.fn() } as any,
      { findByDogId: jest.fn().mockResolvedValue([]), delete: jest.fn(), create: jest.fn() } as any,
      { findByDogId: jest.fn().mockResolvedValue([]), delete: jest.fn(), create: jest.fn() } as any,
      dogService as any,
      {} as any,
      {} as any,
      { deleteImageByUrl: jest.fn() } as any,
      {} as any,
    );
  }

  const GREYHOUND = {
    id: 'breed-greyhound',
    name: '灵缇',
    bcsScoreMap: [4, 5, 6, 7, 9],
  };

  it('灵缇：四个接口都下发换算表 [4,5,6,7,9]', async () => {
    const controller = controllerWith(
      createDogFor('breed-greyhound'),
      GREYHOUND,
    );

    const list: any = await (controller as any).listDogs(OWNER_USER);
    const detail: any = await (controller as any).getDog('dog-1', OWNER_USER);
    const created: any = await (controller as any).createDog(
      { name: '面包', breedId: 'breed-greyhound' } as any,
      OWNER_USER,
    );
    const updated: any = await (controller as any).updateDog(
      'dog-1',
      { bcsScore: 2, bcsScoreConfirmed: true },
      OWNER_USER,
    );

    expect([
      list.data[0].bcsScoreMap,
      detail.data.profile.bcsScoreMap,
      created.data.profile.bcsScoreMap,
      updated.data.profile.bcsScoreMap,
    ]).toEqual([
      [4, 5, 6, 7, 9],
      [4, 5, 6, 7, 9],
      [4, 5, 6, 7, 9],
      [4, 5, 6, 7, 9],
    ]);
  })

  it('普通犬种没有换算表 → 空数组（用标准分）', async () => {
    const controller = controllerWith(createDogFor('breed-corgi'), {
      id: 'breed-corgi',
      name: '柯基',
    });

    const detail: any = await (controller as any).getDog('dog-1', OWNER_USER);

    expect(detail.data.profile.bcsScoreMap).toEqual([]);
  })

  it('混血犬（虚拟犬种 ID）没有换算表 —— 不能拿自定义名字去猜犬种', async () => {
    const controller = controllerWith(
      createDogFor(MIXED_BREED_VIRTUAL_ID, '灵缇串串'),
      GREYHOUND,
    );

    const detail: any = await (controller as any).getDog('dog-1', OWNER_USER);

    // 名字看着像灵缇也不给换算表：只认标准犬种记录
    expect(detail.data.profile.breedName).toBe('灵缇串串');
    expect(detail.data.profile.bcsScoreMap).toEqual([]);
  })

  it('犬种接口（小程序建档页用）也返回换算表', async () => {
    const controller = controllerWith(
      createDogFor('breed-greyhound'),
      GREYHOUND,
    );

    const result: any = await (controller as any).listBreeds();

    expect(result.code).toBe(0);
    expect(result.data[0].bcsScoreMap).toEqual([4, 5, 6, 7, 9]);
    expect(result.data[0].name).toBe('灵缇');
  })
});
