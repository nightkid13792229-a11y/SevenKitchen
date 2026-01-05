/**
 * CartItem Entity
 * Represents a single item in the shopping cart
 */

export class CartItem {
  constructor(
    public readonly id: string,
    public readonly cartId: string,
    public readonly dogId: string,
    public readonly recipeId: string,
    public readonly cycleDays: number,
    public readonly dailyIntakeG: number,
    public readonly totalGrams: number,
    public readonly packageCount: number,
    public readonly packageSpecG: number,
    public readonly unitPrice: number,
    public readonly totalPrice: number,
    public readonly preparationMethod: string | null,
    public readonly cookingMethod: string | null,
    public readonly createdAt: Date,
    // Computed fields (populated by service layer)
    public readonly dogName?: string,
    public readonly dogBreedName?: string,
    public readonly dogWeightKg?: number,
    public readonly recipeName?: string,
    public readonly recipeCoverImage?: string,
  ) {}
}
