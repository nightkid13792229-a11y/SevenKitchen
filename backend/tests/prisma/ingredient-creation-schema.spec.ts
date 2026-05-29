import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('ingredient creation agent schema', () => {
  const schema = readFileSync(
    resolve(__dirname, '../../prisma/schema.prisma'),
    'utf-8',
  );

  const extractBlock = (kind: 'enum' | 'model', name: string) => {
    const match = schema.match(
      new RegExp(`${kind}\\s+${name}\\s+\\{([\\s\\S]*?)\\n\\}`, 'u'),
    );

    expect(match).not.toBeNull();
    return match?.[1] ?? '';
  };

  const enumValues = (name: string) =>
    extractBlock('enum', name)
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/u, '').trim())
      .filter(Boolean);

  it('declares status and role enums used by the draft workflow', () => {
    expect(enumValues('IngredientCreationJobStatus')).toEqual(
      expect.arrayContaining([
        'DRAFTING',
        'SEARCHING_SOURCES',
        'WAITING_USER',
        'BUILDING_REPORT',
        'READY_FOR_REVIEW',
        'CONFIRMED',
        'FAILED',
        'CANCELED',
      ]),
    );
    expect(enumValues('IngredientCreationMessageRole')).toEqual(
      expect.arrayContaining(['USER', 'AGENT', 'PROGRESS', 'QUESTION', 'SYSTEM']),
    );
    expect(enumValues('IngredientCreationDraftStatus')).toEqual(
      expect.arrayContaining(['DRAFT', 'READY_FOR_REVIEW', 'CONFIRMED', 'REJECTED']),
    );
    expect(enumValues('IngredientCreationDraftProfileRole')).toEqual(
      expect.arrayContaining(['PRIMARY', 'SECONDARY']),
    );
  });

  it('declares task fields, indexes, messages, draft, and table mapping', () => {
    const job = extractBlock('model', 'IngredientCreationJob');

    expect(job).toMatch(/createdBy\s+String\s+@map\("created_by"\)/u);
    expect(job).toMatch(
      /status\s+IngredientCreationJobStatus\s+@default\(DRAFTING\)\s+@map\("status"\)/u,
    );
    expect(job).toMatch(/messages\s+IngredientCreationMessage\[\]/u);
    expect(job).toMatch(/draft\s+IngredientCreationDraft\?/u);
    expect(job).toContain('@@index([createdBy])');
    expect(job).toContain('@@index([status])');
    expect(job).toContain('@@index([createdAt])');
    expect(job).toContain('@@map("ingredient_creation_job")');
  });

  it('links messages to jobs with cascade deletion and expected indexes', () => {
    const message = extractBlock('model', 'IngredientCreationMessage');

    expect(message).toMatch(/jobId\s+String\s+@map\("job_id"\)/u);
    expect(message).toMatch(/role\s+IngredientCreationMessageRole\s+@map\("role"\)/u);
    expect(message).toMatch(
      /job\s+IngredientCreationJob\s+@relation\(fields:\s+\[jobId\],\s+references:\s+\[id\],\s+onDelete:\s+Cascade\)/u,
    );
    expect(message).toContain('@@index([jobId])');
    expect(message).toContain('@@index([role])');
    expect(message).toContain('@@index([createdAt])');
    expect(message).toContain('@@map("ingredient_creation_message")');
  });

  it('declares reviewable drafts with one draft per job and confirmation target mapping', () => {
    const draft = extractBlock('model', 'IngredientCreationDraft');

    expect(draft).toMatch(/jobId\s+String\s+@unique\s+@map\("job_id"\)/u);
    expect(draft).toMatch(
      /status\s+IngredientCreationDraftStatus\s+@default\(DRAFT\)\s+@map\("status"\)/u,
    );
    expect(draft).toMatch(/confirmedIngredientId\s+String\?\s+@map\("confirmed_ingredient_id"\)/u);
    expect(draft).toMatch(
      /job\s+IngredientCreationJob\s+@relation\(fields:\s+\[jobId\],\s+references:\s+\[id\],\s+onDelete:\s+Cascade\)/u,
    );
    expect(draft).toMatch(/profiles\s+IngredientCreationDraftProfile\[\]/u);
    expect(draft).toContain('@@index([status])');
    expect(draft).toContain('@@index([suggestedName])');
    expect(draft).toContain('@@index([confirmedIngredientId])');
    expect(draft).toContain('@@map("ingredient_creation_draft")');
  });

  it('links draft profiles to drafts and optional source records with expected indexes', () => {
    const profile = extractBlock('model', 'IngredientCreationDraftProfile');

    expect(profile).toMatch(/draftId\s+String\s+@map\("draft_id"\)/u);
    expect(profile).toMatch(/role\s+IngredientCreationDraftProfileRole\s+@map\("role"\)/u);
    expect(profile).toMatch(/sourceRecordId\s+String\?\s+@map\("source_record_id"\)/u);
    expect(profile).toMatch(
      /draft\s+IngredientCreationDraft\s+@relation\(fields:\s+\[draftId\],\s+references:\s+\[id\],\s+onDelete:\s+Cascade\)/u,
    );
    expect(profile).toMatch(
      /sourceRecord\s+NutritionSourceRecord\?\s+@relation\(fields:\s+\[sourceRecordId\],\s+references:\s+\[id\],\s+onDelete:\s+SetNull\)/u,
    );
    expect(profile).toContain('@@index([draftId])');
    expect(profile).toContain('@@index([sourceRecordId])');
    expect(profile).toContain('@@index([sourceType])');
    expect(profile).toContain('@@index([role])');
    expect(profile).toContain('@@map("ingredient_creation_draft_profile")');
  });

  it('keeps nutrition source records aware of ingredient creation draft profiles', () => {
    const sourceRecord = extractBlock('model', 'NutritionSourceRecord');

    expect(sourceRecord).toMatch(
      /ingredientCreationDraftProfiles\s+IngredientCreationDraftProfile\[\]/u,
    );
  });
});
