import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard } from '../auth/auth.guard';
import { AdminGuard } from '../guards/role.guard';
import {
  CompareOffersDto,
  FormAdviceDto,
  type SupplementFormLevel,
} from '../dto/ingredient-creation/supplement-agent.dto';
import { SupplementOfferFetcherService } from '../../application/ingredient-creation/supplement-offer-fetcher.service';
import { SupplementFormAdviceService } from '../../application/ingredient-creation/supplement-form-advice.service';
import type { FormAdvice } from '../../domain/ingredient/supplement-form-advice';
import {
  rankOffers,
  recommendOffer,
  resolvePriceBasis,
  type PriceBasisRule,
  type RankedOffer,
} from '../../domain/ingredient/supplement-offer-ranking';

/** iHerb 是英文站，搜索词必须落英文；认不出的营养素就让前端传 keyword。 */
const NUTRIENT_EN: Record<string, string> = {
  'minerals.calcium': 'calcium',
  'minerals.phosphorus': 'phosphorus',
  'minerals.potassium': 'potassium',
  'minerals.sodium': 'sodium',
  'minerals.magnesium': 'magnesium',
  'minerals.iron': 'iron',
  'minerals.zinc': 'zinc',
  'minerals.copper': 'copper',
  'minerals.manganese': 'manganese',
  'minerals.selenium': 'selenium',
  'minerals.iodine': 'iodine',
  'vitamins.vitaminA': 'vitamin a',
  'vitamins.vitaminD': 'vitamin d3',
  'vitamins.vitaminE': 'vitamin e',
  'vitamins.vitaminC': 'vitamin c',
  'fattyAcids.epa': 'omega 3 fish oil',
  'fattyAcids.dha': 'omega 3 fish oil',
};

const FORM_LEVEL_EN: Record<SupplementFormLevel, string> = {
  ORGANIC_CHELATE: 'chelate',
  INORGANIC_SALT: 'sulfate',
  OXIDE: 'oxide',
  OTHER: '',
};

export interface CompareOffersView {
  offers: RankedOffer[];
  recommendedUrl: string | null;
  reason: string;
  basis: PriceBasisRule;
  failed: { url: string; name: string; reason: string }[];
  partial: boolean;
}

/**
 * 补剂三步里的机器动作。
 *
 * 与 `supplement-chat.controller.ts` 并列：那边是"问一句"，这边是"照着做"。
 * 这里只编排，不写业务判断——口径在 domain，抓取在 fetcher。
 */
@ApiTags('Admin Supplement Agent')
@ApiBearerAuth()
@Controller('api/v1/admin/ingredient-supplement-agent')
@UseGuards(AuthGuard, AdminGuard)
export class SupplementAgentController {
  constructor(
    private readonly fetcher: SupplementOfferFetcherService,
    private readonly formAdvice: SupplementFormAdviceService,
  ) {}

  @Post('form-advice')
  @ApiOperation({
    summary: '形态建议：读知识库原文，给出形态档位结论与出处；没有原文的条目不推荐',
  })
  async adviseForm(@Body() dto: FormAdviceDto): Promise<ApiResponseDto<FormAdvice>> {
    const advice = await this.formAdvice.advise({
      nutrientKey: dto.nutrientKey,
      nutrientLabel: dto.nutrientLabel,
      question: dto.question,
    });
    return new ApiResponseDto(0, 'Success', advice);
  }

  @Post('compare')
  @ApiOperation({
    summary: '补剂比价：一轮抓 iHerb 的商品，算每 1000 单位有效成分的价，排序并给推荐',
  })
  async compare(@Body() dto: CompareOffersDto): Promise<ApiResponseDto<CompareOffersView>> {
    const rule = resolvePriceBasis(dto.nutrientKey);
    const keyword = dto.keyword?.trim() || buildKeyword(dto.nutrientKey, dto.formLevel);

    const fetched = await this.fetcher.fetchOffers({
      keyword,
      limit: dto.limit ?? 8,
      nutrientKey: dto.nutrientKey,
      formLevel: dto.formLevel,
    });

    const offers = rankOffers(fetched.offers, dto.formLevel);
    const recommendation = recommendOffer(offers, rule);

    return new ApiResponseDto(0, 'Success', {
      offers,
      recommendedUrl: recommendation.url,
      reason: recommendation.reason,
      basis: rule,
      failed: fetched.failed,
      partial: fetched.partial,
    });
  }
}

function buildKeyword(nutrientKey: string, formLevel: SupplementFormLevel): string {
  const nutrient = NUTRIENT_EN[nutrientKey] ?? nutrientKey.split('.').pop() ?? nutrientKey;
  const form = FORM_LEVEL_EN[formLevel];
  return form ? `${nutrient} ${form}` : nutrient;
}
