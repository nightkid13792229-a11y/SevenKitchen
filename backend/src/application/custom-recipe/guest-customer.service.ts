/**
 * 代客客户（无账号顾客）Application Service
 *
 * ## 为什么需要"代客客户"
 *
 * 老板 2026-10-21 的口径：员工可以替**没有账号**的顾客（微信里问价、到店咨询）
 * 代下定制食谱订单。这类顾客没有 openid、也不会登录小程序，所以：
 *   · 不能把狗和订单挂到老板/员工账号下 —— 否则狗会混进员工自己的档案，
 *     不同顾客的狗也分不开；
 *   · 必须建一个 `isGuest=true` 的独立 User，只由员工在后台服务。
 *
 * ## 这个服务只做三件事
 *
 *   1. 建代客客户（User，无 openid/password）；
 *   2. 给代客客户建狗（复用 DogService，ownerId 指向代客客户）；
 *   3. 按姓名/电话/微信搜索代客客户（后台代客下单选客户用）。
 *
 * 代客下单、收款、交付不在本服务里 —— 那些复用现有定制订单流程。
 */

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { CreateDogProfileDto, DogService } from '../dog/dog.service';

/** 建代客客户的入参（对应 POST /admin/custom-recipe/guest-customers） */
export interface CreateGuestCustomerInput {
  /** 代客联系人姓名（必填） */
  name: string;
  /** 联系电话（可选；写 guestContactPhone，**不写 User.phone**） */
  phone?: string | null;
  /** 联系微信（可选；写 guestContactWechat） */
  wechat?: string | null;
  /**
   * 备注（可选）。
   *
   * Task 1 的 schema 没有为"代客备注"加列，这里只接收、不落库 ——
   * 不为了一个可选备注再动一次 schema。前端传了也不会 400。
   */
  note?: string | null;
}

/**
 * 给代客客户建狗的入参。
 *
 * 复用 DogService 的档案字段，但 **ownerId 不由前端决定**：
 * 服务端强制写成 `customerId`，避免"给 A 客户建狗、狗却挂到 B 客户"。
 * 生日允许传 Date 或 ISO 字符串（后台 JSON 传的是字符串）。
 */
export type CreateGuestDogInput = Omit<
  CreateDogProfileDto,
  'ownerId' | 'birthday'
> & {
  birthday: Date | string;
};

/** 搜索结果（后台代客下单选客户用） */
export interface GuestCustomerSearchItem {
  id: string;
  name: string;
  phone: string | null;
  wechat: string | null;
  dogCount: number;
}

/** 单次搜索最多返回多少位代客客户，避免后台下拉框一次拉全表 */
const GUEST_CUSTOMER_SEARCH_LIMIT = 50;

/** 代客联系人姓名上限，与 schema 的 guest_contact_name 一致 */
const GUEST_CONTACT_NAME_MAX_LENGTH = 50;

@Injectable()
export class GuestCustomerService {
  private readonly logger = new Logger(GuestCustomerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dogService: DogService,
  ) {}

  /**
   * 创建代客客户。
   *
   * **一定新建 User，绝不复用/不挂到老板或员工账号**：
   * 代客客户没有 openid/password，不能登录；`User.phone` 保持 null，
   * 只把联系人的电话写进 `guestContactPhone` —— 否则会与真实注册用户
   * 的手机号撞 `@unique`，导致建客户失败。
   */
  async createGuest(
    input: CreateGuestCustomerInput,
    operatorId: string,
  ): Promise<{ customerId: string }> {
    const name = this.normalizeName(input?.name);
    const staffId = this.normalizeOptional(operatorId);
    if (!staffId) {
      // 留痕缺失就不知道是谁建的代客客户；宁可拒绝，也不写一条无主数据。
      throw new BadRequestException('缺少操作人信息，无法创建代客客户');
    }

    const phone = this.normalizeOptional(input?.phone);
    const wechat = this.normalizeOptional(input?.wechat);

    const customer = await this.prisma.user.create({
      data: {
        isGuest: true,
        nickname: name,
        /**
         * ⚠️ 必须是 null，不能用顾客留的电话。
         *
         * `phone` 在 User 上是 `@unique` —— 顾客如果本来就是注册用户，
         * 用同一个号码建代客客户会直接撞唯一键；而且那等于把"无账号顾客"
         * 绑到别人的账号上。电话只放 guestContactPhone。
         */
        phone: null,
        guestContactName: name,
        guestContactPhone: phone,
        guestContactWechat: wechat,
        guestCreatedByStaffId: staffId,
        // 不写 wechatOpenid / password：代客客户不能自己登录。
      },
    });

    this.logger.log(
      `[GuestCustomer] 员工 ${staffId} 创建代客客户 ${customer.id}（${name}）`,
    );

    return { customerId: customer.id };
  }

  /**
   * 给代客客户建狗档案。
   *
   * 复用 `DogService.createDogProfile`（品种校验、能量计算、确认状态等
   * 与顾客自助建档完全同一套），只强制把 `ownerId` 换成代客客户 ID。
   *
   * 非代客用户（老板/员工/普通注册顾客）一律拒绝：这个接口的存在意义
   * 就是"给无账号顾客建档案"，放开会让狗被写进别人的账号。
   */
  async createGuestDog(
    customerId: string,
    dto: CreateGuestDogInput,
    operatorId: string,
  ): Promise<{ dogId: string }> {
    const id = this.normalizeOptional(customerId);
    if (!id) {
      throw new BadRequestException('缺少代客客户 ID');
    }

    const customer = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!customer) {
      throw new NotFoundException('代客客户不存在');
    }

