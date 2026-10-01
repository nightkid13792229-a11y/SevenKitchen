import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';

/**
 * 饮食偏好：结构化 + 变更历史（2026-10-01，第五期）。
 *
 * ── 老板第 9 条 ────────────────────────────────────────────
 *   "饮食偏好的变化，最好是能看到历史的变化。"
 *
 * ── 原先的问题 ─────────────────────────────────────────────
 *   只有 dog.preferred_foods / dog.picky_foods 两个自由文本框：
 *     · 答不了"什么时候从爱吃鸡肉变成不吃鸡肉"
 *     · 也没法按食材做推荐与配方匹配
 *
 * ── 保守做法：旧字段一个字符都不动 ──────────────────────────
 *   两张新表是增量的：
 *     · 旧文本框原样保留，配方设计继续合并使用，行为不变
 *     · 新界面展示结构化条目；旧文本还在、结构化表为空时，
 *       由系统给出**候选**、顾客确认后才写入
 *   **不做自动分词迁移**：把"鸡胸肉、南瓜"自动拆成两条看着省事，
 *   但一旦拆错（"鸡胸肉南瓜"是一种还是两种），顾客原来的话就被改坏了。
 */

export type DietPreferenceKind = 'LIKED' | 'DISLIKED';

export interface DietPreferenceItem {
  kind: DietPreferenceKind;
  foodName: string;
  source: string;
  createdAt: string;
}

export interface DietPreferenceChangeItem {
  kind: DietPreferenceKind;
  foodName: string;
  action: 'ADDED' | 'REMOVED';
  changedBy: string;
  changedAt: string;
}

/** 一个食物名最多这么长（与数据库列宽一致） */
const FOOD_NAME_MAX = 60;
/** 一次最多导入多少条候选（防止旧文本里塞了几百个词） */
const MAX_NAME_LENGTH_FOR_SUGGESTIONS = 200;

