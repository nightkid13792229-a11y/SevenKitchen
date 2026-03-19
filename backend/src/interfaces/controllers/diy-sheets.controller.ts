/**
 * DIY Sheets Controller
 * DIY制作单控制器
 */

import {
  Controller,
  Get,
  Post,
  Delete,
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
  ApiSecurity,
  ApiHeader,
} from '@nestjs/swagger';
import { DIYSheetStorageService } from '../../application/diy-sheet/diy-sheet-storage.service';
import { CreateDIYSheetDto, DIYSheetResponseDto } from '../dto/diy-sheets.dto';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';

@ApiTags('DIY Sheets')
@Controller('api/v1/user/diy-sheets')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class DIYSheetsController {
  constructor(private readonly diySheetService: DIYSheetStorageService) {}

  @Post()
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建DIY制作单' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiResponse({
    status: 201,
    description: 'DIY制作单创建成功',
    type: DIYSheetResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - X-Customer-Id header required',
  })
  async create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateDIYSheetDto,
  ): Promise<ApiResponseDto<DIYSheetResponseDto>> {
    const userId = user.customerId;
    const sheet = await this.diySheetService.create(userId, dto);

    return ApiResponseDto.success(sheet);
  }

  @Get()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: '获取当前用户的所有制作单' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: '制作单列表获取成功',
    type: [DIYSheetResponseDto],
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - X-Customer-Id header required',
  })
  async findAll(
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<DIYSheetResponseDto[]>> {
    const userId = user.customerId;
    const sheets = await this.diySheetService.findAllByUser(userId);

    return ApiResponseDto.success(sheets);
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除制作单' })
  @ApiSecurity('X-Customer-Id')
  @ApiParam({
    name: 'id',
    description: '制作单ID',
    example: 'uuid',
  })
  @ApiResponse({
    status: 204,
    description: '制作单删除成功',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - X-Customer-Id header required',
  })
  @ApiResponse({
    status: 404,
    description: '制作单不存在',
  })
  async delete(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<void> {
    const userId = user.customerId;
    await this.diySheetService.delete(id, userId);
  }
}
