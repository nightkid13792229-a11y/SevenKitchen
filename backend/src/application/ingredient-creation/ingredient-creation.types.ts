export interface IngredientCreationUserContext {
  userId: string;
  role: string;
}

export interface CreateIngredientCreationJobInput {
  requestText: string;
  userId: string;
}

export interface AddIngredientCreationMessageInput {
  content: string;
}

export interface UpdateIngredientCreationDraftInput {
  suggestedName?: string;
  unitDisplayLabel?: string | null;
  procurementStrategy?: 'DAILY_PURCHASE' | 'STOCK_REPLENISHMENT' | 'HYBRID';
  diyEnabled?: boolean;
  procurementEnabled?: boolean;
  notes?: string | null;
}

export interface UpdateIngredientCreationDraftProfileInput {
  role?: 'PRIMARY' | 'SECONDARY';
  suggestedDisplayNameZh?: string | null;
  preparationState?: string | null;
  preparationStateLabel?: string | null;
  ediblePortionLabel?: string | null;
  processingLabel?: string | null;
  agentRationale?: string | null;
  sortOrder?: number;
}
