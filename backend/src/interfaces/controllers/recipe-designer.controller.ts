import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { RecipeDesignerService } from '../../application/recipe-designer/recipe-designer.service';
import { SupplementLabelExtractionService } from '../../application/recipe-designer/supplement-label-extraction.service';
import { TencentCosService } from '../../infrastructure/services/tencent-cos.service';
import { AuthGuard, CurrentUser, type RequestUser } from '../auth';
import { ApiResponseDto } from '../dto/common/response.dto';
import {
  AddRecipeDesignItemDto,
  CreatePrivateRecipeSnapshotDto,
  CopyRecipeSeriesStageIngredientsDto,
  CreateRecipeDesignerSupplementOptionDto,
  CreateRecipeDesignDraftDto,
  CreateRecipeSeriesDto,
  CreateRecipeSeriesStageDraftDto,
  DeleteRecipeSeriesDto,
  ListRecipeDesignerIngredientOptionsDto,
  ListRecipeDesignerSeriesDto,
  PublishRecipeDesignDraftDto,
  RenameRecipeSeriesDto,
  ReorderRecipeDesignItemsDto,
  UpdateRecipeDesignItemOrderDto,
  UpdateRecipeDesignDraftDto,
  UpdateRecipeDesignItemDto,
  UpdateRecipeDesignItemOrderDto,
} from '../dto/recipe-designer/recipe-designer.dto';
import { Roles, StaffGuard } from '../guards/role.guard';

const SUPPLEMENT_LABEL_MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const SUPPLEMENT_LABEL_ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);
const SUPPLEMENT_LABEL_ALLOWED_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
]);
const WECHAT_UPLOAD_FALLBACK_MIME_TYPES = new Set([
  'application/octet-stream',
  '',
]);

function toRecipeDesignerAccessContext(user: RequestUser) {
  const context = {
    userId: user.userId,
    role: user.role,
  };
  if (user.customerId && user.customerId !== user.userId) {
    return { ...context, customerId: user.customerId };
  }
  return context;
}

function supplementLabelFileFilter(
  _req: unknown,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
) {
  if (!isAllowedSupplementLabelUpload(file)) {
    callback(new BadRequestException('仅支持 JPG、PNG 或 WebP 图片'), false);
    return;
  }
  callback(null, true);
}

function isAllowedSupplementLabelUpload(file?: Express.Multer.File): boolean {
  if (!file) return false;
  const mimetype = file.mimetype || '';
  if (SUPPLEMENT_LABEL_ALLOWED_MIME_TYPES.has(mimetype)) {
    return true;
  }
  if (!WECHAT_UPLOAD_FALLBACK_MIME_TYPES.has(mimetype)) {
    return false;
  }
  const extension = file.originalname?.split('.').pop()?.toLowerCase() || '';
  return SUPPLEMENT_LABEL_ALLOWED_EXTENSIONS.has(extension);
}

