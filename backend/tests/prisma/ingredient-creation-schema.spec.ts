import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = resolve(__dirname, '../..');
const readProjectFile = (path: string) =>
  readFileSync(resolve(projectRoot, path), 'utf-8');
const existsInProject = (path: string) => existsSync(resolve(projectRoot, path));
const hasProjectEntries = (path: string) => {
  const absolutePath = resolve(projectRoot, path);
  return existsSync(absolutePath) && readdirSync(absolutePath).length > 0;
};

describe('removed ingredient creation backend surface', () => {
  const schema = readProjectFile('prisma/schema.prisma');
  const appModule = readProjectFile('src/app.module.ts');

  it('does not expose ingredient creation models, enums, or relation fields in Prisma schema', () => {
    expect(schema).not.toContain('IngredientCreationJobStatus');
    expect(schema).not.toContain('IngredientCreationMessageRole');
    expect(schema).not.toContain('IngredientCreationDraftStatus');
    expect(schema).not.toContain('IngredientCreationDraftProfileRole');
    expect(schema).not.toContain('model IngredientCreationJob');
    expect(schema).not.toContain('model IngredientCreationMessage');
    expect(schema).not.toContain('model IngredientCreationDraft');
    expect(schema).not.toContain('model IngredientCreationDraftProfile');
    expect(schema).not.toContain('ingredientCreationDraftProfiles');
    expect(schema).not.toContain('ingredient_creation_');
  });

  it('does not register ingredient creation controllers or services', () => {
    expect(appModule).not.toContain('IngredientCreationController');
    expect(appModule).not.toContain('IngredientCreationService');
    expect(appModule).not.toContain('IngredientCreationAgentService');
    expect(appModule).not.toContain('ingredient-creation');
  });

  it('keeps the backend source tree free of ingredient creation API files', () => {
    expect(hasProjectEntries('src/application/ingredient-creation')).toBe(false);
    expect(existsInProject('src/interfaces/controllers/ingredient-creation.controller.ts')).toBe(false);
    expect(existsInProject('src/interfaces/dto/ingredient-creation.dto.ts')).toBe(false);
    expect(hasProjectEntries('tests/application/ingredient-creation')).toBe(false);
    expect(existsInProject('tests/interfaces/controllers/ingredient-creation.controller.spec.ts')).toBe(false);
  });
});
