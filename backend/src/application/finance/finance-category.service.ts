import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { REIMBURSEMENT_CUSTOM_FEE_CATEGORY_NAMES } from './finance-categories';
import {
  FinanceCategoryLookup,
  buildFinanceCategoryLookup,
} from './finance-category-lookup';

/**
 * 支出类别字典服务（2026-11-19 账户化 + 可编辑类别，设计文档 §2）。
 *
 * 口径：
 * - **输入即建**：记账时打一个新名字保存，它就成为类别（`create`）；
 * - **改名影响历史**：记录按 `categoryId` 关联，改名后历史显示新名字；
 * - **删除 = 停用**：`isSystem` 的类别（食材/补剂/包材/快递/支付手续费）
 *   不能停用、只能改名；已被用过的类别可以合并（历史记录一起搬走）；
 * - **同名（忽略大小写与首尾空格）拒绝 400**：避免「设备 / 设备工具」这类重复。
 *
 * 报表读的是类别当前名字（`label`），所以这里不需要维护任何快照表。
 */

export const FINANCE_CATEGORY_NAME_MAX = 60;

export type FinanceCategoryView = {
  id: string;
  name: string;
  isSystem: boolean;
  isActive: boolean;
  /** 被账单 / 模板 / 手工条目引用的总条数（三处分别 count 后相加） */
  usageCount: number;
  /**
   * 记账选择器是否可选。
   * 「其它」（code=OTHER）保留在库里给报销映射用，但记账没有「其他」选项。
   */
  selectable: boolean;
};

/** 报销杂费映射用的「其它」code：等同系统类别，不能停用/合并 */
const OTHER_CATEGORY_CODE = 'OTHER';

/**
 * 受保护的类别：系统类别 + 「其它」。
 *
 * 「其它」不是 `isSystem`（迁移里只是普通种子），但报销单的 `OTHER` 杂费
 * 按 code 映射到它，停用或合并会让映射失效、历史金额掉进「未分类」。
 */
function isProtectedCategory(row: {
  isSystem: boolean;
  code: string | null;
}): boolean {
  return row.isSystem || row.code === OTHER_CATEGORY_CODE;
}

function parseCategoryName(input: unknown): string {
  const name = typeof input === 'string' ? input.trim() : '';
  if (!name) {
    throw new BadRequestException('类别名称不能为空');
  }
  if ([...name].length > FINANCE_CATEGORY_NAME_MAX) {
    throw new BadRequestException(
      `类别名称最多 ${FINANCE_CATEGORY_NAME_MAX} 个字`,
    );
  }
  return name;
}

/** Prisma 唯一约束冲突（并发同名） */
function isUniqueConflict(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'P2002';
}

