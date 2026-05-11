/**
 * Nutrition Food Service
 * Business logic for nutrition food management
 */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import {
  Prisma,
  NutritionFood,
  NutritionFoodCategory,
  NutritionFoodStatus,
} from '@prisma/client';
import {
  CreateNutritionFoodDto,
  UpdateNutritionFoodDto,
  CreateNutritionFoodMappingDto,
  NutritionFoodResponseDto,
  NutritionFoodMappingResponseDto,
  USDAFoodSearchResultDto,
  PaginatedNutritionFoodResponseDto,
} from '../../interfaces/dto/nutrition-food/nutrition-food.dto';
import { mapUsdaNutrientsToNutritionProfile } from '../../domain/nutrition-governance/nutrition-governance.utils';

@Injectable()
export class NutritionFoodService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取营养原料列表（分页）
   */
  async findAll(params: {
    category?: NutritionFoodCategory;
    status?: NutritionFoodStatus;
    search?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedNutritionFoodResponseDto> {
    const page = params.page || 1;
    const pageSize = params.pageSize || 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.NutritionFoodWhereInput = {
      ...(params.category && { category: params.category }),
      ...(params.status && { status: params.status }),
      ...(params.search && {
        OR: [
          { name: { contains: params.search, mode: 'insensitive' } },
          { nameEn: { contains: params.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [total, items] = await Promise.all([
      this.prisma.nutritionFood.count({ where }),
      this.prisma.nutritionFood.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          mappings: {
            include: {
              ingredient: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  purchaseUnit: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      data: items.map(this.toResponseDto),
      total,
      page,
      pageSize,
      hasMore: skip + pageSize < total,
    };
  }

  /**
   * 获取单个营养原料详情
   */
  async findOne(id: string): Promise<NutritionFoodResponseDto | null> {
    const item = await this.prisma.nutritionFood.findUnique({
      where: { id },
      include: {
        mappings: {
          include: {
            ingredient: {
              select: {
                id: true,
                name: true,
                type: true,
                purchaseUnit: true,
              },
            },
          },
        },
      },
    });

    if (!item) {
      return null;
    }

    return this.toResponseDto(item);
  }

  /**
   * 创建营养原料
   */
  async create(
    dto: CreateNutritionFoodDto,
    userId?: string,
  ): Promise<NutritionFoodResponseDto> {
    // 检查是否已存在同名原料
    const existing = await this.prisma.nutritionFood.findFirst({
      where: {
        name: dto.name,
        dataSource: dto.dataSource,
      },
    });

    if (existing) {
      throw new BadRequestException(
        `营养原料 "${dto.name}" 已存在于数据源 "${dto.dataSource}"`,
      );
    }

    const item = await this.prisma.nutritionFood.create({
      data: {
        name: dto.name,
        nameEn: dto.nameEn,
        category: dto.category,
        dataSource: dto.dataSource,
        externalId: dto.externalId,
        nutritionData: dto.nutritionData as any,
        notes: dto.notes,
        createdBy: userId,
        status: NutritionFoodStatus.PENDING,
      },
      include: {
        mappings: true,
      },
    });

    return this.toResponseDto(item);
  }

  /**
   * 更新营养原料
   */
  async update(
    id: string,
    dto: UpdateNutritionFoodDto,
  ): Promise<NutritionFoodResponseDto> {
    const existing = await this.prisma.nutritionFood.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`营养原料 ${id} 不存在`);
    }

    const item = await this.prisma.nutritionFood.update({
      where: { id },
      data: {
        ...(dto.nameEn !== undefined && { nameEn: dto.nameEn }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.nutritionData !== undefined && {
          nutritionData: dto.nutritionData as any,
        }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
      include: {
        mappings: {
          include: {
            ingredient: {
              select: {
                id: true,
                name: true,
                type: true,
                purchaseUnit: true,
              },
            },
          },
        },
      },
    });

    return this.toResponseDto(item);
  }

  /**
   * 删除营养原料
   */
  async remove(id: string): Promise<void> {
    const existing = await this.prisma.nutritionFood.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`营养原料 ${id} 不存在`);
    }

    await this.prisma.nutritionFood.delete({
      where: { id },
    });
  }

  /**
   * 验证营养原料
   */
  async verify(id: string, userId: string): Promise<NutritionFoodResponseDto> {
    const existing = await this.prisma.nutritionFood.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`营养原料 ${id} 不存在`);
    }

    const item = await this.prisma.nutritionFood.update({
      where: { id },
      data: {
        status: NutritionFoodStatus.VERIFIED,
        verifiedBy: userId,
        verifiedAt: new Date(),
      },
      include: {
        mappings: true,
      },
    });

    return this.toResponseDto(item);
  }

  /**
   * 废弃营养原料
   */
  async deprecate(id: string): Promise<NutritionFoodResponseDto> {
    const existing = await this.prisma.nutritionFood.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`营养原料 ${id} 不存在`);
    }

    const item = await this.prisma.nutritionFood.update({
      where: { id },
      data: {
        status: NutritionFoodStatus.DEPRECATED,
      },
      include: {
        mappings: true,
      },
    });

    return this.toResponseDto(item);
  }

  /**
   * 创建营养原料与采购原料的映射
   */
  async createMapping(
    nutritionFoodId: string,
    dto: CreateNutritionFoodMappingDto,
  ): Promise<NutritionFoodMappingResponseDto> {
    // 检查营养原料是否存在
    const nutritionFood = await this.prisma.nutritionFood.findUnique({
      where: { id: nutritionFoodId },
    });

    if (!nutritionFood) {
      throw new NotFoundException(`营养原料 ${nutritionFoodId} 不存在`);
    }

    // 检查采购原料是否存在
    const ingredient = await this.prisma.ingredient.findUnique({
      where: { id: dto.ingredientId },
    });

    if (!ingredient) {
      throw new NotFoundException(`采购原料 ${dto.ingredientId} 不存在`);
    }

    // 检查映射是否已存在
    const existingMapping = await this.prisma.nutritionFoodMapping.findUnique({
      where: {
        nutritionFoodId_ingredientId: {
          nutritionFoodId,
          ingredientId: dto.ingredientId,
        },
      },
    });

    if (existingMapping) {
      throw new BadRequestException('该映射关系已存在');
    }

    // 如果设置为主要映射，先取消其他主要映射
    if (dto.isPrimary) {
      await this.prisma.nutritionFoodMapping.updateMany({
        where: { nutritionFoodId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const mapping = await this.prisma.nutritionFoodMapping.create({
      data: {
        nutritionFoodId,
        ingredientId: dto.ingredientId,
        yieldRate: dto.yieldRate || 1.0,
        isPrimary: dto.isPrimary || false,
        notes: dto.notes,
      },
      include: {
        ingredient: {
          select: {
            id: true,
            name: true,
            type: true,
            purchaseUnit: true,
          },
        },
      },
    });

    return {
      id: mapping.id,
      nutritionFoodId: mapping.nutritionFoodId,
      ingredientId: mapping.ingredientId,
      yieldRate: mapping.yieldRate,
      isPrimary: mapping.isPrimary,
      notes: mapping.notes ?? undefined,
      ingredient: mapping.ingredient,
    };
  }

  /**
   * 删除映射
   */
  async removeMapping(
    nutritionFoodId: string,
    ingredientId: string,
  ): Promise<void> {
    await this.prisma.nutritionFoodMapping.delete({
      where: {
        nutritionFoodId_ingredientId: {
          nutritionFoodId,
          ingredientId,
        },
      },
    });
  }

  /**
   * 从USDA数据库搜索食材
   */
  async searchUSDA(query: string): Promise<USDAFoodSearchResultDto[]> {
    const apiKey = process.env.USDA_API_KEY;

    if (!apiKey) {
      throw new BadRequestException('USDA API密钥未配置');
    }

    try {
      const response = await fetch(
        `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}&query=${encodeURIComponent(query)}&pageSize=25&dataType=Foundation,SR Legacy`,
        {
          headers: {
            Accept: 'application/json',
          },
        },
      );

      if (!response.ok) {
        throw new BadRequestException('USDA API请求失败');
      }

      const data = await response.json();

      return (data.foods || []).map(
        (food: any): USDAFoodSearchResultDto => ({
          fdcId: food.fdcId?.toString() || '',
          description: food.description || '',
          scientificName: food.scientificName || undefined,
          dataType: food.dataType || '',
          foodCategory: food.foodCategory || undefined,
          brandOwner: food.brandOwner || undefined,
        }),
      );
    } catch (error) {
      console.error('USDA API error:', error);
      throw new BadRequestException(
        `USDA搜索失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * 从USDA导入营养数据
   */
  async importFromUSDA(
    fdcId: string,
    name: string,
    category: NutritionFoodCategory,
    userId?: string,
  ): Promise<NutritionFoodResponseDto> {
    const apiKey = process.env.USDA_API_KEY;

    if (!apiKey) {
      throw new BadRequestException('USDA API密钥未配置');
    }

    try {
      // 获取详细的营养数据
      const response = await fetch(
        `https://api.nal.usda.gov/fdc/v1/food/${fdcId}?api_key=${apiKey}`,
        {
          headers: {
            Accept: 'application/json',
          },
        },
      );

      if (!response.ok) {
        throw new BadRequestException('USDA API请求失败');
      }

      const food = await response.json();

      // New USDA imports use the structured governance mapping so source units
      // and conversion evidence are retained for later confirmation.
      const nutritionData = mapUsdaNutrientsToNutritionProfile(
        food.foodNutrients || [],
      );
      nutritionData.meta.externalId = String(food.fdcId ?? fdcId);
      nutritionData.meta.sourceTitle = food.description ?? name;

      // 创建营养原料
      const item = await this.prisma.nutritionFood.create({
        data: {
          name,
          category,
          dataSource: 'USDA',
          externalId: fdcId,
          nutritionData: nutritionData as any,
          createdBy: userId,
          status: NutritionFoodStatus.PENDING,
        },
        include: {
          mappings: true,
        },
      });

      return this.toResponseDto(item);
    } catch (error) {
      console.error('USDA import error:', error);
      throw new BadRequestException(
        `USDA导入失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Legacy flat USDA parser retained only for historical payload
   * compatibility. New imports must use mapUsdaNutrientsToNutritionProfile().
   */
  private parseUSDANutrients(nutrients: any[]): Record<string, number> {
    const result: Record<string, number> = {};

    // USDA营养素ID映射
    const nutrientMap: Record<number, string> = {
      1003: 'protein_g', // Protein
      1004: 'fat_g', // Total lipid (fat)
      1005: 'carbs_g', // Carbohydrate, by difference
      1079: 'fiber_g', // Fiber, total dietary
      1008: 'energy_kcal', // Energy
      1092: 'sodium_mg', // Sodium, Na
      1093: 'potassium_mg', // Potassium, K
      1087: 'calcium_mg', // Calcium, Ca
      1091: 'phosphorus_mg', // Phosphorus, P
      1090: 'magnesium_mg', // Magnesium, Mg
      1089: 'iron_mg', // Iron, Fe
      1095: 'zinc_mg', // Zinc, Zn
      1098: 'copper_mg', // Copper, Cu
      1102: 'manganese_mg', // Manganese, Mn
      1106: 'selenium_mcg', // Selenium, Se
      1103: 'iodine_mcg', // Iodine, I
      1104: 'vitamin_a_iu', // Vitamin A, IU
      1114: 'vitamin_d3_iu', // Vitamin D (D2 + D3)
      1109: 'vitamin_e_iu', // Vitamin E (alpha-tocopherol)
      1165: 'vitamin_b1_mg', // Thiamin
      1166: 'vitamin_b2_mg', // Riboflavin
      1167: 'vitamin_b3_mg', // Niacin
      1170: 'vitamin_b5_mg', // Pantothenic acid
      1175: 'vitamin_b6_mg', // Vitamin B-6
      1178: 'vitamin_b12_mcg', // Vitamin B-12
      1213: 'folate_mcg', // Folate, total
      1180: 'choline_mg', // Choline, total
    };

    for (const nutrient of nutrients) {
      const nutrientId = nutrient.nutrient?.id;
      const amount = nutrient.amount;

      if (nutrientId && amount !== undefined && nutrientMap[nutrientId]) {
        result[nutrientMap[nutrientId]] = amount;
      }
    }

    return result;
  }

  /**
   * 转换为响应DTO
   */
  private toResponseDto(item: any): NutritionFoodResponseDto {
    return {
      id: item.id,
      name: item.name,
      nameEn: item.nameEn ?? undefined,
      category: item.category,
      dataSource: item.dataSource,
      externalId: item.externalId ?? undefined,
      version: item.version,
      status: item.status,
      nutritionData: item.nutritionData,
      notes: item.notes ?? undefined,
      createdBy: item.createdBy ?? undefined,
      verifiedBy: item.verifiedBy ?? undefined,
      verifiedAt: item.verifiedAt ?? undefined,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      mappings: item.mappings?.map(
        (m: any): NutritionFoodMappingResponseDto => ({
          id: m.id,
          nutritionFoodId: m.nutritionFoodId,
          ingredientId: m.ingredientId,
          yieldRate: m.yieldRate,
          isPrimary: m.isPrimary,
          notes: m.notes ?? undefined,
          ingredient: m.ingredient,
        }),
      ),
    };
  }
}
