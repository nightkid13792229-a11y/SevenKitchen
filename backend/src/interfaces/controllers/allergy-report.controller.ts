import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { AllergyReportService } from '../../application/health/allergy-report.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';

/**
 * 过敏检测报告（2026-10-04，过敏重构第二期）
 *
 * 老板第 1 条："可以记录自己狗狗的过敏检查报告，
 * 特别是报告中**有哪些需要注意的、可疑的**过敏原食物"。
 */

export class AllergyReportResultDto {
  @IsString()
  @MaxLength(40)
  allergen!: string;

  /**
   * 结论等级，**照抄报告原文的语义**：
   * POSITIVE 阳性 / WEAK_POSITIVE 弱阳性 / SUSPECTED 疑似 /
   * NEGATIVE 阴性 / UNKNOWN 报告没写。
   *
   * 系统不做医学判断 —— 只把"阳性"翻译成"确诊"、
   * 其余翻译成"可疑"，阴性干脆不记成过敏。
   */
  @IsOptional()
  @IsIn(['POSITIVE', 'WEAK_POSITIVE', 'SUSPECTED', 'NEGATIVE', 'UNKNOWN'])
  level?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  notes?: string;
}

export class UpsertAllergyReportDto {
  /** 检测日期 YYYY-MM-DD。此前过敏记录完全没有日期。 */
  @IsOptional()
  @IsString()
  testDate?: string;

  /**
   * 检测方式，照抄报告上写的。
   * 知识库 skin-003：皮试 / 血清 IgE 对食物不良反应不能确诊 ——
   * 但那是给顾客看的引导，不是让系统否定他手里的报告。
   */
  @IsOptional()
  @IsIn(['SERUM', 'INTRADERMAL', 'ELIMINATION', 'OTHER', 'UNKNOWN'])
  testMethod?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  institution?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string;

  /** 识别出的原文，便于客服核对 */
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  ocrText?: string;

  /** 报告原件（照片 / PDF）。2026-10-04 之前这里传完就丢。 */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllergyReportResultDto)
  results?: AllergyReportResultDto[];
}

@ApiTags('Allergy Reports')
@Controller('api/v1/dogs')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class AllergyReportController {
  constructor(private readonly reportService: AllergyReportService) {}

  @Get(':dogId/allergy-reports')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'List allergy test reports for a dog' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiResponse({ status: 200, description: 'Reports retrieved successfully' })
  async list(
    @Param('dogId') dogId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.reportService.list(user.customerId, dogId);
    return ApiResponseDto.success(data);
  }

  @Post(':dogId/allergy-reports')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Create an allergy test report with its results' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiBody({ type: UpsertAllergyReportDto })
  @ApiResponse({ status: 201, description: 'Report created successfully' })
  async create(
    @Param('dogId') dogId: string,
    @Body() dto: UpsertAllergyReportDto,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.reportService.create(user.customerId, dogId, dto);
    return ApiResponseDto.success(data);
  }

  @Get(':dogId/allergy-reports/:reportId')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get a single allergy test report' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  async getOne(
    @Param('dogId') dogId: string,
    @Param('reportId') reportId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.reportService.getOne(
      user.customerId,
      dogId,
      reportId,
    );
    return ApiResponseDto.success(data);
  }

  @Get(':dogId/allergy-reports/:reportId/impact')
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: 'Which ingredients in our library this report makes us avoid',
  })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  async impact(
    @Param('dogId') dogId: string,
    @Param('reportId') reportId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.reportService.describeImpact(
      user.customerId,
      dogId,
      reportId,
    );
    return ApiResponseDto.success(data);
  }

  @Put(':dogId/allergy-reports/:reportId')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Update an allergy test report' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiBody({ type: UpsertAllergyReportDto })
  async update(
    @Param('dogId') dogId: string,
    @Param('reportId') reportId: string,
    @Body() dto: UpsertAllergyReportDto,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.reportService.update(
      user.customerId,
      dogId,
      reportId,
      dto,
    );
    return ApiResponseDto.success(data);
  }

  @Delete(':dogId/allergy-reports/:reportId')
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: 'Delete an allergy test report (allergy records are kept)',
  })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  async remove(
    @Param('dogId') dogId: string,
    @Param('reportId') reportId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.reportService.remove(
      user.customerId,
      dogId,
      reportId,
    );
    return ApiResponseDto.success(data);
  }
}
