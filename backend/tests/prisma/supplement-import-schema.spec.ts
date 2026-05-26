import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('supplement import prisma schema', () => {
  const schema = readFileSync(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');

  it('declares AgentConfig and SupplementImportDraft models', () => {
    expect(schema).toContain('model AgentConfig');
    expect(schema).toContain('model SupplementImportDraft');
    expect(schema).toContain('enum AgentType');
    expect(schema).toContain('SUPPLEMENT_IMPORT');
    expect(schema).toContain('@@unique([agentType])');
    expect(schema).toContain('@@index([status])');
    expect(schema).toContain('@@map("supplement_import_draft")');
  });
});
