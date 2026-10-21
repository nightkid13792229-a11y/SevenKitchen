/**
 * 后台 · 代客客户与狗狗接口（2026-10-21 · 代客定制食谱订单 Task 2）
 *
 * 无账号顾客（微信里问价、到店咨询）不能自己注册，员工要能：
 *   1. 新建代客客户；
 *   2. 给代客客户建狗档案；
 *   3. 按姓名/电话/微信搜索已有代客客户。
 *
 * ## 权限
 *
 *   · 新建客户 / 建狗：**仅管理员**（AdminGuard）。
 *     这两步会创建长期存在、且无法自己登录的账号数据，属于"建档"类动作；
 *     出错后清理成本高，先按敏感操作收紧。
 *   · 搜索客户：员工即可（StaffGuard）—— 客服代客下单时天天要用。
 *
 * 本控制器**不包含代客下单**：下单是 Task 3 的事，复用现有订单流程。
 */

import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { GuestCustomerService } from '../../../application/custom-recipe/guest-customer.service';
import {
  ActivityLevel,
  DogGender,
  DogSizeCategory,
  LifeStageOverride,
  TreatInputMode,
  TreatLevel,
} from '../../../domain';
import { MAX_DOG_WEIGHT_KG } from '../../../domain/dog/constants';
import { AuthGuard } from '../../auth/auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { StaffGuard } from '../../guards/role.guard';
import { ApiResponseDto } from '../../dto/common/response.dto';

