import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const schema = readFileSync(
  resolve(process.cwd(), 'prisma/schema.prisma'),
  'utf8',
);

const enumBlock = (enumName: string) => {
  const match = schema.match(new RegExp(`enum ${enumName} \\{[\\s\\S]*?\\n\\}`));

  expect(match).not.toBeNull();

  return match?.[0] ?? '';
};

const modelBlock = (modelName: string) => {
  const match = schema.match(new RegExp(`model ${modelName} \\{[\\s\\S]*?\\n\\}`));

  expect(match).not.toBeNull();

  return match?.[0] ?? '';
};

describe('search governance Prisma schema', () => {
  it('declares search governance domains', () => {
    expect(enumBlock('SearchGovernanceDomain')).toMatch(
      /INGREDIENT[\s\S]*NUTRITION_FOOD[\s\S]*BREED[\s\S]*ORDER/,
    );
  });

  it('declares alias suggestion statuses', () => {
    expect(enumBlock('SearchAliasSuggestionStatus')).toMatch(
      /PENDING[\s\S]*APPROVED[\s\S]*REJECTED[\s\S]*APPLIED[\s\S]*FAILED/,
    );
  });

  it('declares search governance models', () => {
    expect(modelBlock('SearchAliasGroup')).toContain(
      '@@map("search_alias_group")',
    );
    expect(modelBlock('SearchQueryLog')).toContain(
      '@@map("search_query_log")',
    );
    expect(modelBlock('SearchAliasSuggestion')).toContain(
      '@@map("search_alias_suggestion")',
    );
    expect(modelBlock('SearchAliasAuditLog')).toContain(
      '@@map("search_alias_audit_log")',
    );
  });

  it('maps query log fields to snake_case columns', () => {
    const block = modelBlock('SearchQueryLog');

    expect(block).toMatch(
      /rawQuery\s+String\s+@map\("raw_query"\)\s+@db\.VarChar\(300\)/,
    );
    expect(block).toMatch(
      /normalizedQuery\s+String\s+@map\("normalized_query"\)\s+@db\.VarChar\(300\)/,
    );
    expect(block).toMatch(
      /resultCount\s+Int\s+@default\(0\)\s+@map\("result_count"\)/,
    );
    expect(block).toMatch(
      /selectedEntityType\s+String\?\s+@map\("selected_entity_type"\)\s+@db\.VarChar\(80\)/,
    );
    expect(block).toMatch(
      /selectedEntityId\s+String\?\s+@map\("selected_entity_id"\)\s+@db\.VarChar\(120\)/,
    );
    expect(block).toMatch(
      /selectedEntityName\s+String\?\s+@map\("selected_entity_name"\)\s+@db\.VarChar\(300\)/,
    );
    expect(block).toMatch(
      /userId\s+String\?\s+@map\("user_id"\)\s+@db\.VarChar\(120\)/,
    );
  });

  it('maps alias audit suggestions to suggestion_id', () => {
    expect(modelBlock('SearchAliasAuditLog')).toMatch(
      /suggestionId\s+String\?\s+@map\("suggestion_id"\)/,
    );
  });
});
