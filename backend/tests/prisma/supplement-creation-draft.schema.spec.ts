import { readFileSync } from 'fs';
import { join } from 'path';

const read = (...parts: string[]) =>
  readFileSync(join(__dirname, '../..', ...parts), 'utf8');

const modelBlock = (schema: string, name: string) => {
  const match = schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`));
  expect(match).not.toBeNull();
  return match?.[0] ?? '';
};

describe('supplement creation draft schema', () => {
  const schema = read('prisma/schema.prisma');
  const sql = read(
    'prisma/migrations/20261121230000_supplement_creation_draft/migration.sql',
  );

  it('adds the draft model and status enum', () => {
    expect(schema).toContain('model SupplementCreationDraft');
    expect(schema).toContain('enum SupplementCreationDraftStatus');
    const block = modelBlock(schema, 'SupplementCreationDraft');
    expect(block).toMatch(/status\s+SupplementCreationDraftStatus/);
    expect(block).toMatch(/payload\s+Json/);
    expect(block).toMatch(/manualFields\s+String\[\]/);
    expect(block).toMatch(/verification\s+Json\?/);
  });

  it('makes standing evidence serving size decimal', () => {
    const block = modelBlock(schema, 'SupplementLabelEvidence');
    expect(block).toMatch(/servingUnitsPerDose\s+Float/);
  });

  it('migration creates the table and alters the evidence column', () => {
    expect(sql).toContain('CREATE TABLE "supplement_creation_draft"');
    expect(sql).toContain(
      'ALTER COLUMN "serving_units_per_dose" TYPE DOUBLE PRECISION',
    );
  });
});
