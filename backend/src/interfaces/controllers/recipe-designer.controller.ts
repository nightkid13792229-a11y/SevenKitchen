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
import { OrderRecipeDesignService } from '../../application/recipe-designer/order-recipe-design.service';
import { OrderRecipeTemplateService } from '../../application/recipe-designer/order-recipe-template.service';
import { SupplementLabelExtractionService } from '../../application/recipe-designer/supplement-label-extraction.service';
import { TencentCosService } from '../../infrastructure/services/tencent-cos.service';
import { AuthGuard, CurrentUser, type RequestUser } from '../auth';
import { ApiResponseDto } from '../dto/common/response.dto';
import {
  AddRecipeDesignItemDto,
  AiDesignSuggestDto,
  AiNutritionPlanAcceptDto,
  AiNutritionPlanGenerateDto,
  BatchReorderDesignItemsDto,
  CreateOrderDesignFromTemplateDto,
  CreatePrivateRecipeSnapshotDto,
  CopyRecipeSeriesStageIngredientsDto,
  CreateRecipeDesignerSupplementOptionDto,
  CreateRecipeDesignDraftDto,
  CreateRecipeSeriesDto,
  CreateRecipeSeriesStageDraftDto,
  DeleteRecipeSeriesDto,
  ListRecipeDesignerIngredientOptionsDto,
  ListRecipeDesignerSeriesDto,
  ListRecipeTemplatesDto,
  PublishRecipeDesignDraftDto,
  RenameRecipeSeriesDto,
  ReorderRecipeDesignItemsDto,
  SetRecipeSeriesReferenceDogDto,
  UpdateDogDesignNotesDto,
  UpdateRecipeDesignItemOrderDto,
  UpdateRecipeDesignDraftDto,
  UpdateRecipeDesignPresentationDto,
  UpdateRecipeDesignItemDto,
  UpdateRecipeProductionStepsDto,
  UpdateRecipeSeriesReleaseSettingsDto,
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
    private readonly orderRecipeTemplateService: OrderRecipeTemplateService,
    private readonly orderRecipeDesignService: OrderRecipeDesignService,
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

  /**
   * 订单绑定食谱设计 · 模板搜索（2026-10-22）。
   *
   * 只允许内部设计角色（STAFF / ADMIN）访问：模板范围包含其他狗狗的
   * 私密定制食谱，顾客侧永远不可见。
   */
  @Get('recipe-templates')
  @UseGuards(StaffGuard)
  @ApiOperation({
    summary: 'Search recipes usable as order-bound recipe design templates',
  })
  async listRecipeTemplates(
    @Query() query: ListRecipeTemplatesDto,
  ): Promise<ApiResponseDto<any>> {
    const templates = await this.orderRecipeTemplateService.searchTemplates({
      keyword: query.keyword,
      kind: query.kind ?? 'ALL',
    });
    return ApiResponseDto.success(templates);
  }

  /**
   * 订单绑定食谱设计 · 模板阶段比较（2026-10-22）。
   *
   * 只做提示，不阻断：阶段不一致或模板未标注阶段时返回 warning。
   */
  @Get('orders/:orderId/design-template-stage')
  @UseGuards(StaffGuard)
  @ApiOperation({
    summary: 'Compare an order dog life stage with a template recipe',
  })
  async getOrderDesignTemplateStage(
    @Param('orderId') orderId: string,
    @Query('sourceRecipeId') sourceRecipeId: string,
  ): Promise<ApiResponseDto<any>> {
    const comparison =
      await this.orderRecipeTemplateService.compareOrderTemplateStage(
        orderId,
        sourceRecipeId,
      );
    return ApiResponseDto.success(comparison);
  }

  // ==================== 订单绑定食谱设计 · 工作台（2026-10-22 · Task 3） ====================

  /**
   * 订单设计工作台：订单 / 狗狗 / 份数 / 已就绪份数 + 槽位列表。
   *
   * 只给内部设计角色（StaffGuard）看；顾客侧永远不可见。
   */
  @Get('orders/:orderId/workspace')
  @UseGuards(StaffGuard)
  @ApiOperation({
    summary: 'Get the order-bound recipe design workspace',
  })
  async getOrderDesignWorkspace(
    @Param('orderId') orderId: string,
  ): Promise<ApiResponseDto<any>> {
    const workspace = await this.orderRecipeDesignService.getWorkspace(orderId);
    return ApiResponseDto.success(workspace);
  }

  /**
   * 从已有食谱模板创建一个订单绑定草稿。
   *
   * 复制模板原料；参考爱犬锁定为订单狗狗；阶段不一致只提示。
   */
  @Post('orders/:orderId/designs/from-template')
  @UseGuards(StaffGuard)
  @ApiOperation({
    summary: 'Create an order-bound design draft from a template recipe',
  })
  async createOrderDesignFromTemplate(
    @Param('orderId') orderId: string,
    @Body() dto: CreateOrderDesignFromTemplateDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const design = await this.orderRecipeDesignService.createFromTemplate(
      orderId,
      { sourceRecipeId: dto.sourceRecipeId, name: dto.name },
      user.userId,
    );
    return ApiResponseDto.success(design);
  }

  /** 创建一个空白订单绑定草稿（同一订单 N 份各自独立）。 */
  @Post('orders/:orderId/designs/blank')
  @UseGuards(StaffGuard)
  @ApiOperation({
    summary: 'Create a blank order-bound design draft',
  })
  async createBlankOrderDesign(
    @Param('orderId') orderId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const design = await this.orderRecipeDesignService.createBlank(
      orderId,
      user.userId,
    );
    return ApiResponseDto.success(design);
  }

  /**
   * 加入本单待提交仓库（生成私密食谱，不交付、不通知）。
   *
   * 权限沿用现有发布治理：员工可编辑，但只有管理员能操作「加入待提交」。
   */
  @Post('orders/:orderId/designs/:designId/ready')
  @UseGuards(StaffGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Stage an order-bound design draft as ready for final delivery',
  })
  async stageOrderDesign(
    @Param('orderId') orderId: string,
    @Param('designId') designId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const staged = await this.orderRecipeDesignService.stageDraft(
      orderId,
      designId,
      user.userId,
    );
    return ApiResponseDto.success(staged);
  }

  /** 移除一个尚未最终交付的槽位（EDITING / READY）。 */
  /**
   * 售后改稿：把已交付的这一份重新打开为可编辑槽位。
   * 只有管理员能操作，且售后必须已受理 / 处理中。
   */
  @Post('aftersales/:aftersaleId/reopen-design')
  @UseGuards(StaffGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Reopen a delivered design for aftersale revision',
  })
  async reopenAftersaleDesign(
    @Param('aftersaleId') aftersaleId: string,
    @Body('deliveryItemId') deliveryItemId: string | undefined,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.orderRecipeDesignService.reopenForAftersale({
      aftersaleId,
      deliveryItemId,
      operatorId: user.userId,
    });
    return ApiResponseDto.success(result);
  }

  @Delete('orders/:orderId/designs/:designId')
  @UseGuards(StaffGuard)
  @ApiOperation({
    summary: 'Remove an order-bound design slot',
  })
  async removeOrderDesign(
    @Param('orderId') orderId: string,
    @Param('designId') designId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    await this.orderRecipeDesignService.removeSlot(
      orderId,
      designId,
      user.userId,
    );
    return ApiResponseDto.success(null);
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

  /**
   * 产品线整系列发布（2026-10-22 · 两阶段发布）。
   *
   * 阶段发布只把配方写进系列仓库（Recipe.status=DRAFT）；
   * 这里返回「整系列能不能发布」的阻断项 / 提醒项，供后台发布弹窗直接展示。
   * 订单定制系列不适用，服务层返回 400。
   */
  @Get('series/:seriesId/release-readiness')
  @ApiOperation({
    summary: 'Get staged release readiness of a recipe series (CATALOG only)',
  })
  async getSeriesReleaseReadiness(
    @Param('seriesId') seriesId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const readiness =
      await this.recipeDesignerService.getSeriesReleaseReadiness(
        seriesId,
        toRecipeDesignerAccessContext(user),
      );
    return ApiResponseDto.success(readiness);
  }

  @Patch('series/:seriesId/release-settings')
  @UseGuards(StaffGuard)
  @ApiOperation({
    summary: 'Patch required life stages and presentation of a recipe series',
  })
  async updateSeriesReleaseSettings(
    @Param('seriesId') seriesId: string,
    @Body() dto: UpdateRecipeSeriesReleaseSettingsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const settings =
      await this.recipeDesignerService.updateSeriesReleaseSettings(
        seriesId,
        dto,
        toRecipeDesignerAccessContext(user),
      );
    return ApiResponseDto.success(settings);
  }

  @Post('series/:seriesId/release')
  @UseGuards(StaffGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary:
      'Release a whole recipe series after all required stages are ready',
  })
  async releaseSeries(
    @Param('seriesId') seriesId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.recipeDesignerService.releaseSeries(
      seriesId,
      toRecipeDesignerAccessContext(user),
    );
    return ApiResponseDto.success(result);
  }

  /**
   * 整系列下架（2026-10-22 · 重新发布）。
   *
   * 只把该系列所有 PUBLIC 食谱行改回 DRAFT，并把系列 businessStatus 设为
   * DRAFT；设计稿、版本历史都保留，所以之后还能重新发布。
   * 订单定制系列不适用，服务层复用发布接口的权限/系列校验（400 / 404）。
   */
  @Post('series/:seriesId/unpublish')
  @UseGuards(StaffGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Unpublish a whole recipe series (PUBLIC -> DRAFT)',
  })
  async unpublishSeries(
    @Param('seriesId') seriesId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.recipeDesignerService.unpublishSeries(
      seriesId,
      toRecipeDesignerAccessContext(user),
    );
    return ApiResponseDto.success(result);
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

  @Patch('drafts/:id/presentation')
  @ApiOperation({
    summary: 'Patch the product presentation fields of a draft',
  })
  async updateDraftPresentation(
    @Param('id') id: string,
    @Body() dto: UpdateRecipeDesignPresentationDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const presentation =
      await this.recipeDesignerService.updateDraftPresentation(
        id,
        dto,
        toRecipeDesignerAccessContext(user),
      );
    return ApiResponseDto.success(presentation);
  }

  @Get('drafts/:id/launch-readiness')
  @ApiOperation({
    summary:
      'Evaluate the shared launch gate (publish / order stage) of a draft',
  })
  async getDraftLaunchReadiness(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const readiness = await this.recipeDesignerService.getDraftLaunchReadiness(
      id,
      toRecipeDesignerAccessContext(user),
    );
    return ApiResponseDto.success(readiness);
  }

  @Post('drafts/:id/nutrition-report')
  @ApiOperation({
    summary: 'Generate and persist the latest nutrition report of a draft',
  })
  async generateDraftNutritionReport(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const report =
      await this.recipeDesignerService.generateDraftNutritionReport(
        id,
        toRecipeDesignerAccessContext(user),
      );
    return ApiResponseDto.success(report);
  }

  @Get('drafts/:id/nutrition-report')
  @ApiOperation({
    summary:
      'Get the latest persisted nutrition report (200 with report:null when none)',
  })
  async getDraftNutritionReport(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const report = await this.recipeDesignerService.getDraftNutritionReport(
      id,
      toRecipeDesignerAccessContext(user),
    );
    return ApiResponseDto.success(report);
  }

  @Get('drafts/:id/production-steps')
  @ApiOperation({ summary: 'Get structured production steps of a draft' })
  async getDraftProductionSteps(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.recipeDesignerService.getDraftProductionSteps(
      id,
      toRecipeDesignerAccessContext(user),
    );
    return ApiResponseDto.success(result);
  }

  @Patch('drafts/:id/production-steps')
  @ApiOperation({ summary: 'Replace structured production steps of a draft' })
  async updateDraftProductionSteps(
    @Param('id') id: string,
    @Body() dto: UpdateRecipeProductionStepsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.recipeDesignerService.updateDraftProductionSteps(
      id,
      dto,
      toRecipeDesignerAccessContext(user),
    );
    return ApiResponseDto.success(result);
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
    summary:
      'Revert an editable series stage draft to the latest official version',
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

  /**
   * 按**当前编辑内容**评估（2026-10-16 批次 5.3）。
   *
   * 与 `POST drafts/:id/assess` 的区别：那个按草稿 id 从库里读，
   * 这个收**客户端当前的 items** —— 后台编辑器算的是屏幕上还没保存的内容。
   *
   * 目标值（FEDIAF 标准）由后端按 scenario 取，客户端不用传。
   */
  @Post('assess-items')
  @ApiOperation({ summary: 'Assess the given items (unsaved editor content)' })
  async assessItems(
    @Body()
    body: {
      scenario: string;
      items: Array<{
        id: string;
        name: string;
        ingredientType?: string | null;
        weightG: number;
        nutritionProfile?: unknown;
      }>;
    },
  ) {
    const result = await this.recipeDesignerService.assessItems(
      body ?? { scenario: '', items: [] },
    );
    return ApiResponseDto.success(result);
  }

  @Post('assess-contributors')
  @ApiOperation({
    summary: 'Return ingredient contributors for one assessed nutrient',
  })
  async assessContributors(
    @Body()
    body: {
      scenario: string;
      nutrientKey: string;
      items: Array<{
        id: string;
        name: string;
        ingredientType?: string | null;
        weightG: number;
        nutritionProfile?: unknown;
      }>;
    },
  ) {
    const result = await this.recipeDesignerService.assessContributors(
      body ?? { scenario: '', nutrientKey: '', items: [] },
    );
    return ApiResponseDto.success(result);
  }

  @Get('drafts/:id/assessment-inputs')
  @ApiOperation({
    summary:
      'Return local assessment inputs (targets + item profiles) for a design draft',
  })
  async getDraftAssessmentInputs(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.recipeDesignerService.getDraftAssessmentInputs(
      id,
      toRecipeDesignerAccessContext(user),
    );
    return ApiResponseDto.success(result);
  }

  @Get('dogs/:dogId/design-insight')
  @UseGuards(StaffGuard)
  @ApiOperation({
    summary:
      'Return a dog dietary profile, design history ingredient summary and order summary',
  })
  async getDogDesignInsight(
    @Param('dogId') dogId: string,
    @CurrentUser() user: RequestUser,
    @Query('recentDays') recentDays?: string,
    @Query('draftId') draftId?: string,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.recipeDesignerService.getDogDesignInsight(
      dogId,
      toRecipeDesignerAccessContext(user),
      recentDays,
      draftId,
    );
    return ApiResponseDto.success(result);
  }

  @Patch('dogs/:dogId/design-notes')
  @UseGuards(StaffGuard)
  @ApiOperation({
    summary:
      'Maintain dog dietary design notes (allergies / picky / preferred / medical history)',
  })
  async updateDogDesignNotes(
    @Param('dogId') dogId: string,
    @Body() dto: UpdateDogDesignNotesDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.recipeDesignerService.updateDogDesignNotes(
      dogId,
      dto,
      toRecipeDesignerAccessContext(user),
    );
    return ApiResponseDto.success(result);
  }

  @Post('dogs/:dogId/design-insight/ai-suggest')
  @UseGuards(StaffGuard)
  @ApiOperation({
    summary:
      'Generate AI recipe design suggestions from a dog profile and design history',
  })
  async generateAiDesignSuggestions(
    @Param('dogId') dogId: string,
    @Body() dto: AiDesignSuggestDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.recipeDesignerService.generateAiDesignSuggestions(
      dogId,
      toRecipeDesignerAccessContext(user),
      dto.draftId,
    );
    return ApiResponseDto.success(result);
  }

  // ---------- AI 设计建议四步向导 ----------

  /** 步骤一：生成营养方案 */
  @Post('dogs/:dogId/design-insight/ai-nutrition-plan')
  @UseGuards(StaffGuard)
  @ApiOperation({
    summary:
      'Step 1: generate a nutrition plan with knowledge citations for a dog',
  })
  async generateAiNutritionPlan(
    @Param('dogId') dogId: string,
    @Body() dto: AiNutritionPlanGenerateDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.recipeDesignerService.generateAiNutritionPlan(
      dogId,
      dto.draftId,
      toRecipeDesignerAccessContext(user),
      dto.userNotes,
    );
    return ApiResponseDto.success(result);
  }

  /** 步骤一（共识）：认可 / 修改营养方案 */
  @Post('drafts/:draftId/ai/nutrition-plan/accept')
  @UseGuards(StaffGuard)
  @ApiOperation({
    summary: 'Accept or revise the nutrition plan for a draft',
  })
  async acceptAiNutritionPlan(
    @Param('draftId') draftId: string,
    @Body() dto: AiNutritionPlanAcceptDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.recipeDesignerService.acceptAiNutritionPlan(
      draftId,
      dto,
      toRecipeDesignerAccessContext(user),
    );
    return ApiResponseDto.success(result);
  }

  /** 步骤二：食材推荐 */
  @Post('drafts/:draftId/ai/ingredient-recommendation')
  @UseGuards(StaffGuard)
  @ApiOperation({
    summary:
      'Step 2: recommend ingredients based on the accepted nutrition plan',
  })
  async generateAiIngredientRecommendation(
    @Param('draftId') draftId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const result =
      await this.recipeDesignerService.generateAiIngredientRecommendation(
        draftId,
        toRecipeDesignerAccessContext(user),
      );
    return ApiResponseDto.success(result);
  }

  /** 步骤三：食谱审核 */
  @Post('drafts/:draftId/ai/review')
  @UseGuards(StaffGuard)
  @ApiOperation({
    summary:
      'Step 3: review the recipe against the plan, framework and diversity',
  })
  async reviewAiRecipe(
    @Param('draftId') draftId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.recipeDesignerService.reviewAiRecipe(
      draftId,
      toRecipeDesignerAccessContext(user),
    );
    return ApiResponseDto.success(result);
  }

  /** 步骤四：生成制作 SOP */
  @Post('drafts/:draftId/ai/sop')
  @UseGuards(StaffGuard)
  @ApiOperation({
    summary: 'Step 4: generate production and customer SOP for the draft',
  })
  async generateAiSop(
    @Param('draftId') draftId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.recipeDesignerService.generateAiSop(
      draftId,
      toRecipeDesignerAccessContext(user),
    );
    return ApiResponseDto.success(result);
  }

  /** 读取配方草稿上的 AI 设计数据 */
  @Get('drafts/:draftId/ai-design-data')
  @UseGuards(StaffGuard)
  @ApiOperation({
    summary:
      'Read persisted AI design data (plan / recommendations / reviews / SOP) of a draft',
  })
  async getAiDesignData(
    @Param('draftId') draftId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.recipeDesignerService.getAiDesignData(
      draftId,
      toRecipeDesignerAccessContext(user),
    );
    return ApiResponseDto.success(result);
  }

  @Patch('series/:seriesId/reference-dog')
  @UseGuards(StaffGuard)
  @ApiOperation({
    summary:
      'Set or clear the reference dog of an internal recipe design series',
  })
  async setSeriesReferenceDog(
    @Param('seriesId') seriesId: string,
    @Body() dto: SetRecipeSeriesReferenceDogDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.recipeDesignerService.setSeriesReferenceDog(
      seriesId,
      dto.referenceDogId,
      toRecipeDesignerAccessContext(user),
    );
    return ApiResponseDto.success(result);
  }

  @Post('items/batch-order')
  @UseGuards(StaffGuard)
  @ApiOperation({
    summary: 'Batch persist design item sort order',
  })
  async batchUpdateItemOrder(
    @Body() dto: BatchReorderDesignItemsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.recipeDesignerService.batchUpdateItemOrder(
      dto.order,
      toRecipeDesignerAccessContext(user),
    );
    return ApiResponseDto.success(result);
  }

  @Get('customer-access')
  @ApiOperation({
    summary:
      'Return whether the current customer has recipe design history (entry visibility)',
  })
  async getCustomerDesignerAccess(
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.recipeDesignerService.getCustomerDesignerAccess(
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
