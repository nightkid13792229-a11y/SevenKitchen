/**
 * Dogs Controller
 * Handles dog profile related endpoints
 */

import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  ValidationPipe,
  UsePipes,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiSecurity,
  ApiHeader,
} from '@nestjs/swagger';
import { DogService, DOG_REPOSITORY, DOG_BREED_REPOSITORY } from '../../application/dog/dog.service';
import type { DogRepository } from '../../domain/dog/dog.repository';
import type { DogBreedRepository } from '../../domain/dog/dog-breed.repository';
import { Inject } from '@nestjs/common';
import { CreateDogDto } from '../dto/dogs/create-dog.dto';
import { UpdateDogDto } from '../dto/dogs/update-dog.dto';
import { CalcPreviewDto } from '../dto/dogs/calc-preview.dto';
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

@ApiTags('Dogs')
@Controller('api/v1/dogs')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class DogsController {
  constructor(
    @Inject(DOG_REPOSITORY)
    private readonly dogRepository: DogRepository,
    @Inject(DOG_BREED_REPOSITORY)
    private readonly dogBreedRepository: DogBreedRepository,
    private readonly dogService: DogService,
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
    const calcResult = await this.dogService.calcPreview(dog.id);

    const response: DogDetailResponseDto = {
      profile: this.mapDogToProfileDto(dog),
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

    const profiles: DogProfileDto[] = dogs.map((dog) =>
      this.mapDogToProfileDto(dog),
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

    const calcResult = await this.dogService.calcPreview(dog.id);

    const response: DogDetailResponseDto = {
      profile: this.mapDogToProfileDto(dog),
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
  ): Promise<ApiResponseDto<DogCalcResultDto>> {
    // Load breed for calculation
    const breed = await this.dogBreedRepository.findById(
      calcPreviewDto.breedId,
    );
    if (!breed) {
      return ApiResponseDto.error(400, 'Breed not found');
    }

    // Create temporary dog entity for calculation (no database save needed)
    const tempDog = new Dog(
      'temp-calc-id',
      'temp-owner-id',
      'Temp',
      calcPreviewDto.breedId,
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
      null,
      0,
    );

    // Direct calculation without database save
    const calcResult = calculateDogEnergy(tempDog, undefined, breed);

    const result: DogCalcResultDto = {
      rer: calcResult.rer,
      totalDer: calcResult.der,
      finalFoodKcal: calcResult.finalFoodKcal,
      treatDeduction: calcResult.treatDeduction,
      isTreatCapped: calcResult.isTreatCapped,
      dailyIntakeG: calcResult.dailyIntakeG,
    };

    return ApiResponseDto.success(result);
  }

  private mapDogToProfileDto(dog: Dog): DogProfileDto {
    return {
      id: dog.id,
      ownerId: dog.ownerId,
      name: dog.name,
      breedId: dog.breedId,
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
}
