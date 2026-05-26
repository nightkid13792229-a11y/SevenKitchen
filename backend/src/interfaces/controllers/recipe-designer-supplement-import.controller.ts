import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { SupplementImportService } from '../../application/supplement-import/supplement-import.service';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';
import { AdminGuard } from '../guards/role.guard';
import { ApiResponseDto } from '../dto/common/response.dto';
import {
  CreateSupplementImportDraftDto,
  UpdateSupplementImportDraftDto,
} from '../dto/supplement-import.dto';

@ApiTags('RecipeDesignerSupplementImport')
@Controller('api/v1/recipe-designer/supplement-import-drafts')
@UseGuards(AuthGuard, AdminGuard)
export class RecipeDesignerSupplementImportController {
  constructor(
    private readonly supplementImportService: SupplementImportService,
  ) {}

  @Post('images')
  @UseInterceptors(FilesInterceptor('files', 6))
  async uploadImages(
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: RequestUser,
  ) {
    const result = await this.supplementImportService.uploadImages(files, user);
    return ApiResponseDto.success(result);
  }

  @Post()
  async create(
    @Body() dto: CreateSupplementImportDraftDto,
    @CurrentUser() user: RequestUser,
  ) {
    const result = await this.supplementImportService.createDraft(dto, user);
    return ApiResponseDto.success(result);
  }

  @Get(':id')
  async get(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    const result = await this.supplementImportService.getDraft(id, user);
    return ApiResponseDto.success(result);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSupplementImportDraftDto,
    @CurrentUser() user: RequestUser,
  ) {
    const result = await this.supplementImportService.updateDraft(
      id,
      dto,
      user,
    );
    return ApiResponseDto.success(result);
  }

  @Post(':id/confirm')
  async confirm(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    const result = await this.supplementImportService.confirmDraft(id, user);
    return ApiResponseDto.success(result);
  }
}
