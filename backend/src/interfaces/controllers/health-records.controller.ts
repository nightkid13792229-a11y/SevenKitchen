/**
 * Health Records Controller
 * Handles vaccine, checkup, medical record, and allergy related endpoints
 */

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
