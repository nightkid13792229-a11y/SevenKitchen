/**
 * Recipe API
 * API layer for recipe management
 */

import request from './index';
import type {
  RecipeSummary,
  RecipeDetail,
  RecipeForm,
  RecipeQuery,
  RecipeListResponse,
  IngredientPreparationMethodHistoryItem,
} from '../types/recipe';

/**
 * Recipe API
 */
export const recipeApi = {
  /**
   * Get recipe list with filters and pagination
   */
  list: (params: RecipeQuery) => {
    return request.get<RecipeListResponse>('/admin/recipes', { params });
  },

  /**
   * Get recipe detail by ID
   */
  getDetail: (id: string) => {
    return request.get<RecipeDetail>(`/admin/recipes/${id}`);
  },

  /**
   * Create new recipe
   */
  create: (data: RecipeForm) => {
    return request.post<RecipeDetail>('/admin/recipes', data);
  },

  /**
   * Update recipe (creates new version)
   */
  update: (id: string, data: Partial<RecipeForm>) => {
    return request.put<RecipeDetail>(`/admin/recipes/${id}`, data);
  },

  /**
   * Delete recipe (DRAFT only)
   */
  delete: (id: string) => {
    return request.delete(`/admin/recipes/${id}`);
  },

  /**
   * Publish recipe (DRAFT -> PUBLIC)
   */
  publish: (id: string) => {
    return request.post<RecipeDetail>(`/admin/recipes/${id}/publish`);
  },

  /**
   * Unpublish recipe (PUBLIC -> DRAFT)
   */
  unpublish: (id: string) => {
    return request.post<RecipeDetail>(`/admin/recipes/${id}/unpublish`);
  },

  /**
   * Duplicate recipe (create new recipe with new ID)
   */
  duplicate: (id: string) => {
    return request.post<RecipeDetail>(`/admin/recipes/${id}/duplicate`);
  },

  /**
   * Get recipe version history
   */
  getVersions: (id: string) => {
    return request.get<RecipeSummary[]>(`/admin/recipes/${id}/versions`);
  },

  /**
   * Get recipe sales statistics
   */
  getSalesStats: (id: string) => {
    return request.get<{
      salesCount: number;
      diyGenCount: number;
      likeCount: number;
      favoriteCount: number;
    }>(`/admin/recipes/${id}/sales-stats`);
  },

  /**
   * Get ingredient preparation method history
   */
  getIngredientPreparationMethodHistory: (ingredientId: string) => {
    return request.get<IngredientPreparationMethodHistoryItem[]>(
      `/admin/ingredients/${ingredientId}/preparation-method-history`,
    );
  },

  /**
   * Upload recipe image to Tencent COS
   */
  uploadImage: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    return request.post<{
      url: string;
      key: string;
    }>('/admin/recipes/upload-image', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  /**
   * Delete recipe image from Tencent COS
   */
  deleteImage: async (key: string) => {
    return request.delete('/admin/recipes/delete-image', { data: { key } });
  },

  /**
   * Get life stage enum options
   */
  getLifeStages: () => {
    return request.get<Array<{ value: string; label: string }>>(
      '/admin/recipes/metadata/life-stages'
    );
  },

  /**
   * Get health tag enum options
   */
  getHealthTags: () => {
    return request.get<Array<{ value: string; label: string }>>(
      '/admin/recipes/metadata/health-tags'
    );
  },

  /**
   * Get all design sources
   */
  getDesignSources: () => {
    return request.get<Array<{ id: string; name: string; isActive: boolean }>>(
      '/admin/design-sources'
    );
  },

  /**
   * Create new design source
   */
  createDesignSource: (data: { name: string }) => {
    return request.post('/admin/design-sources', data);
  },

  /**
   * Update design source
   */
  updateDesignSource: (id: string, data: { name?: string; isActive?: boolean }) => {
    return request.patch(`/admin/design-sources/${id}`, data);
  },

  /**
   * Delete design source (soft delete)
   */
  deleteDesignSource: (id: string) => {
    return request.delete(`/admin/design-sources/${id}`);
  },
};
