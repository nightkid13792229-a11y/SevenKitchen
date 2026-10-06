/**
 * Health Records Controller
 * Handles vaccine, checkup, medical record, and allergy related endpoints
 */

import { buildVaccineCatalog } from '../../domain/health/vaccine-catalog';
import {
  findProductByText,
  suggestProductsForPartialName,
} from '../../domain/health/vaccine-products';
import { HealthReportExtractionService } from '../../application/health/health-report-extraction.service';
import {
  VACCINE_KIND_LABELS,
  classifyVaccineKinds,
} from '../../domain/health/immunization-schedule';
import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UsePipes,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiSecurity,
  ApiHeader,
  ApiQuery,
} from '@nestjs/swagger';
import { Inject } from '@nestjs/common';
import {
  HealthService,
  VACCINE_RECORD_REPOSITORY,
  CHECKUP_RECORD_REPOSITORY,
  MEDICAL_RECORD_REPOSITORY,
  ALLERGY_RECORD_REPOSITORY,
} from '../../application/health/health.service';
import {
  PrismaVaccineRecordRepository,
  PrismaCheckupRecordRepository,
  PrismaMedicalRecordRepository,
  PrismaAllergyRecordRepository,
} from '../../infrastructure/repositories/prisma-health.repository';
import { CreateVaccineDto } from '../dto/health/create-vaccine.dto';
import { UpdateVaccineDto } from '../dto/health/update-vaccine.dto';
import {
  VaccineRecordResponseDto,
  VaccineRecordListResponseDto,
} from '../dto/health/vaccine-response.dto';
import { CreateCheckupDto } from '../dto/health/create-checkup.dto';
import { UpdateCheckupDto } from '../dto/health/update-checkup.dto';
import {
  CheckupRecordResponseDto,
  CheckupRecordListResponseDto,
} from '../dto/health/checkup-response.dto';
import { CreateMedicalRecordDto } from '../dto/health/create-medical-record.dto';
import { UpdateMedicalRecordDto } from '../dto/health/update-medical-record.dto';
import {
  MedicalRecordResponseDto,
  MedicalRecordListResponseDto,
} from '../dto/health/medical-record-response.dto';
import { CreateAllergyDto } from '../dto/health/create-allergy.dto';
import { UpdateAllergyDto } from '../dto/health/update-allergy.dto';
import {
  AllergyRecordResponseDto,
  AllergyRecordListResponseDto,
} from '../dto/health/allergy-response.dto';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';

