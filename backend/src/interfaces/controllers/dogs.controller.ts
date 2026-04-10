/**
 * Dogs Controller
 * Handles dog profile related endpoints
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
  HttpCode,
  HttpStatus,
  ValidationPipe,
  UsePipes,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  NotFoundException,
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
  ApiConsumes,
} from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import {
  DogService,
  DOG_REPOSITORY,
  DOG_BREED_REPOSITORY,
  RECIPE_REPOSITORY,
} from '../../application/dog/dog.service';
import type { DogRepository } from '../../domain/dog/dog.repository';
import type { DogBreedRepository } from '../../domain/dog/dog-breed.repository';
import type { RecipeRepository } from '../../domain/recipe/recipe.repository';
import {
  MEDICAL_RECORD_REPOSITORY,
  CHECKUP_RECORD_REPOSITORY,
  ALLERGY_RECORD_REPOSITORY,
} from '../../application/health/health.service';
import type { MedicalRecordRepository } from '../../domain/health/health.repository';
import type { CheckupRecordRepository } from '../../domain/health/health.repository';
import type { AllergyRecordRepository } from '../../domain/health/health.repository';
import { Inject } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PrismaService } from '../../infrastructure/prisma.service';
import { TencentCosService } from '../../infrastructure/services/tencent-cos.service';
import { CreateDogDto } from '../dto/dogs/create-dog.dto';
import { UpdateDogDto } from '../dto/dogs/update-dog.dto';
import { CalcPreviewDto } from '../dto/dogs/calc-preview.dto';
import { CalcDogForRecipeDto } from '../dto/dogs/calc-for-recipe.dto';
import {
  DogDetailResponseDto,
  DogProfileDto,
  DogCalcResultDto,
} from '../dto/dogs/dog-response.dto';
import {
  calculateDogEnergy,
  OrderStatus,
  TreatInputMode,
  TreatLevel,
} from '../../domain';
import { ApiResponseDto } from '../dto/common/response.dto';
import { Dog } from '../../domain/dog/dog.entity';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';
import { MIXED_BREED_VIRTUAL_ID } from '../../domain/dog/constants';
import { WeightRecordService } from '../../application/weight-record/weight-record.service';
import { CreateWeightRecordDto } from '../dto/weight-record/create-weight-record.dto';
import {
  WeightRecordResponseDto,
  WeightRecordListResponseDto,
} from '../dto/weight-record/weight-record-response.dto';
import { parseYYYYMMDD } from '../../utils/date-helpers';

@ApiTags('Dogs')
@Controller('api/v1/dogs')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class DogsController {
  constructor(
    @Inject(DOG_REPOSITORY)
    private readonly dogRepository: DogRepository,
    @Inject(DOG_BREED_REPOSITORY)
    private readonly dogBreedRepository: DogBreedRepository,
    @Inject(RECIPE_REPOSITORY)
    private readonly recipeRepository: RecipeRepository,
    @Inject(MEDICAL_RECORD_REPOSITORY)
    private readonly medicalRecordRepository: MedicalRecordRepository,
    @Inject(CHECKUP_RECORD_REPOSITORY)
    private readonly checkupRecordRepository: CheckupRecordRepository,
    @Inject(ALLERGY_RECORD_REPOSITORY)
    private readonly allergyRecordRepository: AllergyRecordRepository,
    private readonly dogService: DogService,
    private readonly weightRecordService: WeightRecordService,
    private readonly prisma: PrismaService,
    private readonly cosService: TencentCosService,
  ) {}

  @Post()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Create a new dog profile' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiBody({ type: CreateDogDto })
  @ApiResponse({
    status: 201,
    description: 'Dog profile created successfully',
    type: DogDetailResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - X-Customer-Id header required',
  })
  async createDog(
    @Body() createDogDto: CreateDogDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<DogDetailResponseDto>> {
    // Map customerId to ownerId (domain uses ownerId)
    const ownerId = user.customerId;

    const dog = await this.dogService.createDogProfile({
      ownerId,
      name: createDogDto.name,
      breedId: createDogDto.breedId,
      customBreedName: createDogDto.customBreedName,
      birthday: new Date(createDogDto.birthday),
      gender: createDogDto.gender,
      isNeutered: createDogDto.isNeutered,
      currentWeightKg: createDogDto.currentWeightKg,
      bcsScore: createDogDto.bcsScore,
      activityLevel: createDogDto.activityLevel,
      lifeStageOverride: createDogDto.lifeStageOverride,
      sizeClassOverride: createDogDto.sizeClassOverride,
      mealsPerDay: createDogDto.mealsPerDay,
      treatInputMode: createDogDto.treatInputMode,
      treatLevel: createDogDto.treatLevel,
      manualTreatKcal: createDogDto.manualTreatKcal,
      medicalHistory: createDogDto.medicalHistory,
      allergyFoods: createDogDto.allergyFoods,
      pickyFoods: createDogDto.pickyFoods,
    });

    // Save medical records if provided
    if (createDogDto.medicalRecords && createDogDto.medicalRecords.length > 0) {
      try {
        for (const record of createDogDto.medicalRecords) {
          // 使用parseYYYYMMDD正确解析日期（处理上海时区）
          const visitDate = record.visitDate
            ? parseYYYYMMDD(record.visitDate.split('T')[0])
            : new Date();

          await this.medicalRecordRepository.create({
            dogId: dog.id,
            visitDate: visitDate,
            chiefComplaint: record.chiefComplaint,
            diagnosis: record.diagnosis || '',
            treatment: null,
            medications: [],
            status: 'RECOVERED', // Default status for historical records
            followUpDate: null,
            veterinarian: null,
            notes: record.notes || null,
            attachments: record.attachments || [],
          });
        }
        console.log(
          `[DogsController] Created ${createDogDto.medicalRecords.length} medical records for dog ${dog.id}`,
        );
      } catch (error: any) {
        console.error(
          `[DogsController] Failed to save medical records for dog ${dog.id}:`,
          error,
        );
        // Don't fail the entire operation if medical records save fails
      }
    }

    // Save checkup records if provided
    if (createDogDto.checkupRecords && createDogDto.checkupRecords.length > 0) {
      try {
        for (const record of createDogDto.checkupRecords) {
          // 使用parseYYYYMMDD正确解析日期（处理上海时区）
          // 如果日期字符串包含时间部分，先提取日期部分
          const dateOnly = record.checkupDate.split('T')[0];
          const checkupDate = parseYYYYMMDD(dateOnly);

          await this.checkupRecordRepository.create({
            dogId: dog.id,
            checkupDate: checkupDate,
            checkupType: record.checkupType,
            findings: record.notes || '',
            recommendations: null,
            veterinarian: null,
            attachments: record.attachments || [],
          });
        }
        console.log(
          `[DogsController] Created ${createDogDto.checkupRecords.length} checkup records for dog ${dog.id}`,
        );
      } catch (error: any) {
        console.error(
          `[DogsController] Failed to save checkup records for dog ${dog.id}:`,
          error,
        );
        // Don't fail the entire operation if checkup records save fails
      }
    }

    // Save allergy records if provided
    if (createDogDto.allergyRecords && createDogDto.allergyRecords.length > 0) {
      try {
        for (const record of createDogDto.allergyRecords) {
          await this.allergyRecordRepository.create({
            dogId: dog.id,
            allergen: record.allergen,
            notes: record.notes || null,
            attachments: record.attachments || [],
          });
        }
        console.log(
          `[DogsController] Created ${createDogDto.allergyRecords.length} allergy records for dog ${dog.id}`,
        );
      } catch (error: any) {
        console.error(
          `[DogsController] Failed to save allergy records for dog ${dog.id}:`,
          error,
        );
        // Don't fail the entire operation if allergy records save fails
      }
    }

    const calcResult = await this.dogService.calcPreview(dog.id);

    const response: DogDetailResponseDto = {
      profile: this.mapDogToProfileDto(dog),
      calcResult,
    };

    return ApiResponseDto.success(response);
  }

  @Put(':id')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Update dog profile' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'id', description: 'Dog ID' })
  @ApiBody({ type: UpdateDogDto })
  @ApiResponse({
    status: 200,
    description: 'Dog profile updated successfully',
    type: DogDetailResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Dog not found' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - X-Customer-Id header required',
  })
  async updateDog(
    @Param('id') id: string,
    @Body() updateDogDto: UpdateDogDto,
  ): Promise<ApiResponseDto<DogDetailResponseDto>> {
    const dog = await this.dogService.updateDogProfile(id, updateDogDto);

    // Update medical records if provided
    if ('medicalRecords' in updateDogDto) {
      try {
        // Delete existing medical records for this dog
        const existingRecords =
          await this.medicalRecordRepository.findByDogId(id);
        const removedMedicalAttachmentKeys =
          this.collectRemovedAttachmentKeys(
            existingRecords,
            updateDogDto.medicalRecords,
          );
        for (const record of existingRecords) {
          await this.medicalRecordRepository.delete(record.id);
        }

        // Create new medical records
        if (
          updateDogDto.medicalRecords &&
          updateDogDto.medicalRecords.length > 0
        ) {
          for (const record of updateDogDto.medicalRecords) {
            // 使用parseYYYYMMDD正确解析日期（处理上海时区）
            const visitDate = record.visitDate
              ? parseYYYYMMDD(record.visitDate.split('T')[0])
              : new Date();

            await this.medicalRecordRepository.create({
              dogId: id,
              visitDate: visitDate,
              chiefComplaint: record.chiefComplaint,
              diagnosis: record.diagnosis || '',
              treatment: null,
              medications: [],
              status: 'RECOVERED', // Default status for historical records
              followUpDate: null,
              veterinarian: null,
              notes: record.notes || null,
              attachments: record.attachments || [],
            });
          }
          console.log(
            `[DogsController] Updated ${updateDogDto.medicalRecords.length} medical records for dog ${id}`,
          );
        } else {
          console.log(
            `[DogsController] Cleared all medical records for dog ${id}`,
          );
        }
        await this.cleanupRemovedAttachments(
          'medical',
          removedMedicalAttachmentKeys,
        );
      } catch (error: any) {
        console.error(
          `[DogsController] Failed to update medical records for dog ${id}:`,
          error,
        );
        // Don't fail the entire operation if medical records update fails
      }
    }

    // Update checkup records if provided
    if ('checkupRecords' in updateDogDto) {
      try {
        // Delete existing checkup records for this dog
        const existingCheckups =
          await this.checkupRecordRepository.findByDogId(id);
        const removedCheckupAttachmentKeys =
          this.collectRemovedAttachmentKeys(
            existingCheckups,
            updateDogDto.checkupRecords,
          );
        for (const checkup of existingCheckups) {
          await this.checkupRecordRepository.delete(checkup.id);
        }

        // Create new checkup records
        if (
          updateDogDto.checkupRecords &&
          updateDogDto.checkupRecords.length > 0
        ) {
          for (const record of updateDogDto.checkupRecords) {
            // 使用parseYYYYMMDD正确解析日期（处理上海时区）
            const dateOnly = record.checkupDate.split('T')[0];
            const checkupDate = parseYYYYMMDD(dateOnly);

            await this.checkupRecordRepository.create({
              dogId: id,
              checkupDate: checkupDate,
              checkupType: record.checkupType,
              findings: record.notes || '',
              recommendations: null,
              veterinarian: null,
              attachments: record.attachments || [],
            });
          }
          console.log(
            `[DogsController] Updated ${updateDogDto.checkupRecords.length} checkup records for dog ${id}`,
          );
        } else {
          console.log(
            `[DogsController] Cleared all checkup records for dog ${id}`,
          );
        }
        await this.cleanupRemovedAttachments(
          'checkup',
          removedCheckupAttachmentKeys,
        );
      } catch (error: any) {
        console.error(
          `[DogsController] Failed to update checkup records for dog ${id}:`,
          error,
        );
        // Don't fail the entire operation if checkup records update fails
      }
    }

    // Update allergy records if provided
    if ('allergyRecords' in updateDogDto) {
      try {
        // Delete existing allergy records for this dog
        const existingAllergies =
          await this.allergyRecordRepository.findByDogId(id);
        const removedAllergyAttachmentKeys =
          this.collectRemovedAttachmentKeys(
            existingAllergies,
            updateDogDto.allergyRecords,
          );
        for (const allergy of existingAllergies) {
          await this.allergyRecordRepository.delete(allergy.id);
        }

        // Create new allergy records
        if (
          updateDogDto.allergyRecords &&
          updateDogDto.allergyRecords.length > 0
        ) {
          for (const record of updateDogDto.allergyRecords) {
            await this.allergyRecordRepository.create({
              dogId: id,
              allergen: record.allergen,
              notes: record.notes || null,
              attachments: record.attachments || [],
            });
          }
          console.log(
            `[DogsController] Updated ${updateDogDto.allergyRecords.length} allergy records for dog ${id}`,
          );
        } else {
          console.log(
            `[DogsController] Cleared all allergy records for dog ${id}`,
          );
        }
        await this.cleanupRemovedAttachments(
          'allergy',
          removedAllergyAttachmentKeys,
        );
      } catch (error: any) {
        console.error(
          `[DogsController] Failed to update allergy records for dog ${id}:`,
          error,
        );
        // Don't fail the entire operation if allergy records update fails
      }
    }

    // Try to calculate preview, but don't fail if calculation fails
    let calcResult = null;
    try {
      calcResult = await this.dogService.calcPreview(dog.id);
    } catch (error: any) {
      // Log the error but continue - allow updating dog profile even if calculation fails
      console.warn(
        `[DogsController] Failed to calculate preview for updated dog ${id}:`,
        error.message,
      );
    }

    const response: DogDetailResponseDto = {
      profile: this.mapDogToProfileDto(dog),
      calcResult,
    };

    return ApiResponseDto.success(response);
  }

  private collectRemovedAttachmentKeys(
    existingRecords: Array<{ attachments?: unknown }> | null | undefined,
    nextRecords: Array<{ attachments?: unknown }> | null | undefined,
  ): string[] {
    const currentKeys = this.extractAttachmentKeys(existingRecords);
    const nextKeys = new Set(this.extractAttachmentKeys(nextRecords));

    return currentKeys.filter((key) => !nextKeys.has(key));
  }

  private extractAttachmentKeys(
    records: Array<{ attachments?: unknown }> | null | undefined,
  ): string[] {
    if (!Array.isArray(records)) {
      return [];
    }

    const keys = new Set<string>();

    for (const record of records) {
      if (!Array.isArray(record?.attachments)) {
        continue;
      }

      for (const attachment of record.attachments) {
        if (typeof attachment !== 'string' || !attachment.trim()) {
          continue;
        }

        try {
          const key = new URL(attachment).pathname.replace(/^\/+/, '');
          if (key) {
            keys.add(key);
          }
        } catch {
          // Ignore malformed attachment URLs so they do not block record updates.
        }
      }
    }

    return Array.from(keys);
  }

  private async cleanupRemovedAttachments(
    recordType: 'medical' | 'checkup' | 'allergy',
    keys: string[],
  ): Promise<void> {
    if (!keys.length) {
      return;
    }

    const results = await Promise.allSettled(
      keys.map((key) => this.cosService.deleteImage(key)),
    );

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(
          `[DogsController] Failed to delete ${recordType} attachment from COS:`,
          keys[index],
          result.reason,
        );
      }
    });
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete dog profile for current customer' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'id', description: 'Dog ID' })
  @ApiResponse({ status: 204, description: 'Dog profile deleted successfully' })
  @ApiResponse({ status: 404, description: 'Dog not found' })
  @ApiResponse({
    status: 400,
    description: 'Dog has related orders and cannot be deleted',
  })
  async deleteDog(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    const dog = await this.dogRepository.findById(id);
    if (!dog || dog.ownerId !== user.customerId) {
      throw new NotFoundException('Dog not found');
    }

    const activeOrdersCount = await this.prisma.order.count({
      where: {
        dogId: id,
        customerId: user.customerId,
        status: {
          notIn: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
        },
      },
    });

    if (activeOrdersCount > 0) {
      throw new BadRequestException(
        '当前宠物仍有关联中的订单，请先取消或完成订单后再删除档案',
      );
    }

    const customRecipeOrderCount = await this.prisma.customRecipeOrder.count({
      where: {
        dogId: id,
        customerId: user.customerId,
      },
    });

    if (customRecipeOrderCount > 0) {
      throw new BadRequestException(
        '当前宠物存在关联的定制食谱订单，暂不支持删除档案',
      );
    }

    try {
      await this.dogRepository.delete(id);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '';
      if (
        (error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2003') ||
        errorMessage.includes('foreign key') ||
        errorMessage.includes('Foreign key')
      ) {
        throw new BadRequestException(
          '当前宠物存在关联历史订单，暂不支持删除档案',
        );
      }

      throw error;
    }
  }

  @Get('breeds')
  @ApiOperation({ summary: 'List all dog breeds' })
  @ApiResponse({
    status: 200,
    description: 'List of dog breeds',
  })
  async listBreeds(): Promise<ApiResponseDto<any[]>> {
    const breeds = await this.dogBreedRepository.findAll();
    const breedDtos = breeds.map((breed) => this.mapBreedToDto(breed));
    return ApiResponseDto.success(breedDtos);
  }

  @Get('breeds/hot')
  @ApiOperation({ summary: 'List hot standard dog breeds' })
  @ApiResponse({
    status: 200,
    description: 'Hot standard breeds ranked by dog profile usage',
  })
  async listHotBreeds(): Promise<ApiResponseDto<any[]>> {
    const breeds = await this.dogBreedRepository.findHotBreeds(10);
    const breedDtos = breeds.map((breed) => this.mapBreedToDto(breed));
    return ApiResponseDto.success(breedDtos);
  }

  @Get()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'List dogs for current customer' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'List of dogs for current customer',
    type: [DogProfileDto],
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - X-Customer-Id header required',
  })
  async listDogs(
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<DogProfileDto[]>> {
    // Map customerId to ownerId (domain uses ownerId)
    const ownerId = user.customerId;

    const dogs = await this.dogRepository.findByOwnerId(ownerId);

    // Load all breeds to create breed name map
    const breeds = await this.dogBreedRepository.findAll();
    const breedMap = new Map<string, string>();
    breeds.forEach((breed) => {
      breedMap.set(breed.id, breed.name);
    });

    const profiles: DogProfileDto[] = dogs.map((dog) =>
      this.mapDogToProfileDto(dog, breedMap),
    );

    return ApiResponseDto.success(profiles);
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get dog profile detail' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'id', description: 'Dog ID' })
  @ApiResponse({
    status: 200,
    description: 'Dog profile retrieved successfully',
    type: DogDetailResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Dog not found' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - X-Customer-Id header required',
  })
  async getDog(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<DogDetailResponseDto> | ApiResponseDto<null>> {
    const dog = await this.dogRepository.findById(id);
    if (!dog) {
      return ApiResponseDto.error(404, 'Dog not found');
    }

    // Load breed to get breed name
    const breed = await this.dogBreedRepository.findById(dog.breedId);
    const breedMap = breed ? new Map([[dog.breedId, breed.name]]) : new Map();

    // Load medical records
    let medicalRecords: any[] | null = null;
    try {
      const records = await this.medicalRecordRepository.findByDogId(id);
      // Convert to DTO format
      medicalRecords = records.map((record: any) => ({
        id: record.id,
        chiefComplaint: record.chiefComplaint,
        visitDate: record.visitDate
          ? record.visitDate.toISOString().split('T')[0]
          : null, // Only YYYY-MM-DD
        diagnosis: record.diagnosis || null,
        notes: record.notes || null,
        attachments: record.attachments || null,
      }));
      console.log(
        `[DogsController] Loaded ${medicalRecords?.length || 0} medical records for dog ${id}`,
      );
    } catch (error: any) {
      console.warn(
        `[DogsController] Failed to load medical records for dog ${id}:`,
        error.message,
      );
    }

    // Load checkup records
    let checkupRecords: any[] | null = null;
    try {
      const records = await this.checkupRecordRepository.findByDogId(id);
      // Convert to DTO format
      checkupRecords = records.map((record: any) => ({
        id: record.id,
        checkupDate: record.checkupDate.toISOString().split('T')[0], // Only YYYY-MM-DD
        checkupType: record.checkupType,
        notes: record.findings || null, // findings maps to notes
        attachments: record.attachments || null,
      }));
      console.log(
        `[DogsController] Loaded ${checkupRecords?.length || 0} checkup records for dog ${id}`,
      );
    } catch (error: any) {
      console.warn(
        `[DogsController] Failed to load checkup records for dog ${id}:`,
        error.message,
      );
    }

    // Load allergy records
    let allergyRecords: any[] | null = null;
    try {
      const records = await this.allergyRecordRepository.findByDogId(id);
      // Convert to DTO format
      allergyRecords = records.map((record: any) => ({
        id: record.id,
        allergen: record.allergen,
        allergenType: record.allergenType,
        discoveryDate: record.discoveryDate.toISOString().split('T')[0], // Only YYYY-MM-DD
        symptoms: record.symptoms,
        severity: record.severity,
        confirmedBy: record.confirmedBy,
        treatment: record.treatment || null,
        notes: record.notes || null,
        attachments: record.attachments || [],
      }));
      console.log(
        `[DogsController] Loaded ${allergyRecords?.length || 0} allergy records for dog ${id}`,
      );
    } catch (error: any) {
      console.warn(
        `[DogsController] Failed to load allergy records for dog ${id}:`,
        error.message,
      );
    }

    // Try to calculate preview, but don't fail if calculation fails
    let calcResult = null;
    try {
      calcResult = await this.dogService.calcPreview(dog.id);
    } catch (error: any) {
      // Log the error but continue - allow loading dog profile even if calculation fails
      console.warn(
        `[DogsController] Failed to calculate preview for dog ${id}:`,
        error.message,
      );
    }

    const response: DogDetailResponseDto = {
      profile: this.mapDogToProfileDto(
        dog,
        breedMap,
        medicalRecords,
        checkupRecords,
        allergyRecords,
      ),
      calcResult,
    };

    return ApiResponseDto.success(response);
  }

  @Post('calc-preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Calculate energy requirement preview (dry-run)' })
  @ApiBody({ type: CalcPreviewDto })
  @ApiResponse({
    status: 200,
    description: 'Calculation preview',
    type: DogCalcResultDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async calcPreview(
    @Body() calcPreviewDto: CalcPreviewDto,
  ): Promise<ApiResponseDto<DogCalcResultDto | null>> {
    // Load breed for calculation
    // For mixed breed dogs, use virtual ID and breed will be null
    let breed = null;
    if (calcPreviewDto.breedId !== MIXED_BREED_VIRTUAL_ID) {
      breed = await this.dogBreedRepository.findById(calcPreviewDto.breedId);
      if (!breed) {
        return ApiResponseDto.error(400, 'Breed not found');
      }
    }

    // Create temporary dog entity for calculation (no database save needed)
    const tempDog = new Dog(
      'temp-calc-id',
      'temp-owner-id',
      'Temp',
      calcPreviewDto.breedId,
      null, // customBreedName - not applicable for calc preview
      new Date(calcPreviewDto.birthday),
      calcPreviewDto.gender,
      calcPreviewDto.isNeutered,
      calcPreviewDto.currentWeightKg,
      calcPreviewDto.bcsScore,
      calcPreviewDto.activityLevel,
      calcPreviewDto.lifeStageOverride,
      calcPreviewDto.sizeClassOverride ?? null,
      calcPreviewDto.mealsPerDay ?? 2,
      calcPreviewDto.treatInputMode ?? TreatInputMode.ESTIMATE_LEVEL,
      calcPreviewDto.treatLevel ?? TreatLevel.LOW,
      calcPreviewDto.manualTreatKcal ?? null,
      null, // medicalHistory
      null, // allergyFoods
      null, // pickyFoods
      0,
    );

    // Direct calculation without database save
    const calcResult = calculateDogEnergy(tempDog, undefined, breed, true);

    const result: DogCalcResultDto = {
      rer: calcResult.rer,
      totalDer: calcResult.der,
      finalFoodKcal: calcResult.finalFoodKcal,
      treatDeduction: calcResult.treatDeduction,
      isTreatCapped: calcResult.isTreatCapped,
      dailyIntakeG: calcResult.dailyIntakeG,
      calcDetails: calcResult.calcDetails,
    };

    return ApiResponseDto.success(result);
  }

  // ==========================================
  // Weight Record Endpoints
  // ==========================================

  @Post(':dogId/weight-records')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Create a weight record for a dog' })
  @ApiSecurity('X-Customer-Id')
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiBody({ type: CreateWeightRecordDto })
  @ApiResponse({
    status: 201,
    description: 'Weight record created successfully',
    type: WeightRecordResponseDto,
  })
  async createWeightRecord(
    @Param('dogId') dogId: string,
    @Body() dto: CreateWeightRecordDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<WeightRecordResponseDto>> {
    const record = await this.weightRecordService.create(user.customerId, {
      ...dto,
      dogId,
    });

    return ApiResponseDto.success(this.mapWeightRecordToDto(record));
  }

  @Get(':dogId/weight-records')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get weight records for a dog' })
  @ApiSecurity('X-Customer-Id')
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Weight records retrieved successfully',
    type: WeightRecordListResponseDto,
  })
  async getWeightRecords(
    @Param('dogId') dogId: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
    @CurrentUser() user?: RequestUser,
  ): Promise<ApiResponseDto<WeightRecordListResponseDto>> {
    const result = await this.weightRecordService.findByDogId(
      user!.customerId,
      dogId,
      limit ? parseInt(limit.toString()) : undefined,
      offset ? parseInt(offset.toString()) : undefined,
    );

    return ApiResponseDto.success({
      total: result.total,
      records: result.records.map((r) => this.mapWeightRecordToDto(r)),
    });
  }

  @Delete('weight-records/:recordId')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a weight record' })
  @ApiSecurity('X-Customer-Id')
  @ApiParam({ name: 'recordId', description: 'Weight record ID' })
  @ApiResponse({
    status: 200,
    description: 'Weight record deleted successfully',
  })
  async deleteWeightRecord(
    @Param('recordId') recordId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<null>> {
    await this.weightRecordService.delete(user.customerId, recordId);
    return ApiResponseDto.success(null);
  }

  @Put('weight-records/:recordId/sync')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Update syncedToProfile flag' })
  @ApiSecurity('X-Customer-Id')
  @ApiParam({ name: 'recordId', description: 'Weight record ID' })
  @ApiBody({
    schema: { type: 'object', properties: { synced: { type: 'boolean' } } },
  })
  @ApiResponse({
    status: 200,
    description: 'Sync flag updated successfully',
    type: WeightRecordResponseDto,
  })
  async updateWeightRecordSynced(
    @Param('recordId') recordId: string,
    @Body('synced') synced: boolean,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<WeightRecordResponseDto>> {
    const record = await this.weightRecordService.updateSyncedToProfile(
      user.customerId,
      recordId,
      synced,
    );

    return ApiResponseDto.success(this.mapWeightRecordToDto(record));
  }

  private mapWeightRecordToDto(record: any): WeightRecordResponseDto {
    return {
      id: record.id,
      dogId: record.dogId,
      recordDate: record.recordDate.toISOString().split('T')[0],
      weightKg: record.weightKg,
      note: record.note,
      syncedToProfile: record.syncedToProfile,
      createdAt: record.createdAt.toISOString(),
    };
  }

  private mapDogToProfileDto(
    dog: Dog,
    breedMap?: Map<string, string>,
    medicalRecords?: any[] | null,
    checkupRecords?: any[] | null,
    allergyRecords?: any[] | null,
  ): DogProfileDto {
    // Determine breed name: custom breed name takes priority, then lookup from breed map
    const breedName = dog.customBreedName || breedMap?.get(dog.breedId) || null;

    return {
      id: dog.id,
      ownerId: dog.ownerId,
      name: dog.name,
      breedId: dog.breedId,
      breedName,
      customBreedName: dog.customBreedName,
      birthday: dog.birthday.toISOString(),
      gender: dog.gender,
      isNeutered: dog.isNeutered,
      currentWeightKg: dog.currentWeightKg,
      bcsScore: dog.bcsScore,
      activityLevel: dog.activityLevel,
      lifeStageOverride: dog.lifeStageOverride,
      sizeClassOverride: dog.sizeClassOverride,
      mealsPerDay: dog.mealsPerDay,
      treatInputMode: dog.treatInputMode,
      treatLevel: dog.treatLevel,
      manualTreatKcal: dog.manualTreatKcal,
      medicalHistory: dog.medicalHistory,
      medicalRecords: medicalRecords || null,
      checkupRecords: checkupRecords || null,
      allergyRecords: allergyRecords || null,
      allergyFoods: dog.allergyFoods,
      pickyFoods: dog.pickyFoods,
      cachedTargetFoodKcal: dog.cachedTargetFoodKcal,
    };
  }

  private mapBreedToDto(breed: any) {
    return {
      id: breed.id,
      name: breed.name,
      aliases: breed.aliases || [],
      sizeCategory: breed.sizeCategory,
      adultAgeMonths: breed.adultAgeMonths,
      seniorAgeYears: breed.seniorAgeYears,
      averageAdultWeightKg: breed.averageAdultWeightKg,
      isCommon: breed.isCommon,
    };
  }

  // ==================== Calculate Dog for Recipe ====================

  /**
   * Calculate dog's daily food intake for a specific recipe
   * POST /api/v1/dogs/:id/calc-for-recipe
   *
   * This endpoint returns both kcal needs and gram amounts based on recipe energy density.
   * It's used in the recipe order page to initialize the per-meal feeding amount.
   */
  @Post(':id/calc-for-recipe')
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: 'Calculate daily food intake for a specific recipe',
    description:
      'Returns both kcal needs and gram amounts based on recipe energy density. Used for recipe order page.',
  })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'id', description: 'Dog ID' })
  @ApiBody({ type: CalcDogForRecipeDto })
  @ApiResponse({
    status: 200,
    description: 'Calculation result with daily intake in grams',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string', example: 'Success' },
        data: {
          type: 'object',
          properties: {
            rer: {
              type: 'number',
              description: 'Resting Energy Requirement (kcal/day)',
              example: 417.2,
            },
            totalDer: {
              type: 'number',
              description: 'Total Daily Energy Requirement (kcal/day)',
              example: 667.5,
            },
            finalFoodKcal: {
              type: 'number',
              description: 'Final food kcal needed (after treat deduction)',
              example: 647.5,
            },
            treatDeduction: {
              type: 'number',
              description: 'Treat calories deducted (kcal/day)',
              example: 20.0,
            },
            isTreatCapped: {
              type: 'boolean',
              description: 'Whether treat deduction hit 10% safety cap',
              example: false,
            },
            dailyIntakeG: {
              type: 'number',
              description: 'Daily food intake in grams',
              example: 447,
            },
            perMealIntakeG: {
              type: 'number',
              description: 'Per-meal food intake in grams',
              example: 224,
            },
            mealsPerDay: {
              type: 'number',
              description: 'Number of meals per day',
              example: 2,
            },
            calcDetails: {
              type: 'object',
              description: 'Detailed calculation breakdown for display',
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 404, description: 'Dog or recipe not found' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - X-Customer-Id header required',
  })
  async calcForRecipe(
    @Param('id') dogId: string,
    @Body() dto: CalcDogForRecipeDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    // 1. Verify dog ownership
    const dog = await this.dogRepository.findById(dogId);
    if (!dog || dog.ownerId !== user.customerId) {
      return ApiResponseDto.error(404, 'Dog not found');
    }

    // 2. Load recipe to get energy density
    const recipe = await this.recipeRepository.findById(dto.recipeId);
    if (!recipe) {
      return ApiResponseDto.error(404, 'Recipe not found');
    }

    // 3. Load breed for calculation
    const breed = await this.dogBreedRepository.findById(dog.breedId);

    // 4. Calculate energy needs WITH recipe energy density
    const calcResult = calculateDogEnergy(
      dog,
      recipe.energyDensityKcalPerKg, // ✅ Key: pass energy density for gram calculation
      breed,
      true, // includeDetails
    );

    // 5. Build response
    const response = {
      rer: calcResult.rer,
      totalDer: calcResult.der,
      finalFoodKcal: calcResult.finalFoodKcal,
      treatDeduction: calcResult.treatDeduction,
      isTreatCapped: calcResult.isTreatCapped,
      dailyIntakeG: calcResult.dailyIntakeG || 0,
      perMealIntakeG: calcResult.dailyIntakeG
        ? Math.round(calcResult.dailyIntakeG / dog.mealsPerDay)
        : 0,
      mealsPerDay: dog.mealsPerDay,
      calcDetails: calcResult.calcDetails || {},
    };

    return ApiResponseDto.success(response);
  }

  // ==================== Calculate Dog Energy (Independent) ====================

  /**
   * Calculate dog's daily energy requirement (DER)
   * GET /api/v1/dogs/:id/energy-calculation
   *
   * This endpoint returns DER calculation without recipe-specific data.
   * Used in portion calculation page to get accurate DER values.
   */
  @Get(':id/energy-calculation')
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: 'Calculate dog daily energy requirement',
    description:
      'Returns DER (Daily Energy Requirement) calculation details. Used for portion calculation page.',
  })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'id', description: 'Dog ID' })
  @ApiResponse({
    status: 200,
    description: 'Energy calculation result',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string', example: 'Success' },
        data: {
          type: 'object',
          properties: {
            rer: {
              type: 'number',
              description: 'Resting Energy Requirement (kcal/day)',
              example: 417.2,
            },
            der: {
              type: 'number',
              description: 'Daily Energy Requirement (kcal/day)',
              example: 667.5,
            },
            finalFoodKcal: {
              type: 'number',
              description: 'Final food kcal needed (after treat deduction)',
              example: 647.5,
            },
            treatDeduction: {
              type: 'number',
              description: 'Treat calories deducted (kcal/day)',
              example: 20.0,
            },
            isTreatCapped: {
              type: 'boolean',
              description: 'Whether treat deduction hit 10% safety cap',
              example: false,
            },
            calcDetails: {
              type: 'object',
              description: 'Detailed calculation breakdown for display',
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Dog not found' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - X-Customer-Id header required',
  })
  async getEnergyCalculation(
    @Param('id') dogId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    // 1. Verify dog ownership
    const dog = await this.dogRepository.findById(dogId);
    if (!dog || dog.ownerId !== user.customerId) {
      return ApiResponseDto.error(404, 'Dog not found');
    }

    // 2. Load breed for calculation
    const breed = await this.dogBreedRepository.findById(dog.breedId);

    // 3. Calculate energy needs WITHOUT recipe energy density
    const calcResult = calculateDogEnergy(
      dog,
      undefined, // No energy density needed for pure DER calculation
      breed,
      true, // includeDetails
    );

    // 4. Build response
    const response = {
      rer: calcResult.rer,
      der: calcResult.der,
      finalFoodKcal: calcResult.finalFoodKcal,
      treatDeduction: calcResult.treatDeduction,
      isTreatCapped: calcResult.isTreatCapped,
      calcDetails: calcResult.calcDetails || {},
    };

    return ApiResponseDto.success(response);
  }

  // ==================== Dog Avatar Upload ====================

  @Post(':id/avatar')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Upload dog avatar image' })
  @ApiSecurity('X-Customer-Id')
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'id', description: 'Dog ID' })
  @ApiResponse({
    status: 201,
    description: 'Avatar uploaded successfully',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'Avatar image URL' },
            key: { type: 'string', description: 'COS object key' },
          },
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadDogAvatar(
    @Param('id') dogId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException('File size exceeds 5MB limit');
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Invalid file type. Only JPG, PNG, GIF, and WEBP are allowed',
      );
    }

    // Verify dog ownership
    const dog = await this.dogRepository.findById(dogId);
    if (!dog) {
      throw new BadRequestException('Dog not found');
    }
    if (dog.ownerId !== user.customerId) {
      throw new BadRequestException('Access denied');
    }

    try {
      const result = await this.cosService.uploadImage(
        file,
        file.originalname,
        'dogs/avatars',
      );
      const previousAvatarUrl = dog.avatarUrl;

      dog.avatarUrl = result.url;
      await this.dogRepository.save(dog);

      if (previousAvatarUrl && previousAvatarUrl !== result.url) {
        try {
          await this.cosService.deleteImageByUrl(previousAvatarUrl);
        } catch (deleteError) {
          console.error(
            '[DogsController] Failed to delete old avatar:',
            deleteError,
          );
        }
      }

      return ApiResponseDto.success(result);
    } catch (error) {
      console.error('[DogsController] Avatar upload failed:', error);
      throw new BadRequestException('Failed to upload avatar');
    }
  }

  /**
   * Upload medical record attachment (image or PDF)
   * This is a temporary upload before creating the medical record
   * Files are uploaded to: medical-reports/temp/{timestamp}-{random}.{ext}
   */
  @Post('medical-records/upload-attachment')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Upload medical record attachment (image/PDF)' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({
    status: 201,
    description: 'File uploaded successfully',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'File URL' },
            key: { type: 'string', description: 'COS object key' },
          },
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadMedicalAttachment(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException('File size exceeds 10MB limit');
    }

    // Validate file type (images + PDF)
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
    ];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Invalid file type. Only JPG, PNG, GIF, WEBP, and PDF are allowed',
      );
    }

    try {
      // Upload to temporary directory
      // When medical record is created, backend will move these to proper directory
      const result = await this.cosService.uploadImage(
        file,
        file.originalname,
        'medical-reports/temp',
      );

      return ApiResponseDto.success(result);
    } catch (error) {
      console.error(
        '[DogsController] Medical attachment upload failed:',
        error,
      );
      throw new BadRequestException('Failed to upload attachment');
    }
  }

  @Post('checkup-records/upload-attachment')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Upload checkup record attachment (image/PDF)' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({
    status: 201,
    description: 'File uploaded successfully',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'File URL' },
            key: { type: 'string', description: 'COS object key' },
          },
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadCheckupAttachment(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException('File size exceeds 10MB limit');
    }

    // Validate file type (images + PDF)
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
    ];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Invalid file type. Only JPG, PNG, GIF, WEBP, and PDF are allowed',
      );
    }

    try {
      // Upload to temporary directory
      const result = await this.cosService.uploadImage(
        file,
        file.originalname,
        'checkup-reports/temp',
      );

      return ApiResponseDto.success(result);
    } catch (error) {
      console.error(
        '[DogsController] Checkup attachment upload failed:',
        error,
      );
      throw new BadRequestException('Failed to upload attachment');
    }
  }

  @Delete('medical-records/attachments')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: '删除病史记录附件' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'COS文件Key',
          example: 'medical-reports/temp/1234567890-abc123.pdf',
        },
      },
      required: ['key'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '文件删除成功',
  })
  async deleteMedicalAttachment(
    @Body() dto: { key: string },
  ): Promise<ApiResponseDto<any>> {
    if (!dto.key) {
      throw new BadRequestException('缺少文件Key');
    }

    console.log('[DogsController] Deleting medical attachment:', dto.key);

    try {
      await this.cosService.deleteImage(dto.key);
      return ApiResponseDto.success(null, '删除成功');
    } catch (error) {
      console.error(
        '[DogsController] Failed to delete medical attachment:',
        error,
      );
      throw new BadRequestException('删除失败，请重试');
    }
  }

  @Delete('checkup-records/attachments')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: '删除体检记录附件' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'COS文件Key',
          example: 'checkup-reports/temp/1234567890-abc123.pdf',
        },
      },
      required: ['key'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '文件删除成功',
  })
  async deleteCheckupAttachment(
    @Body() dto: { key: string },
  ): Promise<ApiResponseDto<any>> {
    if (!dto.key) {
      throw new BadRequestException('缺少文件Key');
    }

    console.log('[DogsController] Deleting checkup attachment:', dto.key);

    try {
      await this.cosService.deleteImage(dto.key);
      return ApiResponseDto.success(null, '删除成功');
    } catch (error) {
      console.error(
        '[DogsController] Failed to delete checkup attachment:',
        error,
      );
      throw new BadRequestException('删除失败，请重试');
    }
  }
}
