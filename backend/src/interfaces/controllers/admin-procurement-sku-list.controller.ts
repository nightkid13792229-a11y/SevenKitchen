/**
 * 后台「原料管理 › 员工新增的采购商品」清单接口（2026-11-01）。
 *
 * 为什么单独一个控制器：现有 `ProcurementSkuController` 的路径挂在
 * `admin/ingredients/:ingredientId/procurement-skus`（必须指定原料），
 * 而这张清单要**跨原料**看，所以单开一条 `admin/procurement-skus`。
 */

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProcurementSkuService } from '../../application/ingredient/procurement-sku.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard } from '../auth/auth.guard';
import { AdminGuard } from '../guards/role.guard';
import { ProcurementSkuListQueryDto } from '../dto/admin/procurement-sku-list-query.dto';

@ApiTags('Admin Procurement Skus')
@UseGuards(AuthGuard, AdminGuard)
@Controller('api/v1/admin/procurement-skus')
export class AdminProcurementSkuListController {
  constructor(private readonly procurementSkuService: ProcurementSkuService) {}

  @Get()
  @ApiOperation({ summary: '员工新增的采购商品清单（跨原料，可分页筛选）' })
  async list(@Query() query: ProcurementSkuListQueryDto) {
    return ApiResponseDto.success(
      await this.procurementSkuService.listStaffCreated(query),
    );
  }
}
