import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RecipeItemDto } from 'src/interfaces/dto/recipes/admin-recipe.dto';

describe('RecipeItemDto preparationMethod length', () => {
  it('accepts exactly 10 content characters and ignores separators', async () => {
    const dto = plainToInstance(RecipeItemDto, {
      ingredientId: 'ing-1',
      preparationMethod: '牛里脊/生/去皮切块丁丁',
    });

    await expect(validate(dto)).resolves.toEqual([]);
  });

  it('rejects more than 10 content characters even when the raw string is short', async () => {
    const dto = plainToInstance(RecipeItemDto, {
      ingredientId: 'ing-1',
      preparationMethod: '一二三四五六七八九十一',
    });

    await expect(validate(dto)).resolves.toEqual([
      expect.objectContaining({ property: 'preparationMethod' }),
    ]);
  });
});
