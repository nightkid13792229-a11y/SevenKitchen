import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('ingredient import manifest assets', () => {
  it('documents source search evidence in the FOOD template and schema', () => {
    const schema = JSON.parse(
      readFileSync(
        resolve(
          __dirname,
          '../../../../skills/adding-standard-ingredients/assets/ingredient-import-manifest.schema.json',
        ),
        'utf8',
      ),
    );
    const template = JSON.parse(
      readFileSync(
        resolve(
          __dirname,
          '../../../../skills/adding-standard-ingredients/assets/ingredient-import-template.food.json',
        ),
        'utf8',
      ),
    );

    expect(schema.properties.sourceSearchLog).toEqual(
      expect.objectContaining({ type: 'array' }),
    );
    expect(template.sourceSearchLog).toEqual([]);
  });
});
