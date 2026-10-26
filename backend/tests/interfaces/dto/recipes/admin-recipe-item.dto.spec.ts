import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RecipeItemDto } from 'src/interfaces/dto/recipes/admin-recipe.dto';

describe('RecipeItemDto preparationMethod length', () => {
  it('accepts exactly 100 characters', async () => {
    const dto = plainToInstance(RecipeItemDto, {
      ingredientId: 'ing-1',
      preparationMethod: 'x'.repeat(100),
    });

    await expect(validate(dto)).resolves.toEqual([]);
  });

  it('rejects more than 100 characters before it reaches VarChar(100)', async () => {
    const dto = plainToInstance(RecipeItemDto, {
      ingredientId: 'ing-1',
      preparationMethod: 'x'.repeat(101),
    });

    await expect(validate(dto)).resolves.toEqual([
      expect.objectContaining({ property: 'preparationMethod' }),
    ]);
  });
});
