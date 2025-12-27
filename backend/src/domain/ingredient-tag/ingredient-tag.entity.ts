/**
 * IngredientTag Domain Entity
 * Represents a tag/label for ingredient classification with hierarchical structure
 */

export class IngredientTag {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly description: string | null,
    public readonly parentId: string | null,
    public readonly sort: number,
    public readonly color: string | null,
  ) {
    this.validateInvariants();
  }

  /**
   * Validate domain invariants
   */
  private validateInvariants(): void {
    if (!this.name || this.name.trim().length === 0) {
      throw new Error('IngredientTag name cannot be empty');
    }

    if (this.name.length > 100) {
      throw new Error('IngredientTag name cannot exceed 100 characters');
    }

    if (this.sort < 0) {
      throw new Error('IngredientTag sort must be non-negative');
    }

    // Validate color format if provided (hex color)
    // Allow null, empty string, or valid hex color
    if (this.color && this.color.trim() && !this.color.match(/^#[0-9A-Fa-f]{6}$/)) {
      throw new Error('IngredientTag color must be a valid hex color code (e.g., #FFFFFF)');
    }

    // Prevent circular reference (parent cannot be self)
    if (this.parentId === this.id) {
      throw new Error('IngredientTag cannot be its own parent');
    }
  }

  /**
   * Check if this is a root tag (no parent)
   */
  isRoot(): boolean {
    return this.parentId === null;
  }

  /**
   * Check if this tag has children
   * Note: This requires repository access to check actual children
   */
  hasChildren(): boolean {
    // This is a placeholder - actual implementation requires repository
    return false;
  }
}
