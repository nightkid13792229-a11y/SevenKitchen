import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const readProjectFile = (...segments: string[]) =>
  readFileSync(join(__dirname, '../..', ...segments), 'utf8');

const modelBlock = (schema: string, modelName: string) => {
  const match = schema.match(
    new RegExp(`model ${modelName} \\{[\\s\\S]*?\\n\\}`),
  );
  expect(match).not.toBeNull();
  return match?.[0] ?? '';
};

describe('DeepSeek Agent nutrition matching schema', () => {
  const schema = readProjectFile('prisma/schema.prisma');

  it('stores admin-only Agent provider configuration outside global config', () => {
    const block = modelBlock(schema, 'AgentProviderConfig');

    expect(block).toContain('purpose');
    expect(block).toContain('provider');
    expect(block).toContain('enabled');
    expect(block).toContain('baseUrl');
    expect(block).toContain('model');
    expect(block).toContain('apiKeyEncrypted');
    expect(block).toContain('apiKeyLast4');
    expect(block).toContain('maxConcurrency');
    expect(block).toContain('requestTimeoutMs');
    expect(block).toContain('retryCount');
    expect(block).toContain('@@unique([purpose, provider])');
    expect(modelBlock(schema, 'GlobalConfig')).not.toContain(
      'apiKeyEncrypted',
    );
  });

  it('stores batch Agent review job progress', () => {
    const block = modelBlock(schema, 'NutritionAgentReviewJob');

    expect(block).toContain('status');
    expect(block).toContain('provider');
    expect(block).toContain('model');
    expect(block).toContain('forceRerun');
    expect(block).toContain('totalCount');
    expect(block).toContain('processedCount');
    expect(block).toContain('successCount');
    expect(block).toContain('failedCount');
    expect(block).toContain('skippedCount');
    expect(block).toContain('failureDetails');
  });

  it('adds a migration for settings and job tables', () => {
    const migrationPath = join(
      __dirname,
      '../../prisma/migrations/202605130001_deepseek_agent_nutrition_matching/migration.sql',
    );

    expect(existsSync(migrationPath)).toBe(true);
    const migration = readFileSync(migrationPath, 'utf8');
    expect(migration).toContain('agent_provider_config');
    expect(migration).toContain('nutrition_agent_review_job');
    expect(migration).toContain('api_key_encrypted');
  });
});