    if (!customer.isGuest) {
      throw new BadRequestException(
        '该客户不是代客客户，不能代建狗狗档案；请让顾客在自己的账号下添加',
      );
    }

    const birthday = this.toDate(dto?.birthday, '狗狗生日');
    const name = this.normalizeOptional(dto?.name);
    if (!name) {
      throw new BadRequestException('请填写狗狗名字');
    }
    const breedId = this.normalizeOptional(dto?.breedId);
    if (!breedId) {
      throw new BadRequestException('请选择狗狗品种');
    }

    const dog = await this.dogService.createDogProfile({
      ownerId: customer.id,
      name,
      breedId,
      customBreedName: dto.customBreedName,
      birthday,
      gender: dto.gender,
      isNeutered: dto.isNeutered,
      currentWeightKg: dto.currentWeightKg,
      bcsScore: dto.bcsScore,
      activityLevel: dto.activityLevel,
      lifeStageOverride: dto.lifeStageOverride,
      sizeClassOverride: dto.sizeClassOverride,
      mealsPerDay: dto.mealsPerDay,
      treatInputMode: dto.treatInputMode,
      treatLevel: dto.treatLevel,
      manualTreatKcal: dto.manualTreatKcal,
      medicalHistory: dto.medicalHistory,
      allergyFoods: dto.allergyFoods,
      pickyFoods: dto.pickyFoods,
      // 员工代建时由员工确认了哪几项；不传 = 未确认，与顾客端口径一致
      bcsScoreConfirmed: dto.bcsScoreConfirmed,
      activityLevelConfirmed: dto.activityLevelConfirmed,
      mealsPerDayConfirmed: dto.mealsPerDayConfirmed,
      preferredFoods: dto.preferredFoods,
      matingDate: dto.matingDate,
      expectedDueDate: dto.expectedDueDate,
      deliveryDate: dto.deliveryDate,
      litterSize: dto.litterSize,
    });

    this.logger.log(
      `[GuestCustomer] 员工 ${operatorId} 为代客客户 ${customer.id} 创建狗狗 ${dog.id}`,
    );

    return { dogId: dog.id };
  }

  /**
   * 搜索代客客户（后台代客下单选客户）。
   *
   * **只返回 isGuest=true**：普通注册顾客有自己的账号，不能走代客流程，
   * 否则员工可能把订单下到顾客看不到的代客身份上。
   *
   * 姓名/电话/微信/昵称任一命中即可；手机号按"包含"匹配，方便只记得后四位时搜索。
   */
  async searchGuestCustomers(
    keyword?: string | null,
  ): Promise<GuestCustomerSearchItem[]> {
    const trimmed = this.normalizeOptional(keyword);

    const rows = await this.prisma.user.findMany({
      where: {
        isGuest: true,
        ...(trimmed
          ? {
              OR: [
                {
                  guestContactName: {
                    contains: trimmed,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  guestContactPhone: {
                    contains: trimmed,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  guestContactWechat: {
                    contains: trimmed,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  nickname: {
                    contains: trimmed,
                    mode: 'insensitive' as const,
                  },
                },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        nickname: true,
        guestContactName: true,
        guestContactPhone: true,
        guestContactWechat: true,
        _count: { select: { dogs: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: GUEST_CUSTOMER_SEARCH_LIMIT,
    });

    return rows.map((row) => ({
      id: row.id,
      // 建客户时 nickname 与 guestContactName 写的是同一个值；
      // 这里优先联系人姓名，兼容历史数据里只有 nickname 的行。
      name: row.guestContactName ?? row.nickname ?? '',
      phone: row.guestContactPhone ?? null,
      wechat: row.guestContactWechat ?? null,
      dogCount: row._count?.dogs ?? 0,
    }));
  }

  /**
   * 计划里写的入口名是 `search`；保留这个别名，避免调用方两套名字。
   */
  async search(keyword?: string | null): Promise<GuestCustomerSearchItem[]> {
    return this.searchGuestCustomers(keyword);
  }

  /** 姓名必填、去首尾空格、不能是纯空白 */
  private normalizeName(value: unknown): string {
    const name = this.normalizeOptional(value);
    if (!name) {
      throw new BadRequestException('请填写代客客户姓名');
    }
    if (name.length > GUEST_CONTACT_NAME_MAX_LENGTH) {
      throw new BadRequestException(
        `代客客户姓名不能超过 ${GUEST_CONTACT_NAME_MAX_LENGTH} 个字符`,
      );
    }
    return name;
  }

  /** 字符串去空格；非字符串/空串 → null */
  private normalizeOptional(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }

  /** 必填日期：Date 或可解析字符串 */
  private toDate(value: unknown, label: string): Date {
    if (value instanceof Date) {
      if (!Number.isNaN(value.getTime())) {
        return value;
      }
      throw new BadRequestException(`${label}格式不正确`);
    }

    if (typeof value === 'string' && value.trim() !== '') {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        return date;
      }
    }

    throw new BadRequestException(`${label}格式不正确`);
  }
}