@Injectable()
export class FinanceCategoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 类别列表（管理页 / 记账下拉共用）。
   *
   * `includeInactive = false` 只给启用类别；管理页传 `true` 才能看到
   * 停用与已合并的类别。
   */
  async list(includeInactive = false): Promise<FinanceCategoryView[]> {
    const rows = await this.prisma.financeCategory.findMany({
      where: includeInactive ? {} : { isActive: true },
      // 新自建类别 sortOrder = 0，排在种子类别（10 起）前面
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    // 三张引用表分别 count 后相加：数据量小，一次列表 3N 次 count 可以接受，
    // 且比 groupBy 更好读、单测更好造。
    return Promise.all(
      rows.map(async (row) => {
        const [billCount, templateCount, manualCount] = await Promise.all([
          this.prisma.expenseBill.count({ where: { categoryId: row.id } }),
          this.prisma.expenseTemplate.count({ where: { categoryId: row.id } }),
          this.prisma.financeManualEntry.count({
            where: { categoryId: row.id },
          }),
        ]);
        return {
          id: row.id,
          name: row.name,
          isSystem: row.isSystem,
          isActive: row.isActive,
          usageCount: billCount + templateCount + manualCount,
          selectable: row.code !== OTHER_CATEGORY_CODE,
        };
      }),
    );
  }

  /**
   * 报表用的类别查找表：整表读入内存，再确保报销杂费的三个类别存在。
   *
   * - 整表读（含停用/已合并）而不是 `where isActive`：历史记录引用停用类别时
   *   仍要显示它的名字，不能变成「未分类」；
   * - 报销杂费 `TOOLS/SUNDRIES/OTHER` 先按 code 命中（改名不影响归属），
   *   种子缺失时才 `ensureByName` 补建 —— 读接口正常不会写库。
   */
  async loadExpenseLookup(): Promise<FinanceCategoryLookup> {
    const rows = await this.prisma.financeCategory.findMany({
      // isActive / mergedIntoId 供 byCode 跟随合并目标；不读会漏掉合并结果
      // isActive / mergedIntoId 供 byCode 跟随合并目标；不读会漏掉合并结果
      select: {
        id: true,
        name: true,
        code: true,
        isActive: true,
        mergedIntoId: true,
      },
    });
    const lookup = buildFinanceCategoryLookup(rows);

    for (const [code, name] of Object.entries(
      REIMBURSEMENT_CUSTOM_FEE_CATEGORY_NAMES,
    )) {
      if (lookup.byCode.has(code)) continue;
      const ensured = await this.ensureByName(name, code);
      const option = { id: ensured.id, name: ensured.name, code };
      lookup.byId.set(option.id, option);
      lookup.byCode.set(code, option);
      lookup.byName.set(option.name.trim().toLowerCase(), option);
    }
    return lookup;
  }

  /** 新建自建类别（输入即建）：trim、1–60 字、同名拒绝 */
  async create(
    userId: string,
    name: unknown,
  ): Promise<{ id: string; name: string }> {
    const normalized = parseCategoryName(name);
    await this.assertNameAvailable(normalized);
    return this.insert(normalized, { createdById: userId });
  }

  /** 改名：系统类别也允许；同名冲突 400；历史记录按 id 自动显示新名字 */
  async rename(
    id: string,
    name: unknown,
  ): Promise<{ id: string; name: string }> {
    const normalized = parseCategoryName(name);
    const existing = await this.prisma.financeCategory.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('类别不存在');
    }
    await this.assertNameAvailable(normalized, id);

    await this.prisma.financeCategory.update({
      where: { id },
      data: { name: normalized },
    });
    return { id, name: normalized };
  }

  /**
   * 合并：把三张表的 `categoryId` 批量改成目标类别，源类别停用并指向目标。
   *
   * 返回本次搬移的记录条数（账单 + 模板 + 手工条目）。
   */
  async merge(
    sourceId: string,
    targetId: string,
  ): Promise<{ sourceId: string; targetId: string; moved: number }> {
    if (!sourceId || !targetId) {
      throw new BadRequestException('必须选择源类别和目标类别');
    }
    if (sourceId === targetId) {
      throw new BadRequestException('不能合并到同一个类别');
    }

    const [source, target] = await Promise.all([
      this.prisma.financeCategory.findUnique({ where: { id: sourceId } }),
      this.prisma.financeCategory.findUnique({ where: { id: targetId } }),
    ]);
    if (!source) {
      throw new NotFoundException('源类别不存在');
    }
    if (!target) {
      throw new NotFoundException('目标类别不存在');
    }
    // 目标必须是「能继续接账」的类别：已停用/已合并不行，
    // 否则记录会被搬进一个记账下拉里选不到、报表里也跟不过去的类别。
    if (!target.isActive || target.mergedIntoId) {
      throw new BadRequestException('目标类别已停用或已被合并，不能作为合并目标');
    }
    // 系统类别不可停用，「合并」会把它停用并迁走记录，等于绕过保护：
    // 自动来源（采购/快递/手续费）按 code 找系统类别，合并后只能落空。
    if (isProtectedCategory(source) || isProtectedCategory(target)) {
      throw new BadRequestException('系统类别不能合并');
    }

    // 三张表搬移 + 源类别停用放在同一个事务里：中途失败不能留下
    // 「记录搬了一半、源类别还启用」的半成品。
    const [bills, templates, manuals] = await this.prisma.$transaction([
      this.prisma.expenseBill.updateMany({
        where: { categoryId: sourceId },
        data: { categoryId: targetId },
      }),
      this.prisma.expenseTemplate.updateMany({
        where: { categoryId: sourceId },
        data: { categoryId: targetId },
      }),
      this.prisma.financeManualEntry.updateMany({
        where: { categoryId: sourceId },
        data: { categoryId: targetId },
      }),
      this.prisma.financeCategory.update({
        where: { id: sourceId },
        data: { isActive: false, mergedIntoId: targetId },
      }),
    ]);

    return {
      sourceId,
      targetId,
      moved: bills.count + templates.count + manuals.count,
    };
  }

  /**
   * 停用（删除 = 停用）：系统类别禁止；已停用的幂等返回。
   *
   * 已停用的类别不会出现在记账下拉里，但历史记录仍然显示它的名字。
   */
  async deactivate(id: string): Promise<{ id: string; isActive: false }> {
    const existing = await this.prisma.financeCategory.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('类别不存在');
    }
    if (isProtectedCategory(existing)) {
      throw new BadRequestException('系统类别不能停用');
    }
    if (existing.isActive) {
      await this.prisma.financeCategory.update({
        where: { id },
        data: { isActive: false },
      });
    }
    return { id, isActive: false };
  }

  /**
   * 按名字取类别，没有就建（报销杂费映射用：`TOOLS` → 工具、`SUNDRIES` → 杂物）。
   *
   * 幂等：并发下同名创建撞 `name` 唯一约束（P2002）时回查一次返回既有行。
   * `code` 只给历史枚举映射用，自建类别不传。
   */
  async ensureByName(
    name: unknown,
    code?: string | null,
  ): Promise<{ id: string; name: string }> {
    const normalized = parseCategoryName(name);
    const existing = await this.findByName(normalized);
    if (existing) {
      return { id: existing.id, name: existing.name };
    }

    try {
      return await this.insert(normalized, { code: code ?? null });
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      const raced = await this.findByName(normalized);
      if (!raced) throw error;
      return { id: raced.id, name: raced.name };
    }
  }

  /** 同名（忽略大小写与首尾空格）查询；`exceptId` 用于改名时排除自己 */
  private findByName(name: string) {
    return this.prisma.financeCategory.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
  }

  private async assertNameAvailable(
    name: string,
    exceptId?: string,
  ): Promise<void> {
    const existing = await this.findByName(name);
    if (existing && existing.id !== exceptId) {
      throw new BadRequestException(`类别「${name}」已存在`);
    }
  }

  /** 真正写库；新类别排在种子类别前面（sortOrder = 0） */
  private async insert(
    name: string,
    options: { code?: string | null; createdById?: string | null } = {},
  ): Promise<{ id: string; name: string }> {
    const created = await this.prisma.financeCategory.create({
      data: {
        name,
        code: options.code ?? null,
        isSystem: false,
        sortOrder: 0,
        createdById: options.createdById ?? null,
      },
    });
    return { id: created.id, name: created.name };
  }
}