@ApiTags('Recipe Designer')
@ApiBearerAuth()
@ApiSecurity('wechat-auth')
@Controller('api/v1/recipe-designer')
@UseGuards(AuthGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class RecipeDesignerController {
  constructor(
    private readonly recipeDesignerService: RecipeDesignerService,
    private readonly cosService: TencentCosService,
    private readonly supplementLabelExtractionService: SupplementLabelExtractionService,
  ) {}

  @Get('ingredient-options')
  @ApiOperation({
    summary: 'List standard ingredient options for recipe design',
  })
  async listIngredientOptions(
    @Query() query: ListRecipeDesignerIngredientOptionsDto,
  ): Promise<ApiResponseDto<any>> {
    const options =
      await this.recipeDesignerService.listIngredientOptions(query);
    return ApiResponseDto.success(options);
  }

  @Post('supplement-options')
  @UseGuards(StaffGuard)
  @ApiOperation({
    summary: 'Create a manual supplement option for recipe design',
  })
  async createSupplementOption(
    @Body() dto: CreateRecipeDesignerSupplementOptionDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const option = await this.recipeDesignerService.createSupplementOption(
      dto,
      user.userId,
    );
    return ApiResponseDto.success(option);
  }

  @Post('supplement-label/extract')
  @UseGuards(StaffGuard)
  @ApiOperation({
    summary: 'Upload a supplement label image and extract an AI prefill draft',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: SUPPLEMENT_LABEL_MAX_FILE_SIZE_BYTES },
      fileFilter: supplementLabelFileFilter,
    }),
  )
  async extractSupplementLabel(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    this.assertSupplementLabelFile(file);
    const upload = await this.cosService.uploadImage(
      file,
      file.originalname,
      'recipe-designer-supplement-labels',
    );
    const draft = await this.supplementLabelExtractionService.extractFromImage({
      imageUrl: upload.url,
      originalFilename: file.originalname,
      requestedBy: user.userId,
    });

    return ApiResponseDto.success({
      ...draft,
      imageUrl: upload.url,
      imageKey: upload.key,
    });
  }

  @Get('series')
  @ApiOperation({ summary: 'List recipe design series workbench cards' })
  async listSeries(
    @Query() query: ListRecipeDesignerSeriesDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const series = await this.recipeDesignerService.listSeries(
      toRecipeDesignerAccessContext(user),
      query,
    );
    return ApiResponseDto.success(series);
  }

  @Post('series')
  @ApiOperation({ summary: 'Create a recipe design series' })
  async createSeries(
    @Body() dto: CreateRecipeSeriesDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const series = await this.recipeDesignerService.createSeries(
      dto,
      toRecipeDesignerAccessContext(user),
    );
    return ApiResponseDto.success(series);
  }

  @Post('series/:seriesId/duplicate')
  @ApiOperation({
    summary: 'Duplicate a recipe design series as editable drafts',
  })
  async duplicateSeries(
    @Param('seriesId') seriesId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const series = await this.recipeDesignerService.duplicateSeries(
      seriesId,
      toRecipeDesignerAccessContext(user),
    );
    return ApiResponseDto.success(series);
  }

  @Patch('series/:seriesId')
  @ApiOperation({ summary: 'Rename a recipe design series' })
  async renameSeries(
    @Param('seriesId') seriesId: string,
    @Body() dto: RenameRecipeSeriesDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const series = await this.recipeDesignerService.renameSeries(
      seriesId,
      dto,
      toRecipeDesignerAccessContext(user),
    );
    return ApiResponseDto.success(series);
  }

  @Delete('series/:seriesId')
  @ApiOperation({ summary: 'Delete a recipe design series safely' })
  async deleteSeries(
    @Param('seriesId') seriesId: string,
    @Body() dto: DeleteRecipeSeriesDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const series = await this.recipeDesignerService.deleteSeries(
      seriesId,
      dto,
      toRecipeDesignerAccessContext(user),
    );
    return ApiResponseDto.success(series);
  }

  @Post('series/:seriesId/delete')
  @ApiOperation({ summary: 'Delete a recipe design series safely' })
  async deleteSeriesCommand(
    @Param('seriesId') seriesId: string,
    @Body() dto: DeleteRecipeSeriesDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const series = await this.recipeDesignerService.deleteSeries(
      seriesId,
      dto,
      toRecipeDesignerAccessContext(user),
    );
    return ApiResponseDto.success(series);
  }

  @Post('series/:seriesId/stage-drafts')
  @ApiOperation({ summary: 'Create or reuse a recipe series stage draft' })
  async createSeriesStageDraft(
    @Param('seriesId') seriesId: string,
    @Body() dto: CreateRecipeSeriesStageDraftDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const draft = await this.recipeDesignerService.createSeriesStageDraft(
      seriesId,
      dto,
      toRecipeDesignerAccessContext(user),
    );
    return ApiResponseDto.success(draft);
  }

  @Post('series/:seriesId/stages/:lifeStage/duplicate')
  @ApiOperation({
    summary: 'Duplicate one recipe series life stage as a new editable series',
  })
  async duplicateSeriesStage(
    @Param('seriesId') seriesId: string,
    @Param('lifeStage') lifeStage: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const series = await this.recipeDesignerService.duplicateSeriesStage(
      seriesId,
      lifeStage,
      toRecipeDesignerAccessContext(user),
    );
    return ApiResponseDto.success(series);
  }

  @Post('series/:seriesId/stages/:lifeStage/copy-ingredients')
  @ApiOperation({
    summary: 'Copy ingredients from another life stage into this stage draft',
  })
  async copySeriesStageIngredients(
    @Param('seriesId') seriesId: string,
    @Param('lifeStage') lifeStage: string,
    @Body() dto: CopyRecipeSeriesStageIngredientsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const draft = await this.recipeDesignerService.copySeriesStageIngredients(
      seriesId,
      lifeStage,
      dto,
      toRecipeDesignerAccessContext(user),
    );
    return ApiResponseDto.success(draft);
  }

  @Get('drafts')
  @ApiOperation({ summary: 'List recipe design drafts for current staff user' })
  async listDrafts(
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const drafts = await this.recipeDesignerService.listDrafts(
      toRecipeDesignerAccessContext(user),
    );
    return ApiResponseDto.success(drafts);
  }

  @Get('drafts/:id')
  @ApiOperation({ summary: 'Get one recipe design draft detail' })
  async getDraft(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const draft = await this.recipeDesignerService.getDraft(
      id,
      toRecipeDesignerAccessContext(user),
    );
    return ApiResponseDto.success(draft);
  }

  @Post('drafts/:id/private-recipe-snapshot')
  @ApiOperation({
    summary: 'Create or update a private recipe snapshot for order or DIY',
  })
  async createPrivateRecipeSnapshot(
    @Param('id') id: string,
    @Body() dto: CreatePrivateRecipeSnapshotDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const snapshot =
      await this.recipeDesignerService.createPrivateRecipeSnapshot(
        id,
        dto,
        toRecipeDesignerAccessContext(user),
      );
    return ApiResponseDto.success(snapshot);
  }

  @Post('drafts')
  @ApiOperation({ summary: 'Create a recipe design draft' })
  async createDraft(
    @Body() dto: CreateRecipeDesignDraftDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const draft = await this.recipeDesignerService.createDraft(
      dto,
      toRecipeDesignerAccessContext(user),
    );
    return ApiResponseDto.success(draft);
  }

  @Patch('drafts/:id')
  @ApiOperation({ summary: 'Update a recipe design draft' })
  async updateDraft(
    @Param('id') id: string,
    @Body() dto: UpdateRecipeDesignDraftDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const draft = await this.recipeDesignerService.updateDraft(
      id,
      dto,
      toRecipeDesignerAccessContext(user),
    );
    return ApiResponseDto.success(draft);
  }

  @Delete('drafts/:id')
  @ApiOperation({ summary: 'Delete an unpublished recipe design draft' })
  async deleteDraft(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const draft = await this.recipeDesignerService.deleteDraft(
      id,
      toRecipeDesignerAccessContext(user),
    );
    return ApiResponseDto.success(draft);
  }

  @Post('drafts/:id/items')
  @ApiOperation({ summary: 'Add a nutrition food item to a design draft' })
  async addItem(
    @Param('id') id: string,
    @Body() dto: AddRecipeDesignItemDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const item = await this.recipeDesignerService.addItem(
      id,
      dto,
      toRecipeDesignerAccessContext(user),
    );
    return ApiResponseDto.success(item);
  }

  @Patch('items/:itemId')
  @ApiOperation({ summary: 'Update a design recipe item' })
  async updateItem(
    @Param('itemId') itemId: string,
    @Body() dto: UpdateRecipeDesignItemDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const item = await this.recipeDesignerService.updateItem(
      itemId,
      dto,
      toRecipeDesignerAccessContext(user),
    );
    return ApiResponseDto.success(item);
  }

  @Patch('drafts/:id/items/reorder')
  @ApiOperation({ summary: 'Batch update design recipe item sort order' })
  async reorderItems(
    @Param('id') id: string,
    @Body() dto: ReorderRecipeDesignItemsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.recipeDesignerService.reorderItems(
      id,
      dto,
      toRecipeDesignerAccessContext(user),
    );
    return ApiResponseDto.success(result);
  }

  @Put('drafts/:id/item-order')
  @ApiOperation({
    summary: 'Replace the full item ordering for a design draft',
  })
  async updateItemOrder(
    @Param('id') id: string,
    @Body() dto: UpdateRecipeDesignItemOrderDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const items = await this.recipeDesignerService.updateItemOrder(
      id,
      dto.itemIds,
      toRecipeDesignerAccessContext(user),
    );
    return ApiResponseDto.success(items);
  }

  @Delete('items/:itemId')
  @ApiOperation({ summary: 'Remove a design recipe item' })
  async removeItem(
    @Param('itemId') itemId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const item = await this.recipeDesignerService.removeItem(
      itemId,
      toRecipeDesignerAccessContext(user),
    );
    return ApiResponseDto.success(item);
  }

  @Post('drafts/:id/assess')
  @ApiOperation({ summary: 'Assess a recipe design draft against FEDIAF 2025' })
  async assessDraft(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.recipeDesignerService.assessDraft(
      id,
      toRecipeDesignerAccessContext(user),
    );
    return ApiResponseDto.success(result);
  }

  @Post('drafts/:id/revisions')
  @UseGuards(StaffGuard)
  @ApiOperation({
    summary: 'Create an editable revision draft from a published recipe design',
  })
  async createRevisionDraft(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.recipeDesignerService.createRevisionDraft(
      id,
      toRecipeDesignerAccessContext(user),
    );
    return ApiResponseDto.success(result);
  }

  @Post('drafts/:id/revert-to-latest-official')
  @UseGuards(StaffGuard)
  @ApiOperation({
    summary: 'Revert an editable series stage draft to the latest official version',
  })
  async revertDraftToLatestOfficial(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.recipeDesignerService.revertDraftToLatestOfficial(
      id,
      toRecipeDesignerAccessContext(user),
    );
    return ApiResponseDto.success(result);
  }

  @Post('drafts/:id/publish')
  @UseGuards(StaffGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Publish a recipe design draft as a recipe' })
  async publishDraft(
    @Param('id') id: string,
    @Body() dto: PublishRecipeDesignDraftDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.recipeDesignerService.publishDraft(
      id,
      dto,
      toRecipeDesignerAccessContext(user),
    );
    return ApiResponseDto.success(result);
  }

  private assertSupplementLabelFile(file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('请上传补剂包装图片');
    }
    if (!isAllowedSupplementLabelUpload(file)) {
      throw new BadRequestException('仅支持 JPG、PNG 或 WebP 图片');
    }
  }
}