/** 新建代客客户入参 */
export class CreateGuestCustomerDto {
  @ApiProperty({ description: '代客联系人姓名', example: '王女士' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;

  @ApiPropertyOptional({
    description: '联系电话（只写代客联系方式，不占用注册手机号）',
    example: '13800138000',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ description: '联系微信', example: 'wang_nvshi' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  wechat?: string;

  @ApiPropertyOptional({
    description: '备注（当前 schema 未落库，仅接收）',
    example: '朋友介绍，先问价',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/**
 * 给代客客户建狗的入参。
 *
 * 与顾客端 `CreateDogDto` 的必填项一致，但**品种 ID 不强制 UUID**：
 * 后台测试环境/历史品种数据里存在非 UUID 的 ID，而这里最终由
 * `DogService.createDogProfile` 校验品种是否存在 —— 不必在入口重复一种格式假设。
 */
export class CreateGuestDogDto {
  @ApiProperty({ description: '狗狗名字', example: '旺财' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ description: '品种 ID', example: 'uuid' })
  @IsString()
  @MinLength(1)
  breedId!: string;

  @ApiPropertyOptional({ description: '混血犬的自定义品种名', nullable: true })
  @IsOptional()
  @IsString()
  customBreedName?: string | null;

  @ApiProperty({ description: '生日', example: '2020-01-01' })
  @IsDateString()
  birthday!: string;

  @ApiProperty({ enum: DogGender, example: DogGender.MALE })
  @IsEnum(DogGender)
  gender!: DogGender;

  @ApiProperty({ description: '是否绝育', example: false })
  @IsBoolean()
  isNeutered!: boolean;

  @ApiProperty({
    description: '当前体重（kg）',
    example: 10.5,
    minimum: 0.1,
    maximum: MAX_DOG_WEIGHT_KG,
  })
  @IsNumber()
  @Min(0.1)
  @Max(MAX_DOG_WEIGHT_KG)
  currentWeightKg!: number;

  @ApiProperty({ description: '体况评分 BCS（1-9）', example: 5 })
  @IsInt()
  @Min(1)
  @Max(9)
  bcsScore!: number;

  @ApiProperty({ enum: ActivityLevel, example: ActivityLevel.NORMAL })
  @IsEnum(ActivityLevel)
  activityLevel!: ActivityLevel;

  @ApiProperty({ enum: LifeStageOverride, example: LifeStageOverride.NONE })
  @IsEnum(LifeStageOverride)
  lifeStageOverride!: LifeStageOverride;

  @ApiPropertyOptional({ enum: DogSizeCategory, nullable: true })
  @IsOptional()
  @IsEnum(DogSizeCategory)
  sizeClassOverride?: DogSizeCategory | null;

  @ApiPropertyOptional({ description: '每日餐数', example: 2, default: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  mealsPerDay?: number;

  @ApiPropertyOptional({
    enum: TreatInputMode,
    default: TreatInputMode.ESTIMATE_LEVEL,
  })
  @IsOptional()
  @IsEnum(TreatInputMode)
  treatInputMode?: TreatInputMode;

  @ApiPropertyOptional({ enum: TreatLevel, default: TreatLevel.LOW })
  @IsOptional()
  @IsEnum(TreatLevel)
  treatLevel?: TreatLevel;

  @ApiPropertyOptional({ description: '零食热量（kcal）', nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  manualTreatKcal?: number | null;

  @ApiPropertyOptional({ description: '既往病史', nullable: true })
  @IsOptional()
  @IsString()
  medicalHistory?: string | null;

  @ApiPropertyOptional({ description: '过敏食物', nullable: true })
  @IsOptional()
  @IsString()
  allergyFoods?: string | null;

  @ApiPropertyOptional({ description: '挑食食物', nullable: true })
  @IsOptional()
  @IsString()
  pickyFoods?: string | null;

  @ApiPropertyOptional({ description: '喜欢的食材', nullable: true })
  @IsOptional()
  @IsString()
  preferredFoods?: string | null;

  @ApiPropertyOptional({ description: '是否确认过体况评分' })
  @IsOptional()
  @IsBoolean()
  bcsScoreConfirmed?: boolean;

  @ApiPropertyOptional({ description: '是否确认过活动量' })
  @IsOptional()
  @IsBoolean()
  activityLevelConfirmed?: boolean;

  @ApiPropertyOptional({ description: '是否确认过每日餐数' })
  @IsOptional()
  @IsBoolean()
  mealsPerDayConfirmed?: boolean;

  @ApiPropertyOptional({ description: '配种日', nullable: true })
  @IsOptional()
  @IsDateString()
  matingDate?: string | null;

  @ApiPropertyOptional({ description: '预产期', nullable: true })
  @IsOptional()
  @IsDateString()
  expectedDueDate?: string | null;

  @ApiPropertyOptional({ description: '分娩日', nullable: true })
  @IsOptional()
  @IsDateString()
  deliveryDate?: string | null;

  @ApiPropertyOptional({ description: '窝仔数（1-12）', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  litterSize?: number | null;
}

@ApiTags('admin/custom-recipe')
@ApiBearerAuth()
@Controller('api/v1/admin/custom-recipe/guest-customers')
/**
 * 类级先做登录 + 员工校验；建客户/建狗在各自路由上再加 AdminGuard。
 * 这样未登录一定是 401，员工访问搜索是 200、访问建档是 403 —— 与现有后台一致。
 */
@UseGuards(AuthGuard, StaffGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class AdminGuestCustomerController {
  constructor(private readonly guestCustomerService: GuestCustomerService) {}

  /** 当前操作人（员工）ID，用于 `guestCreatedByStaffId` 留痕 */
  private currentOperatorId(req: {
    user?: { userId?: string; staffId?: string; id?: string };
  }): string {
    const user = req?.user;
    return user?.userId || user?.staffId || user?.id || 'unknown';
  }

  /**
   * 新建代客客户。
   *
   * 返回 `{ customerId }`：后台拿到后可直接用它建狗、代客下单。
   */
  @Post()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '新建代客客户（无账号顾客）' })
  async createGuest(@Req() req: any, @Body() dto: CreateGuestCustomerDto) {
    return ApiResponseDto.success(
      await this.guestCustomerService.createGuest(
        {
          name: dto.name,
          phone: dto.phone,
          wechat: dto.wechat,
          note: dto.note,
        },
        this.currentOperatorId(req),
      ),
    );
  }

  /**
   * 给代客客户建狗。
   *
   * `:customerId` 必须是 `isGuest=true` 的客户；普通顾客/老板账号会被拒绝。
   */
  @Post(':customerId/dogs')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '给代客客户新建狗狗档案' })
  async createGuestDog(
    @Req() req: any,
    @Param('customerId') customerId: string,
    @Body() dto: CreateGuestDogDto,
  ) {
    return ApiResponseDto.success(
      await this.guestCustomerService.createGuestDog(
        customerId,
        dto,
        this.currentOperatorId(req),
      ),
    );
  }

  /**
   * 搜索代客客户（后台代客下单选客户）。
   *
   * 只查 `isGuest=true`；员工即可访问。返回 `{ items }`，每项含狗狗数量，
   * 后台可以直接展示"王女士（2 只狗）"。
   */
  @Get()
  @ApiOperation({ summary: '搜索代客客户（员工可用）' })
  async searchGuestCustomers(@Query('keyword') keyword?: string) {
    const items = await this.guestCustomerService.searchGuestCustomers(keyword);
    return ApiResponseDto.success({ items });
  }
}
