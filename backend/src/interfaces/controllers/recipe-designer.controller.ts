import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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
  CreateRecipeDesignerSupplementOptionDto,
  CreateRecipeDesignDraftDto,
  ListRecipeDesignerIngredientOptionsDto,
  PublishRecipeDesignDraftDto,
  UpdateRecipeDesignDraftDto,
  UpdateRecipeDesignItemDto,
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
@UseGuards(AuthGuard, StaffGuard)
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

  @Get('drafts')
  @ApiOperation({ summary: 'List recipe design drafts for current staff user' })
  async listDrafts(
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const drafts = await this.recipeDesignerService.listDrafts(user.userId);
    return ApiResponseDto.success(drafts);
  }

  @Post('drafts')
  @ApiOperation({ summary: 'Create a recipe design draft' })
  async createDraft(
    @Body() dto: CreateRecipeDesignDraftDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const draft = await this.recipeDesignerService.createDraft(
      dto,
      user.userId,
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
      user.userId,
    );
    return ApiResponseDto.success(draft);
  }

  @Delete('drafts/:id')
  @ApiOperation({ summary: 'Delete an unpublished recipe design draft' })
  async deleteDraft(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const draft = await this.recipeDesignerService.deleteDraft(id, user.userId);
    return ApiResponseDto.success(draft);
  }

  @Post('drafts/:id/items')
  @ApiOperation({ summary: 'Add a nutrition food item to a design draft' })
  async addItem(
    @Param('id') id: string,
    @Body() dto: AddRecipeDesignItemDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const item = await this.recipeDesignerService.addItem(id, dto, user.userId);
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
      user.userId,
    );
    return ApiResponseDto.success(item);
  }

  @Delete('items/:itemId')
  @ApiOperation({ summary: 'Remove a design recipe item' })
  async removeItem(
    @Param('itemId') itemId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const item = await this.recipeDesignerService.removeItem(
      itemId,
      user.userId,
    );
    return ApiResponseDto.success(item);
  }

  @Post('drafts/:id/assess')
  @ApiOperation({ summary: 'Assess a recipe design draft against FEDIAF 2025' })
  async assessDraft(@Param('id') id: string): Promise<ApiResponseDto<any>> {
    const result = await this.recipeDesignerService.assessDraft(id);
    return ApiResponseDto.success(result);
  }

  @Post('drafts/:id/revisions')
  @ApiOperation({
    summary: 'Create an editable revision draft from a published recipe design',
  })
  async createRevisionDraft(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.recipeDesignerService.createRevisionDraft(
      id,
      user.userId,
    );
    return ApiResponseDto.success(result);
  }

  @Post('drafts/:id/publish')
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
      user.userId,
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
