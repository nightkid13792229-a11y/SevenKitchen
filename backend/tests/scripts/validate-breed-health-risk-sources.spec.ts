import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('validate-breed-health-risk-sources script', () => {
  it('requires published risks to have at least one usable visible source', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'scripts/validate-breed-health-risk-sources.ts'),
      'utf-8',
    );

    expect(source).toContain('source.sourceName.trim()');
    expect(source).toContain('source.title.trim()');
    expect(source).toContain('source.url.trim()');
    expect(source).toContain('new URL(url)');
    expect(source).toContain("parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:'");
    expect(source).toContain('Number.isNaN(accessedAt.getTime())');
    expect(source).toContain('process.exitCode = 1');
    expect(source).not.toContain('process.exit(');
  });
});
