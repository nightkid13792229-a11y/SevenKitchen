import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import {
  ENUM_SOURCES,
  OPTION_SET_DEFINITIONS,
  OPTION_TONES,
  findOptionSetDefinition,
  type OptionSeedItem,
  type OptionSetDefinition,
} from './option-sets.registry';

/**
 * 平台选项字典（2026-10-16，食谱定制重构 批次 1.3）
 *
 * 对外只做两件事：**读**（下发给前端）与**维护**（后台改标签/排序/启用）。
 * 存在的理由见 `option-sets.registry.ts` 与迁移文件头的说明。
 *
 * ## 三条硬口径
 *
 * **一、启动同步只「补缺失」，绝不覆盖人工改过的文案。**
 *   运营把「已付款」改成了「已收款」，重启服务不能被冲回原样。
 *   只有**数据库里根本没有这个码**时才插入。
 *
 * **二、`ENUM` 类的选项不能增删。**
 *   代码里有 if-else 依赖这些值（比如「已付款才能取消」）。
 *   后台只能改它的标签、说明、色调、排序、启用。
 *
 * **三、未知的 `tone` 一律拒绝写入。**
 *   `tone` 是语义档位而不是颜色值，前端把档位映射到样式类；
 *   数据库里出现一个前端不认识的档位，界面会静默变成默认样式。
 */
@Injectable()
export class PlatformOptionsService implements OnModuleInit {
  private readonly logger = new Logger(PlatformOptionsService.name);