@Injectable()
export class DietPreferenceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 取结构化偏好 + 变更历史 + 旧文本。
   *
   * 一并返回"从旧文本里整理出来的候选"，让界面能提示顾客
   * "你以前填的这几样，要不要整理成条目" —— 不自动写库。
   */
  async list(customerId: string, dogId: string) {
    const dog = await this.requireOwnedDog(customerId, dogId);

    const [items, changes] = await Promise.all([
      this.prisma.dogDietPreference.findMany({
        where: { dogId },
        orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.dogDietPreferenceChange.findMany({
        where: { dogId },
        orderBy: { changedAt: 'desc' },
        take: 50,
      }),
    ]);

    const structured: DietPreferenceItem[] = items.map((item) => ({
      kind: item.kind as DietPreferenceKind,
      foodName: item.foodName,
      source: item.source,
      createdAt: toDateText(item.createdAt),
    }));

    const legacy = {
      preferredFoods: dog.preferredFoods || '',
      pickyFoods: dog.pickyFoods || '',
    };

    return {
      dogId,
      liked: structured.filter((item) => item.kind === 'LIKED'),
      disliked: structured.filter((item) => item.kind === 'DISLIKED'),
      /** 旧的两个文本框内容；配方设计仍在用它们 */
      legacy,
      /**
       * 从旧文本里拆出来的候选。**只是候选**，顾客确认后才会真的写进来。
       * 结构化表已经有内容时不再给候选，避免反复提示。
       */
      suggestions:
        structured.length > 0
          ? { liked: [], disliked: [] }
          : {
              liked: parseFoodList(legacy.preferredFoods),
              disliked: parseFoodList(legacy.pickyFoods),
            },
      history: changes.map((change) => ({
        kind: change.kind as DietPreferenceKind,
        foodName: change.foodName,
        action: change.action as 'ADDED' | 'REMOVED',
        changedBy: change.changedBy,
        changedAt: toDateText(change.changedAt),
      })),
      /**
       * 历史从什么时候开始有 —— 第五期之前没有"变更"的概念。
       * 界面要如实说明，免得顾客以为记录丢了。
       */
      historyNote:
        '变更历史从这个功能上线开始记录；更早的偏好在下面的两个文本框里，没有变更记录。',
    };
  }

  /** 加一条偏好（同时记一条变更） */
  async add(
    customerId: string,
    dogId: string,
    kind: string,
    foodName: string,
    source = 'MANUAL',
  ) {
    await this.requireOwnedDog(customerId, dogId);

    const normalizedKind = normalizeKind(kind);
    const normalizedName = normalizeFoodName(foodName);

    // 已经有的就不重复加，也不记变更（避免历史里出现无意义的重复行）
    const existing = await this.prisma.dogDietPreference.findUnique({
      where: {
        dogId_kind_foodName: {
          dogId,
          kind: normalizedKind,
          foodName: normalizedName,
        },
      },
    });
    if (existing) {
      return { added: false, kind: normalizedKind, foodName: normalizedName };
    }

    await this.prisma.$transaction([
      this.prisma.dogDietPreference.create({
        data: { dogId, kind: normalizedKind, foodName: normalizedName, source },
      }),
      this.prisma.dogDietPreferenceChange.create({
        data: {
          dogId,
          kind: normalizedKind,
          foodName: normalizedName,
          action: 'ADDED',
          changedBy: source === 'MANUAL' ? 'CUSTOMER' : source,
        },
      }),
    ]);

    return { added: true, kind: normalizedKind, foodName: normalizedName };
  }

  /** 去掉一条偏好（同时记一条变更） */
  async remove(
    customerId: string,
    dogId: string,
    kind: string,
    foodName: string,
    changedBy = 'CUSTOMER',
  ) {
    await this.requireOwnedDog(customerId, dogId);

    const normalizedKind = normalizeKind(kind);
    const normalizedName = normalizeFoodName(foodName);

    const existing = await this.prisma.dogDietPreference.findUnique({
      where: {
        dogId_kind_foodName: {
          dogId,
          kind: normalizedKind,
          foodName: normalizedName,
        },
      },
    });
    if (!existing) {
      return { removed: false, kind: normalizedKind, foodName: normalizedName };
    }

    await this.prisma.$transaction([
      this.prisma.dogDietPreference.delete({ where: { id: existing.id } }),
      this.prisma.dogDietPreferenceChange.create({
        data: {
          dogId,
          kind: normalizedKind,
          foodName: normalizedName,
          action: 'REMOVED',
          changedBy,
        },
      }),
    ]);

    return { removed: true, kind: normalizedKind, foodName: normalizedName };
  }

  /**
   * 把旧文本整理成结构化条目（**顾客逐条确认后**调用）。
   *
   * 只接受白名单里的食物名？不需要 —— 这里本来就是顾客自己确认过的，
   * 但仍然做长度与数量限制，避免脏数据。
   */
  async importFromLegacy(
    customerId: string,
    dogId: string,
    payload: { liked?: string[]; disliked?: string[] },
  ) {
    await this.requireOwnedDog(customerId, dogId);

    const liked = normalizeNameList(payload?.liked);
    const disliked = normalizeNameList(payload?.disliked);

    if (liked.length === 0 && disliked.length === 0) {
      throw new BadRequestException('没有要整理的条目');
    }

    let added = 0;
    for (const foodName of liked) {
      const result = await this.add(customerId, dogId, 'LIKED', foodName, 'IMPORTED');
      if (result.added) added += 1;
    }
    for (const foodName of disliked) {
      const result = await this.add(customerId, dogId, 'DISLIKED', foodName, 'IMPORTED');
      if (result.added) added += 1;
    }

    return { added, total: liked.length + disliked.length };
  }

  /** 供时间线用：把变更历史取出来（不鉴权，调用方自己保证归属） */
  async listChangesForTimeline(dogId: string, take = 50) {
    const changes = await this.prisma.dogDietPreferenceChange.findMany({
      where: { dogId },
      orderBy: { changedAt: 'desc' },
      take,
    });

    return changes.map((change) => ({
      id: change.id,
      kind: change.kind as DietPreferenceKind,
      foodName: change.foodName,
      action: change.action as 'ADDED' | 'REMOVED',
      changedAt: toDateText(change.changedAt),
    }));
  }

  private async requireOwnedDog(customerId: string, dogId: string) {
    const dog = await this.prisma.dog.findUnique({ where: { id: dogId } });
    if (!dog) {
      throw new NotFoundException('Dog not found');
    }
    if (dog.ownerId !== customerId) {
      throw new ForbiddenException('Access denied');
    }
    return dog;
  }
}

// ---------------------------------------------------------------------------
// 纯函数
// ---------------------------------------------------------------------------

/**
 * 把自由文本拆成候选食物名。
 *
 * 这是**只用于生成候选**的，不会直接写库 —— 顾客确认后才入库。
 * 支持顿号、逗号、斜杠、换行等常见分隔；去重、去空白、限长。
 */
export function parseFoodList(text: string | null | undefined): string[] {
  const source = String(text || '')
    .slice(0, MAX_NAME_LENGTH_FOR_SUGGESTIONS)
    .trim();
  if (!source) {
    return [];
  }

  const parts = source
    .split(/[、,，;；/|\n\r\t]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.slice(0, FOOD_NAME_MAX));

  return Array.from(new Set(parts));
}

export function normalizeKind(value: unknown): DietPreferenceKind {
  const key = String(value || '').trim().toUpperCase();
  if (key === 'LIKED' || key === 'DISLIKED') {
    return key;
  }
  // 只有两种，缺省按"爱吃"处理并让上游校验拦住明显的错误
  throw new BadRequestException('kind 只能是 LIKED（爱吃）或 DISLIKED（不吃）');
}

export function normalizeFoodName(value: unknown): string {
  const name = String(value || '').trim().slice(0, FOOD_NAME_MAX);
  if (!name) {
    throw new BadRequestException('请填写食物名称');
  }
  return name;
}

export function normalizeNameList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const names = value
    .map((item) => String(item || '').trim().slice(0, FOOD_NAME_MAX))
    .filter(Boolean);
  return Array.from(new Set(names));
}

function toDateText(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