@ApiTags('Health Records')
@Controller('api/v1/dogs')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class HealthRecordsController {
  constructor(
    @Inject(VACCINE_RECORD_REPOSITORY)
    private readonly vaccineRecordRepo: PrismaVaccineRecordRepository,
    @Inject(CHECKUP_RECORD_REPOSITORY)
    private readonly checkupRecordRepo: PrismaCheckupRecordRepository,
    @Inject(MEDICAL_RECORD_REPOSITORY)
    private readonly medicalRecordRepo: PrismaMedicalRecordRepository,
    @Inject(ALLERGY_RECORD_REPOSITORY)
    private readonly allergyRecordRepo: PrismaAllergyRecordRepository,
    private readonly healthService: HealthService,
    private readonly healthReportExtractionService: HealthReportExtractionService,
  ) {}

  // ==================== Vaccine Records ====================

  @Post(':dogId/vaccines')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Create a vaccine record for a dog' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiBody({ type: CreateVaccineDto })
  @ApiResponse({
    status: 201,
    description: 'Vaccine record created successfully',
    type: VaccineRecordResponseDto,
  })
  async createVaccineRecord(
    @Param('dogId') dogId: string,
    @Body() dto: CreateVaccineDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<VaccineRecordResponseDto>> {
    const record = await this.healthService.createVaccineRecord(
      user.customerId,
      {
        ...dto,
        dogId,
      },
    );
    return ApiResponseDto.success(record);
  }

  @Get(':dogId/vaccines')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get vaccine records for a dog' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiResponse({
    status: 200,
    description: 'Vaccine records retrieved successfully',
    type: VaccineRecordListResponseDto,
  })
  async getVaccineRecords(
    @Param('dogId') dogId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<VaccineRecordListResponseDto>> {
    const records = await this.healthService.getVaccineRecords(
      dogId,
      user.customerId,
    );
    return ApiResponseDto.success(records);
  }

  /**
   * 疫苗名称库 + 归类闭集（2026-10-05）。
   *
   * 界面靠它渲染三样东西：
   *   · 归类必选项（四类，闭集）；
   *   · 一点即选的名字（每个都带已知归类）；
   *   · 产品库（含国产 —— 可**选**但不**推荐**，两个概念别混）。
   *
   * 为什么不写在前端：分类与产品数据是后端的 domain 知识，
   * 前端复制一份迟早对不上（以前就吃过这个亏）。
   */
  /*
   * ⚠️ 路径必须是**两段**（`vaccines/catalog`），不能写成一段的 `vaccine-catalog`。
   *
   * 踩过的坑（2026-10-05）：DogsController 比本控制器先注册，而它有 `@Get(':id')`，
   * 于是 `/dogs/vaccine-catalog` 被它当成 `id = "vaccine-catalog"` 吃掉了 ——
   * 本路由**永远不会被命中**，而且返回的是"狗狗不存在"，看起来像别的问题。
   *
   * 两段就安全：一段的 `:id` 匹配不了两段路径；而 `:dogId/vaccines` 要求第二段
   * 正好是 `vaccines`，这里是 `catalog`，也不冲突。
   *
   * ⚠️ 以后往 `/dogs/` 下加**全局**接口（不带 dogId 的）都要注意这件事，
   *    最好干脆别放在这个前缀下。
   */
  @Get('vaccines/catalog')
  // 跟同控制器其它路由保持一致都要鉴权。
  // 内容是静态参考数据、不含任何用户信息，但**没理由开个例外** ——
  // 少一个口子少一份要交代的东西。
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Vaccine name catalog (kinds + presets + products)' })
  @ApiSecurity('X-Customer-Id')
  getVaccineCatalog() {
    return {
      code: 0,
      message: 'success',
      data: buildVaccineCatalog(),
    };
  }

  /**
   * 边打字边判归类（2026-10-05）。
   *
   * 老板："在输入疫苗名称之后，为什么归类还是需要手动选择呢？"
   * —— 对，名字一填就该自动判出来，只有**认不出来**的时候才需要顾客自己选。
   *
   * 分类逻辑只有后端一份（按已审核的产品目录判成分），所以这里开个轻接口，
   * 界面输入停顿一下来问一次。也刻意做成**两段路径**，理由同 catalog。
   *
   * 返回 kinds 为空数组 = 认不出来 —— 界面会要求顾客自己指定，不猜。
   */
  @Get('vaccines/classify')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Classify a vaccine name into kinds' })
  @ApiSecurity('X-Customer-Id')
  async classifyVaccineName(@Query('name') name: string) {
    const text = String(name || '').trim();

    /*
     * 三级判定（2026-10-05 按老板的规格）：
     *
     *   ① 查表 —— **产品表定分类**。确定、瞬间、可追溯。
     *      「卫佳伍」「宠必威® 幼犬保」「犬四联」都在这步出来。
     *   ② 问 AI —— 查不到才走这里。**AI 的任务是认到具体产品**
     *      （错别字「卫加伍」、只写厂家「英特威」、口语），
     *      认出来之后**再由产品带出分类** —— AI 不直接给分类，
     *      分类永远只有我们那张表一份。
     *   ③ 都认不出 —— 如实返回空数组。界面会**老实承认**，
     *      并把顾客转到手动录入（弹分类选择器）。**绝不猜。**
     */
    let kinds = classifyVaccineKinds(text);
    let via: 'table' | 'ai' | 'unknown' = 'table';

    if (kinds.length === 0 && text) {
      kinds = await this.healthReportExtractionService.matchVaccineProductByName(text);
      via = kinds.length > 0 ? 'ai' : 'unknown';
    } else if (kinds.length === 0) {
      via = 'unknown';
    }

    return {
      code: 0,
      message: 'success',
      data: {
        name: text,
        /**
         * 库里认得出的话，给出**规范产品名**（2026-10-06）。
         *
         * 老板实测：瓶签写「卫佳® Vanguard® Plus 5/CV-L」，库里叫「卫佳捌」。
         * 分类早就认对了（core + lepto = 卫佳捌的成分），但界面那一行
         * 显示的还是瓶签原文，顾客看不出系统认为这是哪一支，
         * 手填框也会跟着冒出来。这里把规范名一并给出。
         * 认不出来就是空串 —— 界面照旧显示顾客写的那串字，绝不硬塞。
         */
        productName: findProductByText(text)?.name || '',
        /**
         * 名字没读全时的候选（2026-10-06）。
         * 「卫佳」→ 卫佳伍 / 卫佳捌 / 卫佳细 —— 界面如实告诉顾客
         * "这行字没读全，请核对瓶子上的名字"，而不是闷声说"没认出来"。
         */
        nameSuggestions: findProductByText(text)
          ? []
          : suggestProductsForPartialName(text)
              .slice(0, 4)
              .map((product) => product.name),
        kinds,
        kindLabels: kinds.map((kind) => VACCINE_KIND_LABELS[kind] || kind),
        /** 判定走的是哪一步 —— 界面要如实告诉顾客"这是我们判的"还是"没认出来" */
        via,
      },
    };
  }

  @Get(':dogId/vaccines/upcoming')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get upcoming vaccines for a dog' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description: 'Days ahead to look (default: 30)',
  })
  @ApiResponse({
    status: 200,
    description: 'Upcoming vaccines retrieved successfully',
    type: VaccineRecordListResponseDto,
  })
  async getUpcomingVaccines(
    @Param('dogId') dogId: string,
    @Query('days') days?: number,
    @CurrentUser() user?: RequestUser,
  ): Promise<ApiResponseDto<VaccineRecordListResponseDto>> {
    const records = await this.healthService.getUpcomingVaccines(
      dogId,
      user!.customerId,
      days ? parseInt(days.toString()) : 30,
    );
    return ApiResponseDto.success(records);
  }

  @Get(':dogId/vaccines/:id')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get a specific vaccine record' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiParam({ name: 'id', description: 'Vaccine record ID' })
  @ApiResponse({
    status: 200,
    description: 'Vaccine record retrieved successfully',
    type: VaccineRecordResponseDto,
  })
  async getVaccineRecord(
    @Param('dogId') dogId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<VaccineRecordResponseDto>> {
    const record = await this.healthService.getVaccineRecord(
      id,
      user.customerId,
    );
    return ApiResponseDto.success(record);
  }

  @Put(':dogId/vaccines/:id')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Update a vaccine record' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiParam({ name: 'id', description: 'Vaccine record ID' })
  @ApiBody({ type: UpdateVaccineDto })
  @ApiResponse({
    status: 200,
    description: 'Vaccine record updated successfully',
    type: VaccineRecordResponseDto,
  })
  async updateVaccineRecord(
    @Param('dogId') dogId: string,
    @Param('id') id: string,
    @Body() dto: UpdateVaccineDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<VaccineRecordResponseDto>> {
    const record = await this.healthService.updateVaccineRecord(
      id,
      user.customerId,
      dto,
    );
    return ApiResponseDto.success(record);
  }

  @Delete(':dogId/vaccines/:id')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Delete a vaccine record' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiParam({ name: 'id', description: 'Vaccine record ID' })
  @ApiResponse({
    status: 200,
    description: 'Vaccine record deleted successfully',
  })
  async deleteVaccineRecord(
    @Param('dogId') dogId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<null>> {
    await this.healthService.deleteVaccineRecord(id, user.customerId);
    return ApiResponseDto.success(null);
  }

  // ==================== Checkup Records ====================

  @Post(':dogId/checkups')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Create a checkup record for a dog' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiBody({ type: CreateCheckupDto })
  @ApiResponse({
    status: 201,
    description: 'Checkup record created successfully',
    type: CheckupRecordResponseDto,
  })
  async createCheckupRecord(
    @Param('dogId') dogId: string,
    @Body() dto: CreateCheckupDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<CheckupRecordResponseDto>> {
    const record = await this.healthService.createCheckupRecord(
      user.customerId,
      {
        ...dto,
        dogId,
      },
    );
    return ApiResponseDto.success(record);
  }

  @Get(':dogId/checkups')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get checkup records for a dog' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiResponse({
    status: 200,
    description: 'Checkup records retrieved successfully',
    type: CheckupRecordListResponseDto,
  })
  async getCheckupRecords(
    @Param('dogId') dogId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<CheckupRecordListResponseDto>> {
    const records = await this.healthService.getCheckupRecords(
      dogId,
      user.customerId,
    );
    return ApiResponseDto.success(records);
  }

  @Get(':dogId/checkups/:id')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get a specific checkup record' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiParam({ name: 'id', description: 'Checkup record ID' })
  @ApiResponse({
    status: 200,
    description: 'Checkup record retrieved successfully',
    type: CheckupRecordResponseDto,
  })
  async getCheckupRecord(
    @Param('dogId') dogId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<CheckupRecordResponseDto>> {
    const record = await this.healthService.getCheckupRecord(
      id,
      user.customerId,
    );
    return ApiResponseDto.success(record);
  }

  @Put(':dogId/checkups/:id')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Update a checkup record' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiParam({ name: 'id', description: 'Checkup record ID' })
  @ApiBody({ type: UpdateCheckupDto })
  @ApiResponse({
    status: 200,
    description: 'Checkup record updated successfully',
    type: CheckupRecordResponseDto,
  })
  async updateCheckupRecord(
    @Param('dogId') dogId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCheckupDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<CheckupRecordResponseDto>> {
    const record = await this.healthService.updateCheckupRecord(
      id,
      user.customerId,
      dto,
    );
    return ApiResponseDto.success(record);
  }

  @Delete(':dogId/checkups/:id')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Delete a checkup record' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiParam({ name: 'id', description: 'Checkup record ID' })
  @ApiResponse({
    status: 200,
    description: 'Checkup record deleted successfully',
  })
  async deleteCheckupRecord(
    @Param('dogId') dogId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<null>> {
    await this.healthService.deleteCheckupRecord(id, user.customerId);
    return ApiResponseDto.success(null);
  }

  // ==================== Medical Records ====================

  @Post(':dogId/medical-records')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Create a medical record for a dog' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiBody({ type: CreateMedicalRecordDto })
  @ApiResponse({
    status: 201,
    description: 'Medical record created successfully',
    type: MedicalRecordResponseDto,
  })
  async createMedicalRecord(
    @Param('dogId') dogId: string,
    @Body() dto: CreateMedicalRecordDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<MedicalRecordResponseDto>> {
    const record = await this.healthService.createMedicalRecord(
      user.customerId,
      {
        ...dto,
        dogId,
      },
    );
    return ApiResponseDto.success(record);
  }

  @Get(':dogId/medical-records')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get medical records for a dog' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiQuery({
    name: 'status',
    required: false,
    type: String,
    description: 'Filter by status (TREATING/RECOVERED/CHRONIC)',
  })
  @ApiResponse({
    status: 200,
    description: 'Medical records retrieved successfully',
    type: MedicalRecordListResponseDto,
  })
  async getMedicalRecords(
    @Param('dogId') dogId: string,
    @Query('status') status?: string,
    @CurrentUser() user?: RequestUser,
  ): Promise<ApiResponseDto<MedicalRecordListResponseDto>> {
    const records = await this.healthService.getMedicalRecords(
      dogId,
      user!.customerId,
      status,
    );
    return ApiResponseDto.success(records);
  }

  @Get(':dogId/medical-records/:id')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get a specific medical record' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiParam({ name: 'id', description: 'Medical record ID' })
  @ApiResponse({
    status: 200,
    description: 'Medical record retrieved successfully',
    type: MedicalRecordResponseDto,
  })
  async getMedicalRecord(
    @Param('dogId') dogId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<MedicalRecordResponseDto>> {
    const record = await this.healthService.getMedicalRecord(
      id,
      user.customerId,
    );
    return ApiResponseDto.success(record);
  }

  @Put(':dogId/medical-records/:id')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Update a medical record' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiParam({ name: 'id', description: 'Medical record ID' })
  @ApiBody({ type: UpdateMedicalRecordDto })
  @ApiResponse({
    status: 200,
    description: 'Medical record updated successfully',
    type: MedicalRecordResponseDto,
  })
  async updateMedicalRecord(
    @Param('dogId') dogId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMedicalRecordDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<MedicalRecordResponseDto>> {
    const record = await this.healthService.updateMedicalRecord(
      id,
      user.customerId,
      dto,
    );
    return ApiResponseDto.success(record);
  }

  @Delete(':dogId/medical-records/:id')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Delete a medical record' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiParam({ name: 'id', description: 'Medical record ID' })
  @ApiResponse({
    status: 200,
    description: 'Medical record deleted successfully',
  })
  async deleteMedicalRecord(
    @Param('dogId') dogId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<null>> {
    await this.healthService.deleteMedicalRecord(id, user.customerId);
    return ApiResponseDto.success(null);
  }

  // ==================== Allergy Records ====================

  @Post(':dogId/allergies')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Create an allergy record for a dog' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiBody({ type: CreateAllergyDto })
  @ApiResponse({
    status: 201,
    description: 'Allergy record created successfully',
    type: AllergyRecordResponseDto,
  })
  async createAllergyRecord(
    @Param('dogId') dogId: string,
    @Body() dto: CreateAllergyDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<AllergyRecordResponseDto>> {
    const record = await this.healthService.createAllergyRecord(
      user.customerId,
      {
        ...dto,
        dogId,
      },
    );
    return ApiResponseDto.success(record);
  }

  @Get(':dogId/allergies')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get allergy records for a dog' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiResponse({
    status: 200,
    description: 'Allergy records retrieved successfully',
    type: AllergyRecordListResponseDto,
  })
  async getAllergyRecords(
    @Param('dogId') dogId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<AllergyRecordListResponseDto>> {
    const records = await this.healthService.getAllergyRecords(
      dogId,
      user.customerId,
    );
    return ApiResponseDto.success(records);
  }

  @Get(':dogId/allergies/:id')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get a specific allergy record' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiParam({ name: 'id', description: 'Allergy record ID' })
  @ApiResponse({
    status: 200,
    description: 'Allergy record retrieved successfully',
    type: AllergyRecordResponseDto,
  })
  async getAllergyRecord(
    @Param('dogId') dogId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<AllergyRecordResponseDto>> {
    const record = await this.healthService.getAllergyRecord(
      id,
      user.customerId,
    );
    return ApiResponseDto.success(record);
  }

  @Put(':dogId/allergies/:id')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Update an allergy record' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiParam({ name: 'id', description: 'Allergy record ID' })
  @ApiBody({ type: UpdateAllergyDto })
  @ApiResponse({
    status: 200,
    description: 'Allergy record updated successfully',
    type: AllergyRecordResponseDto,
  })
  async updateAllergyRecord(
    @Param('dogId') dogId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAllergyDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<AllergyRecordResponseDto>> {
    const record = await this.healthService.updateAllergyRecord(
      id,
      user.customerId,
      dto,
    );
    return ApiResponseDto.success(record);
  }

  @Delete(':dogId/allergies/:id')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Delete an allergy record' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiParam({ name: 'id', description: 'Allergy record ID' })
  @ApiResponse({
    status: 200,
    description: 'Allergy record deleted successfully',
  })
  async deleteAllergyRecord(
    @Param('dogId') dogId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<null>> {
    await this.healthService.deleteAllergyRecord(id, user.customerId);
    return ApiResponseDto.success(null);
  }
}
