/**
 * User Domain Enums
 * These enums match the Prisma schema exactly.
 */

export enum UserRole {
  CUSTOMER = 'CUSTOMER',
  STAFF = 'STAFF',
  ADMIN = 'ADMIN',
}

export enum UserInteractionTargetType {
  RECIPE = 'RECIPE',
  ARTICLE = 'ARTICLE',
}

export enum UserInteractionAction {
  FAVORITE = 'FAVORITE',
  LIKE = 'LIKE',
  GENERATE_DIY = 'GENERATE_DIY',
  SHARE = 'SHARE',
}

