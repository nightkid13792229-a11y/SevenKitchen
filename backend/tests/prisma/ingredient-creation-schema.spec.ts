import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('ingredient creation agent schema', () => {
  const schema = readFileSync(
    resolve(__dirname, '../../prisma/schema.prisma'),
    'utf-8',
  );

  it('declares task, message, draft, and draft profile models', () => {
    expect(schema).toContain('model IngredientCreationJob');
    expect(schema).toContain('model IngredientCreationMessage');
    expect(schema).toContain('model IngredientCreationDraft');
    expect(schema).toContain('model IngredientCreationDraftProfile');
  });

  it('declares status and role enums used by the draft workflow', () => {
    expect(schema).toContain('enum IngredientCreationJobStatus');
    expect(schema).toContain('WAITING_USER');
    expect(schema).toContain('READY_FOR_REVIEW');
    expect(schema).toContain('enum IngredientCreationMessageRole');
    expect(schema).toContain('enum IngredientCreationDraftProfileRole');
  });

  it('keeps drafts linked to the creating user and formal confirmation target', () => {
    expect(schema).toContain('createdBy                     String');
    expect(schema).toContain('confirmedIngredientId         String?');
    expect(schema).toContain('ingredient_creation_job');
    expect(schema).toContain('ingredient_creation_draft_profile');
  });
});
