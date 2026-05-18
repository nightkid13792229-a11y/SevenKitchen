import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { RecipeDesignerService } from '../../application/recipe-designer/recipe-designer.service';
import { AuthGuard, CurrentUser, type RequestUser } from '../auth';
import { ApiResponseDto } from '../dto/common/response.dto';
import {
  AddRecipeDesignItemDto,
  CreateRecipeDesignDraftDto,
  PublishRecipeDesignDraftDto,
  UpdateRecipeDesignDraftDto,
  UpdateRecipeDesignItemDto,
} from '../dto/recipe-designer/recipe-designer.dto';
import { StaffGuard } from '../guards/role.guard';

@ApiTags('Recipe Designer')
@ApiBearerAuth()
@ApiSecurity('wechat-auth')
@Controller('api/v1/recipe-designer')
@UseGuards(AuthGuard, StaffGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class RecipeDesignerController {
  constructor(private readonly recipeDesignerService: RecipeDesignerService) {}

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
    const draft = await this.recipeDesignerService.createDraft(dto, user.userId);
    return ApiResponseDto.success(draft);
  }

  @Patch('drafts/:id')
  @ApiOperation({ summary: 'Update a recipe design draft' })
  async updateDraft(
    @Param('id') id: string,
    @Body() dto: UpdateRecipeDesignDraftDto,
  ): Promise<ApiResponseDto<any>> {
    const draft = await this.recipeDesignerService.updateDraft(id, dto);
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
  ): Promise<ApiResponseDto<any>> {
    const item = await this.recipeDesignerService.addItem(id, dto);
    return ApiResponseDto.success(item);
  }

  @Patch('items/:itemId')
  @ApiOperation({ summary: 'Update a design recipe item' })
  async updateItem(
    @Param('itemId') itemId: string,
    @Body() dto: UpdateRecipeDesignItemDto,
  ): Promise<ApiResponseDto<any>> {
    const item = await this.recipeDesignerService.updateItem(itemId, dto);
    return ApiResponseDto.success(item);
  }

  @Delete('items/:itemId')
  @ApiOperation({ summary: 'Remove a design recipe item' })
  async removeItem(
    @Param('itemId') itemId: string,
  ): Promise<ApiResponseDto<any>> {
    const item = await this.recipeDesignerService.removeItem(itemId);
    return ApiResponseDto.success(item);
  }

  @Post('drafts/:id/assess')
  @ApiOperation({ summary: 'Assess a recipe design draft against FEDIAF 2025' })
  async assessDraft(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.recipeDesignerService.assessDraft(id);
    return ApiResponseDto.success(result);
  }

  @Post('drafts/:id/publish')
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
}
