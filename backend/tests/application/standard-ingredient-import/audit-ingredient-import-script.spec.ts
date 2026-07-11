import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

describe('audit-ingredient-import script', () => {
  it('reports validation errors instead of crashing for malformed FOOD source data', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'standard-ingredient-audit-'));
    const manifestPath = join(tempDir, 'malformed.manifest.json');
    const auditPath = join(tempDir, 'malformed.audit.json');

    try {
      writeFileSync(
        manifestPath,
        JSON.stringify({
          version: 1,
          operationMode: 'local-draft',
          ingredient: { type: 'FOOD', name: 'Malformed food' },
          nutritionProfiles: [
            {
              id: 'profile-1',
              dataSource: 'USDA_FDC',
              basis: 'PER_100G',
              preparationState: 'raw',
              nutrients: { energyKcal: { value: 12, unit: 'kcal' } },
            },
          ],
          sourceCandidates: [
            {
              source: 'USDA_FDC',
              sourceId: 'USDA_FDC:malformed-state-tags',
              sourceName: 'USDA FoodData Central',
              stateTags: 'raw',
            },
          ],
          dbAlignmentReport: { id: '', status: 'failing' },
          operatorConfirmation: { localWriteApproved: false },
        }),
        'utf8',
      );

      const result = spawnSync(
        process.execPath,
        [
          '-r',
          'ts-node/register',
          '-r',
          'tsconfig-paths/register',
          resolve(
            __dirname,
            '../../../../skills/adding-standard-ingredients/scripts/audit-ingredient-import.ts',
          ),
          '--manifest',
          manifestPath,
          '--out',
          auditPath,
        ],
        { cwd: resolve(__dirname, '../../..'), encoding: 'utf8' },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Audit failed with');
      expect(result.stderr).not.toContain('forEach is not a function');
      expect(result.stderr).not.toContain('Cannot read properties');

      const audit = JSON.parse(readFileSync(auditPath, 'utf8'));
      expect(audit.ok).toBe(false);
      expect(audit.rankedSources).toEqual([]);
      expect(audit.nutritionAudits).toEqual([]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('reports validation errors instead of crashing when a FOOD source candidate is null', () => {
    const result = runAudit({
      version: 1,
      operationMode: 'local-draft',
      ingredient: { type: 'FOOD', name: 'Malformed food' },
      nutritionProfiles: [],
      sourceCandidates: [null],
      operatorConfirmation: { localWriteApproved: false },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Audit failed with');
    expect(result.stderr).not.toContain('Cannot read properties');
    expect(result.audit?.ok).toBe(false);
  });

  it('reports validation errors instead of crashing when FOOD nutrition profiles are not an array', () => {
    const result = runAudit({
      version: 1,
      operationMode: 'local-draft',
      ingredient: { type: 'FOOD', name: 'Malformed food' },
      nutritionProfiles: {},
      sourceCandidates: [],
      operatorConfirmation: { localWriteApproved: false },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Audit failed with');
    expect(result.stderr).not.toContain('forEach is not a function');
    expect(result.audit?.ok).toBe(false);
  });

  function runAudit(manifest: unknown): {
    status: number | null;
    stderr: string;
    audit?: { ok: boolean };
  } {
    const tempDir = mkdtempSync(join(tmpdir(), 'standard-ingredient-audit-'));
    const manifestPath = join(tempDir, 'malformed.manifest.json');
    const auditPath = join(tempDir, 'malformed.audit.json');

    try {
      writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');
      const result = spawnSync(
        process.execPath,
        [
          '-r',
          'ts-node/register',
          '-r',
          'tsconfig-paths/register',
          resolve(
            __dirname,
            '../../../../skills/adding-standard-ingredients/scripts/audit-ingredient-import.ts',
          ),
          '--manifest',
          manifestPath,
          '--out',
          auditPath,
        ],
        { cwd: resolve(__dirname, '../../..'), encoding: 'utf8' },
      );

      return {
        status: result.status,
        stderr: result.stderr,
        audit: existsSync(auditPath)
          ? JSON.parse(readFileSync(auditPath, 'utf8'))
          : undefined,
      };
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
});
