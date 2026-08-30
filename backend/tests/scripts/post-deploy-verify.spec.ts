import { existsSync, readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { resolve } from 'path';

describe('post_deploy_verify.sh', () => {
  const root = resolve(__dirname, '../../..');
  const scriptPath = resolve(root, 'backend/scripts/post_deploy_verify.sh');

  it('exists and keeps the deployment verification checks available', () => {
    expect(existsSync(scriptPath)).toBe(true);

    const syntax = spawnSync('bash', ['-n', scriptPath], {
      cwd: resolve(root, 'backend'),
      encoding: 'utf8',
    });
    expect(syntax.status).toBe(0);

    const script = readFileSync(scriptPath, 'utf8');
    expect(script).toMatch(
      /systemctl list-unit-files sevenkitchen-backend\.service/,
    );
    expect(script).toMatch(/systemctl is-active --quiet sevenkitchen-backend/);
    expect(script).toMatch(/api\/v1\/health/);
    expect(script).toMatch(/PSQL_URL=\$\(printf '%s' "\$DATABASE_URL"/);
    expect(script).toMatch(/psql "\$PSQL_URL" -c "SELECT 1;"/);
  });
});
