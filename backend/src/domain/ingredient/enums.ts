/**
 * Ingredient Domain Enums
 * These enums match the Prisma schema exactly.
 */

export enum IngredientType {
  FOOD = 'FOOD',
  SUPPLEMENT = 'SUPPLEMENT',
  PACKAGING = 'PACKAGING',
}

export enum IngredientProcurementStrategy {
  DAILY_PURCHASE = 'DAILY_PURCHASE',
  STOCK_REPLENISHMENT = 'STOCK_REPLENISHMENT',
  HYBRID = 'HYBRID',
}

export enum BaseUnit {
  G = 'G',
  ML = 'ML',
  PCS = 'PCS',
}

/**
 * Supplement Category Types
 * Used in SupplementProperties.category_type
 */
export enum SupplementCategoryType {
  MINERAL = 'MINERAL',
  VITAMIN = 'VITAMIN',
  AMINO_ACID = 'AMINO_ACID',
  FATTY_ACID = 'FATTY_ACID',
  PROBIOTIC = 'PROBIOTIC',
  FUNCTIONAL = 'FUNCTIONAL',
  OTHER = 'OTHER',
}
