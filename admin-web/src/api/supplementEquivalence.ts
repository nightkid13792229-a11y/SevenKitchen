/**
 * 补剂等价组管理 API（2026-10-26）
 */
import api from './index';

export type EquivalenceGroupStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'DISABLED';

export interface EquivalenceGroupSummary {
  id: string;
  code: string;
  name: string;
  nutrientKey: string;
  nutrientLabel: string;
  nutrientUnit: string;
  formCategory: string | null;
  status: EquivalenceGroupStatus;
  isActive: boolean;
  memberCount: number;
  usedByRecipeCount: number;
  updatedAt: string;
}

export interface EquivalenceGroupMember {
  id: string;
  name: string;
  brand: string | null;
  productModel: string | null;
  physicalForm: string | null;
  baseUnit: string;
  unitDisplayLabel: string | null;
  purchaseUnit: string;
  purchaseToBaseRatio: number;
  currentPricePerPurchaseUnit: string | number;
  supplementRetailEnabled: boolean;
  diyEnabled: boolean;
  equivalencePriority: number;
  concentration: { value: number; unit: string } | null;
  concentrationStatus: 'OK' | 'MISSING' | 'UNIT_MISMATCH';
  actualUnit: string | null;
}

export interface EquivalenceGroupAudit {
  id: string;
  action: string;
  changes: unknown;
  operatorId: string | null;
  operatorName: string | null;
  createdAt: string;
}

export interface EquivalenceGroupDetail {
  id: string;
  code: string;
  name: string;
  nutrientKey: string;
  nutrientLabel: string;
  nutrientUnit: string;
  formCategory: string | null;
  description: string | null;
  rationale: string | null;
  evidenceSummary: string | null;
  evidenceUrls: string[] | null;
  status: EquivalenceGroupStatus;
  isActive: boolean;
  sortOrder: number;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
  members: EquivalenceGroupMember[];
  memberCount: number;
  referenceIngredientId: string | null;
  usedByRecipeCount: number;
  approvalErrors: string[];
  canApprove: boolean;
  auditLogs: EquivalenceGroupAudit[];
}

export interface UngroupedIngredient {
  id: string;
  name: string;
  brand: string | null;
  productModel: string | null;
  physicalForm: string | null;
  baseUnit: string;
  unitDisplayLabel: string | null;
  purchaseUnit: string;
  diyEnabled: boolean;
  supplementRetailEnabled: boolean;
  _count?: { recipeItems: number };
}

export interface UpsertEquivalenceGroupPayload {
  code: string;
  name: string;
  nutrientKey: string;
  nutrientLabel: string;
  nutrientUnit: string;
  formCategory?: string | null;
  description?: string | null;
  rationale?: string | null;
  evidenceSummary?: string | null;
  evidenceUrls?: string[];
  sortOrder?: number;
}

export const supplementEquivalenceApi = {
  listGroups: (params: {
    status?: string;
    nutrientKey?: string;
    keyword?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: EquivalenceGroupSummary[]; total: number }> =>
    api.get('/admin/supplement-equivalence/groups', { params }),

  getGroup: (id: string): Promise<EquivalenceGroupDetail> =>
    api.get(`/admin/supplement-equivalence/groups/${id}`),

  createGroup: (
    data: UpsertEquivalenceGroupPayload,
  ): Promise<EquivalenceGroupDetail> =>
    api.post('/admin/supplement-equivalence/groups', data),

  updateGroup: (
    id: string,
    data: Partial<UpsertEquivalenceGroupPayload>,
  ): Promise<EquivalenceGroupDetail> =>
    api.patch(`/admin/supplement-equivalence/groups/${id}`, data),

  submitGroup: (id: string): Promise<EquivalenceGroupDetail> =>
    api.post(`/admin/supplement-equivalence/groups/${id}/submit`),

  reviewGroup: (
    id: string,
    data: { status: EquivalenceGroupStatus; reviewNote?: string },
  ): Promise<EquivalenceGroupDetail> =>
    api.post(`/admin/supplement-equivalence/groups/${id}/review`, data),

  addMembers: (
    id: string,
    ingredientIds: string[],
  ): Promise<EquivalenceGroupDetail> =>
    api.post(`/admin/supplement-equivalence/groups/${id}/members`, {
      ingredientIds,
    }),

  removeMember: (
    id: string,
    ingredientId: string,
  ): Promise<EquivalenceGroupDetail> =>
    api.delete(`/admin/supplement-equivalence/groups/${id}/members/${ingredientId}`),

  deleteGroup: (id: string): Promise<unknown> =>
    api.delete(`/admin/supplement-equivalence/groups/${id}`),

  listUngrouped: (keyword?: string): Promise<UngroupedIngredient[]> =>
    api.get('/admin/supplement-equivalence/ungrouped', {
      params: keyword ? { keyword } : {},
    }),

  assign: (
    ingredientIds: string[],
    groupId: string,
  ): Promise<{ moved: number; skipped: number }> =>
    api.post('/admin/supplement-equivalence/assign', {
      ingredientIds,
      groupId,
    }),

  summary: (): Promise<{
    total: number;
    approved: number;
    pending: number;
    draft: number;
    disabled: number;
    ungrouped: number;
    singleton: number;
  }> => api.get('/admin/supplement-equivalence/summary'),
};