  /**
   * 内存缓存。字典总量只有几十行，整份缓存最省事，
   * 任何写操作与启动同步之后整体失效。
   */
  private cache: Map<string, OptionItemDto[]> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.syncEnumBackedSets();
    } catch (error) {
      /**
       * 同步失败**不能**拦住服务启动：
       * 字典是"锦上添花"（前端拿不到会退回兜底文案），
       * 而服务起不来是全站不可用。所以只记日志。
       */
      this.logger.error(
        `选项字典启动同步失败（不影响服务启动）：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // ==================== 读 ====================

  /** 批量取多个选项集；`codes` 省略时取全部启用的 */
  async listSets(codes?: string[]): Promise<Record<string, OptionItemDto[]>> {
    const all = await this.loadAll();
    const wanted = codes?.length
      ? codes
      : OPTION_SET_DEFINITIONS.map((set) => set.code);

    const result: Record<string, OptionItemDto[]> = {};
    for (const code of wanted) {
      result[code] = all.get(code) ?? [];
    }
    return result;
  }

  async listSet(code: string): Promise<OptionItemDto[]> {
    const all = await this.loadAll();
    if (!all.has(code)) {
      throw new NotFoundException(`选项集不存在：${code}`);
    }
    return all.get(code) ?? [];
  }

  /** 后台维护页用：连停用的项一起给（顾客侧只拿启用的） */
  async listSetForAdmin(
    code: string,
  ): Promise<{ set: OptionSetDefinition; items: AdminOptionItemDto[] }> {
    const definition = findOptionSetDefinition(code);
    if (!definition) {
      throw new NotFoundException(`选项集不存在：${code}`);
    }

    const rows = await this.prisma.platformOptionItem.findMany({
      where: { setId: code },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });

    return {
      set: definition,
      items: rows.map((row) => ({
        code: row.code,
        label: row.label,
        description: row.description,
        tone: row.tone,
        icon: row.icon,
        sortOrder: row.sortOrder,
        enabled: row.enabled,
        isDefault: row.isDefault,
        extra: (row.extra as Record<string, unknown> | null) ?? null,
      })),
    };
  }

  /**
   * 把某个码翻成中文。
   *
   * 给后端自己用（写通知文案、导出报表）——
   * 这样「顾客看到的中文」与「后台看到的中文」必然同源。
   */
  async labelOf(setCode: string, code: string): Promise<string | null> {
    const items = await this.listSet(setCode).catch(() => []);
    return items.find((item) => item.code === code)?.label ?? null;
  }

  // ==================== 写（后台） ====================

  /** 改一项的展示元数据（两类选项集都允许） */
  async updateItem(
    setCode: string,
    code: string,
    patch: {
      label?: string;
      description?: string | null;
      tone?: string | null;
      icon?: string | null;
      sortOrder?: number;
      enabled?: boolean;
    },
  ): Promise<void> {
    this.assertSetExists(setCode);

    if (patch.tone !== undefined && patch.tone !== null) {
      this.assertTone(patch.tone);
    }
    if (patch.label !== undefined && !patch.label.trim()) {
      throw new BadRequestException('标签不能为空');
    }

    const existing = await this.prisma.platformOptionItem.findUnique({
      where: { setId_code: { setId: setCode, code } },
    });
    if (!existing) {
      throw new NotFoundException(`选项不存在：${setCode}/${code}`);
    }

    await this.prisma.platformOptionItem.update({
      where: { setId_code: { setId: setCode, code } },
      data: {
        ...(patch.label !== undefined && { label: patch.label.trim() }),
        ...(patch.description !== undefined && {
          description: patch.description,
        }),
        ...(patch.tone !== undefined && { tone: patch.tone }),
        ...(patch.icon !== undefined && { icon: patch.icon }),
        ...(patch.sortOrder !== undefined && { sortOrder: patch.sortOrder }),
        ...(patch.enabled !== undefined && { enabled: patch.enabled }),
      },
    });

    this.invalidate();
  }

  /** 新增一项 —— **只有 DATA 类允许**（ENUM 类的值由代码定义） */
  async createItem(setCode: string, item: OptionSeedItem): Promise<void> {
    const definition = this.assertSetExists(setCode);
    this.assertCanAddOrRemove(definition, '新增');

    if (!item.code?.trim()) throw new BadRequestException('码不能为空');
    if (!item.label?.trim()) throw new BadRequestException('标签不能为空');
    if (item.tone) this.assertTone(item.tone);

    const duplicated = await this.prisma.platformOptionItem.findUnique({
      where: { setId_code: { setId: setCode, code: item.code } },
    });
    if (duplicated) {
      throw new BadRequestException(`该选项集里已经有码「${item.code}」`);
    }

    await this.prisma.platformOptionItem.create({
      data: {
        setId: setCode,
        code: item.code.trim(),
        label: item.label.trim(),
        description: item.description ?? null,
        tone: item.tone ?? null,
        icon: item.icon ?? null,
        sortOrder: item.sortOrder ?? 100,
        isDefault: item.isDefault ?? false,
        extra: (item.extra as never) ?? undefined,
      },
    });

    this.invalidate();
  }

  /**
   * 删除一项 —— **只有 DATA 类允许**，且**必须确认没有历史数据在用**。
   *
   * 为什么不做级联删除：选项码可能已经写进订单、售后单等业务表。
   * 删掉字典行不会删业务数据，但会让那些行变成"查不到中文"。
   * 所以更稳的做法是**停用**（enabled=false）而不是删除。
   */
  async deleteItem(setCode: string, code: string): Promise<void> {
    const definition = this.assertSetExists(setCode);
    this.assertCanAddOrRemove(definition, '删除');

    const existing = await this.prisma.platformOptionItem.findUnique({
      where: { setId_code: { setId: setCode, code } },
    });
    if (!existing) {
      throw new NotFoundException(`选项不存在：${setCode}/${code}`);
    }

    await this.prisma.platformOptionItem.delete({
      where: { setId_code: { setId: setCode, code } },
    });

    this.invalidate();
  }

  // ==================== 初始内容 ====================

  /**
   * 灌入 `DATA` 类选项集的**初始内容**（只在某个集**一行都没有**时执行）。
   *
   * ## 为什么不放进 `onModuleInit`
   *
   * 也想过"每次启动都补缺失"，但对 DATA 集这是错的：
   * 运营**故意**把某个选项集清空（比如售后的「其他意见」不想要了），
   * 重启一次又被塞回来，他会以为系统在跟他作对。
   *
   * 所以 DATA 集的初始内容由**部署时的 seed 脚本**显式灌入
   * （`prisma/seed-platform-options.ts`），服务启动不碰。
   * 这也符合本项目的惯例：初始数据都走 seed 脚本。
   *
   * ## 一条要记住的边界
   *
   * `DATA` 集的 seed 只代表**首次内容**。上线之后以**数据库为准** ——
   * 后来往登记表里加的 DATA 项**不会**自动出现在已部署的环境里
   * （那是运营在后台自己加的事）。
   * `ENUM` 集不受此限：它每次启动都会补齐缺失的枚举值（见 `syncEnumBackedSets`）。
   */
  async seedDataSetsIfEmpty(): Promise<{ seededSets: string[] }> {
    const seededSets: string[] = [];

    for (const definition of OPTION_SET_DEFINITIONS) {
      if (definition.sourceType !== 'DATA') continue;
      if (!definition.seed?.length) continue;

      await this.prisma.platformOptionSet.upsert({
        where: { code: definition.code },
        create: {
          code: definition.code,
          name: definition.name,
          description: definition.description ?? null,
          sourceType: definition.sourceType,
          enumName: null,
        },
        update: {
          name: definition.name,
          description: definition.description ?? null,
        },
      });

      const existing = await this.prisma.platformOptionItem.count({
        where: { setId: definition.code },
      });
      if (existing > 0) continue;

      for (const item of definition.seed) {
        await this.prisma.platformOptionItem.create({
          data: {
            setId: definition.code,
            code: item.code,
            label: item.label,
            description: item.description ?? null,
            tone: item.tone ?? null,
            icon: item.icon ?? null,
            sortOrder: item.sortOrder ?? 100,
            isDefault: item.isDefault ?? false,
            extra: (item.extra as never) ?? undefined,
          },
        });
      }
      seededSets.push(definition.code);
    }

    this.invalidate();
    return { seededSets };
  }

  // ==================== 启动同步 ====================

  /**
   * 把代码里登记的枚举集合同步进字典。
   *
   * 只**补缺失**，不覆盖已有行 —— 见类注释「口径一」。
   * 补进来的行标签先等于码本身（英文），并 warn 提醒还没配中文；
   * 这样界面上不会空白，同时运维能立刻从日志看出漏了什么。
   */
  async syncEnumBackedSets(): Promise<{ inserted: number; unlabeled: string[] }> {
    let inserted = 0;
    const unlabeled: string[] = [];

    for (const definition of OPTION_SET_DEFINITIONS) {
      if (definition.sourceType !== 'ENUM') continue;

      await this.prisma.platformOptionSet.upsert({
        where: { code: definition.code },
        create: {
          code: definition.code,
          name: definition.name,
          description: definition.description ?? null,
          sourceType: definition.sourceType,
          enumName: definition.enumName ?? null,
        },
        update: {
          name: definition.name,
          description: definition.description ?? null,
          enumName: definition.enumName ?? null,
        },
      });

      const codes = this.resolveEnumCodes(definition);
      const seedByCode = new Map(
        (definition.seed ?? []).map((item) => [item.code, item]),
      );

      const existingRows = await this.prisma.platformOptionItem.findMany({
        where: { setId: definition.code },
        select: { code: true, label: true },
      });
      const existingCodes = new Set(existingRows.map((row) => row.code));

      for (const code of codes) {
        if (existingCodes.has(code)) continue;

        const seed = seedByCode.get(code);
        const label = seed?.label ?? code; // 没配中文就先用码本身，别留空白
        await this.prisma.platformOptionItem.create({
          data: {
            setId: definition.code,
            code,
            label,
            description: seed?.description ?? null,
            tone: seed?.tone ?? null,
            icon: seed?.icon ?? null,
            sortOrder: seed?.sortOrder ?? 100,
            isDefault: seed?.isDefault ?? false,
            extra: (seed?.extra as never) ?? undefined,
          },
        });
        inserted += 1;
      }

      /**
       * 告警：标签还等于码本身 = 从来没配过中文。
       * 这就是「加了枚举忘了加文案」的兜底 —— 从前它会一路漏到顾客眼前。
       */
      for (const row of existingRows) {
        if (row.label === row.code) unlabeled.push(`${definition.code}/${row.code}`);
      }
      for (const code of codes) {
        if (!existingCodes.has(code) && !seedByCode.has(code)) {
          unlabeled.push(`${definition.code}/${code}`);
        }
      }
    }

    this.invalidate();

    if (inserted > 0) {
      this.logger.log(`选项字典启动同步：补了 ${inserted} 条缺失项`);
    }
    if (unlabeled.length > 0) {
      this.logger.warn(
        `选项字典有 ${unlabeled.length} 项还没配中文（界面会显示英文码）：` +
          unlabeled.join('、'),
      );
    }

    return { inserted, unlabeled };
  }

  // ==================== 内部 ====================

  /** 从 Prisma 枚举对象里取出全部取值（顺序即枚举声明顺序） */
  private resolveEnumCodes(definition: OptionSetDefinition): string[] {
    const enumName = definition.enumName;
    if (!enumName) return [];

    const source = ENUM_SOURCES[enumName];
    if (!source) {
      /**
       * 登记表里写了枚举名，但 `ENUM_SOURCES` 里没有 —— 说明加选项集时漏登记了。
       * 明确报出来，而不是静默返回空数组（那会让同步看起来"成功了"其实什么都没做）。
       */
      this.logger.error(
        `选项集 ${definition.code} 声明了枚举 ${enumName}，但 ENUM_SOURCES 里没有登记`,
      );
      return [];
    }
    return Object.values(source);
  }

  private async loadAll(): Promise<Map<string, OptionItemDto[]>> {
    if (this.cache) return this.cache;

    const rows = await this.prisma.platformOptionItem.findMany({
      where: { enabled: true, set: { enabled: true } },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });

    const map = new Map<string, OptionItemDto[]>();
    for (const definition of OPTION_SET_DEFINITIONS) {
      map.set(definition.code, []);
    }
    for (const row of rows) {
      const list = map.get(row.setId) ?? [];
      list.push({
        code: row.code,
        label: row.label,
        description: row.description,
        tone: row.tone,
        icon: row.icon,
        sortOrder: row.sortOrder,
        isDefault: row.isDefault,
        extra: (row.extra as Record<string, unknown> | null) ?? null,
      });
      map.set(row.setId, list);
    }

    this.cache = map;
    return map;
  }

  /** 任何写操作之后清空缓存（字典很小，整体失效最省事也最不容易错） */
  invalidate(): void {
    this.cache = null;
  }

  private assertSetExists(setCode: string): OptionSetDefinition {
    const definition = findOptionSetDefinition(setCode);
    if (!definition) {
      throw new NotFoundException(`选项集不存在：${setCode}`);
    }
    return definition;
  }

  private assertCanAddOrRemove(
    definition: OptionSetDefinition,
    action: string,
  ): void {
    if (definition.sourceType === 'ENUM') {
      throw new BadRequestException(
        `「${definition.name}」的取值由代码定义，不能${action}。` +
          `如需${action}，请先改代码里的枚举与登记表（代码里有依赖这些值的判断）`,
      );
    }
  }

  private assertTone(tone: string): void {
    if (!(OPTION_TONES as readonly string[]).includes(tone)) {
      throw new BadRequestException(
        `色彩档位只能是：${OPTION_TONES.join(' / ')}（前端按档位选样式，不认识的值会静默变默认样式）`,
      );
    }
  }
}

/** 下发给前端的形态 */
export interface OptionItemDto {
  code: string;
  label: string;
  description: string | null;
  tone: string | null;
  icon: string | null;
  sortOrder: number;
  isDefault: boolean;
  extra: Record<string, unknown> | null;
}

/** 后台维护页用（多一个 enabled） */
export interface AdminOptionItemDto extends OptionItemDto {
  enabled: boolean;
}
