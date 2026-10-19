import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { SupplementAftersaleService } from '../../application/supplement-shop/supplement-aftersale.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';

@ApiTags('Supplement Aftersales')
@Controller('api/v1/aftersales')
@UseGuards(AuthGuard)
export class SupplementAftersalesController {
  constructor(private readonly aftersaleService: SupplementAftersaleService) {}

  @Get(':id')
  @ApiSecurity('X-Customer-Id')
  @ApiOperation({ summary: '售后详情' })
  async detail(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return ApiResponseDto.success(
      await this.aftersaleService.getCase(user.userId, id),
    );
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiSecurity('X-Customer-Id')
  @ApiOperation({ summary: '顾客撤回待受理售后' })
  async cancel(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return ApiResponseDto.success(
      await this.aftersaleService.cancelByCustomer(user.userId, id),
    );
  }
}
