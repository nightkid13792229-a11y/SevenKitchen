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
import { DogService, DOG_REPOSITORY, DOG_BREED_REPOSITORY, RECIPE_REPOSITORY } from '../../application/dog/dog.service';
import type { DogRepository } from '../../domain/dog/dog.repository';
import type { DogBreedRepository } from '../../domain/dog/dog-breed.repository';
import type { RecipeRepository } from '../../domain/recipe/recipe.repository';
import { Inject } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
import { calculateDogEnergy } from '../../domain';
import { ApiResponseDto } from '../dto/common/response.dto';
import { TreatInputMode, TreatLevel } from '../../domain';
import { Dog } from '../../domain/dog/dog.entity';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';
import { MIXED_BREED_VIRTUAL_ID } from '../../domain/dog/constants';
import { WeightRecordService } from '../../application/weight-record/weight-record.service';
import { CreateWeightRecordDto } from '../dto/weight-record/create-weight-record.dto';
import { WeightRecordResponseDto, WeightRecordListResponseDto } from '../dto/weight-record/weight-record-response.dto';

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
    private readonly dogService: DogService,
    private readonly weightRecordService: WeightRecordService,
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
    });

    const calcResult = await this.dogService.calcPreview(dog.id);

    // Fetch breed for name mapping
    const breed = await this.dogBreedRepository.findById(dog.breedId);
    const breedMap = new Map(breed ? [[dog.breedId, breed.name]] : []);

    const response: DogDetailResponseDto = {
      profile: this.mapDogToProfileDto(dog, breedMap),
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

    // Try to calculate preview, but don't fail if calculation fails
    let calcResult = null;
    try {
      calcResult = await this.dogService.calcPreview(dog.id);
    } catch (error: any) {
      // Log the error but continue - allow updating dog profile even if calculation fails
      console.warn(`[DogsController] Failed to calculate preview for updated dog ${id}:`, error.message);
    }

    // Fetch breed for name mapping
    const breed = await this.dogBreedRepository.findById(dog.breedId);
    const breedMap = new Map(breed ? [[dog.breedId, breed.name]] : []);

    const response: DogDetailResponseDto = {
      profile: this.mapDogToProfileDto(dog, breedMap),
      calcResult,
    };

    return ApiResponseDto.success(response);
  }

  @Get('breeds')
  @ApiOperation({ summary: 'List all dog breeds' })
  @ApiResponse({
    status: 200,
    description: 'List of dog breeds',
  })
  async listBreeds(): Promise<ApiResponseDto<any[]>> {
    const breeds = await this.dogBreedRepository.findAll();
    const breedDtos = breeds.map((breed) => ({
      id: breed.id,
      name: breed.name,
      sizeCategory: breed.sizeCategory,
      adultAgeMonths: breed.adultAgeMonths,
      seniorAgeYears: breed.seniorAgeYears,
      averageAdultWeightKg: breed.averageAdultWeightKg,
    }));
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

    // Fetch all breeds for name mapping (performance optimization)
    const breeds = await this.dogBreedRepository.findAll();
    const breedMap = new Map(breeds.map(b => [b.id, b.name]));

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

    // Try to calculate preview, but don't fail if calculation fails
    let calcResult = null;
    try {
      calcResult = await this.dogService.calcPreview(dog.id);
    } catch (error: any) {
      // Log the error but continue - allow loading dog profile even if calculation fails
      console.warn(`[DogsController] Failed to calculate preview for dog ${id}:`, error.message);
    }

    // Fetch breed for name mapping
    const breed = await this.dogBreedRepository.findById(dog.breedId);
    const breedMap = new Map(breed ? [[dog.breedId, breed.name]] : []);

    const response: DogDetailResponseDto = {
      profile: this.mapDogToProfileDto(dog, breedMap),
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
      breed = await this.dogBreedRepository.findById(
        calcPreviewDto.breedId,
      );
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
      offset ? parseInt(offset.toString()) : undefined
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
  @ApiResponse({ status: 200, description: 'Weight record deleted successfully' })
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
  @ApiBody({ schema: { type: 'object', properties: { synced: { type: 'boolean' } } } })
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
      synced
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
      cachedTargetFoodKcal: dog.cachedTargetFoodKcal,
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
    description: 'Returns both kcal needs and gram amounts based on recipe energy density. Used for recipe order page.'
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
            rer: { type: 'number', description: 'Resting Energy Requirement (kcal/day)', example: 417.2 },
            totalDer: { type: 'number', description: 'Total Daily Energy Requirement (kcal/day)', example: 667.5 },
            finalFoodKcal: { type: 'number', description: 'Final food kcal needed (after treat deduction)', example: 647.5 },
            treatDeduction: { type: 'number', description: 'Treat calories deducted (kcal/day)', example: 20.0 },
            isTreatCapped: { type: 'boolean', description: 'Whether treat deduction hit 10% safety cap', example: false },
            dailyIntakeG: { type: 'number', description: 'Daily food intake in grams', example: 447 },
            perMealIntakeG: { type: 'number', description: 'Per-meal food intake in grams', example: 224 },
            mealsPerDay: { type: 'number', description: 'Number of meals per day', example: 2 },
            calcDetails: { type: 'object', description: 'Detailed calculation breakdown for display' }
          }
        }
      }
    }
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
      recipe.energyDensityKcalPerKg,  // ✅ Key: pass energy density for gram calculation
      breed,
      true  // includeDetails
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
      calcDetails: calcResult.calcDetails || {}
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
      throw new BadRequestException('Invalid file type. Only JPG, PNG, GIF, and WEBP are allowed');
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
      const result = await this.cosService.uploadImage(file, file.originalname, 'dogs/avatars');

      return ApiResponseDto.success(result);
    } catch (error) {
      console.error('[DogsController] Avatar upload failed:', error);
      throw new BadRequestException('Failed to upload avatar');
    }
  }
}
