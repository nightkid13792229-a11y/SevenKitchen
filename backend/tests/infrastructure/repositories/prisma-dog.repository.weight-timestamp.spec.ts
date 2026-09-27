/**
 * 体重更新时间的写入规则（2026-09-27，决策 8 的前提）
 *
 * 老板定了「体重超过 60 天就提醒顾客更新」，但 dog 表原先只有 created_at，
 * 判断不出档案里的体重是什么时候录的。补了 weight_updated_at 之后，
 * 关键规则是：**只有体重真的变了才刷新**。
 *
 * 否则改个名字、换张头像都会让体重"看起来刚更新过"，
 * 提醒就永远不会触发 —— 这个字段也就白加了。
 */

import { PrismaDogRepository } from 'src/infrastructure/repositories/prisma-dog.repository';
import { Dog } from 'src/domain/dog/dog.entity';
import {
  ActivityLevel,
  DogGender,
  LifeStageOverride,
  TreatInputMode,
  TreatLevel,
} from 'src/domain';

describe('PrismaDogRepository 体重更新时间', () => {
  const buildDog = (currentWeightKg: number) =>
    new Dog(
      'dog-1',
      'owner-1',
      '豆豆',
      'breed-1',
      null,
      new Date('2023-04-06T00:00:00.000Z'),
      DogGender.MALE,
      false,
      currentWeightKg,
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

  const createRepository = (existing: { id: string; currentWeightKg: number } | null) => {
    const prisma = {
      dog: {
        // 第一次查用于判断是新建还是更新；第二次查用于回读保存结果（这里返回 null，
        // 让 save() 直接返回入参实体，测试只关注写入了什么）
        findUnique: jest.fn().mockResolvedValueOnce(existing).mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    return {
      repo: new PrismaDogRepository(prisma as any),
      prisma,
    };
  };

  it('新建档案时写入体重更新时间', async () => {
    const { repo, prisma } = createRepository(null);

    await repo.save(buildDog(6.7));

    expect(prisma.dog.create).toHaveBeenCalledTimes(1);
    expect(prisma.dog.create.mock.calls[0][0].data.weightUpdatedAt).toBeInstanceOf(Date);
  });

  it('体重变了就刷新（顾客更新了体重）', async () => {
    const { repo, prisma } = createRepository({ id: 'dog-1', currentWeightKg: 6.7 });

    await repo.save(buildDog(7.2));

    expect(prisma.dog.update).toHaveBeenCalledTimes(1);
    expect(prisma.dog.update.mock.calls[0][0].data.weightUpdatedAt).toBeInstanceOf(Date);
  });

  it('体重没变就不刷新（改名字、换头像不该让体重看起来刚更新过）', async () => {
    const { repo, prisma } = createRepository({ id: 'dog-1', currentWeightKg: 6.7 });

    await repo.save(buildDog(6.7));

    expect(prisma.dog.update).toHaveBeenCalledTimes(1);
    // 不写这个键 = 保持数据库里的原值
    expect(prisma.dog.update.mock.calls[0][0].data).not.toHaveProperty(
      'weightUpdatedAt',
    );
  });

  it('确认状态由实体携带写出（改档案时不会把已有确认清掉）', async () => {
    const { repo, prisma } = createRepository({ id: 'dog-1', currentWeightKg: 6.7 });
    const dog = buildDog(6.7);
    dog.bcsScoreConfirmedAt = new Date('2026-09-01T00:00:00.000Z');
    dog.activityLevelConfirmedAt = null;

    await repo.save(dog);

    const data = prisma.dog.update.mock.calls[0][0].data;
    expect(data.bcsScoreConfirmedAt).toEqual(new Date('2026-09-01T00:00:00.000Z'));
    expect(data.activityLevelConfirmedAt).toBeNull();
  });
});
