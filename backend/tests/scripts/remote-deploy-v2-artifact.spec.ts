import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('remote_deploy_v2.sh', () => {
  const root = resolve(__dirname, '../../..');
  const scriptPath = resolve(root, 'backend/scripts/remote_deploy_v2.sh');
  const script = readFileSync(scriptPath, 'utf8');
  const remoteBlocks = [
    ...script.matchAll(/ssh_exec_multiline <<'ENDSSH'\n([\s\S]*?)\nENDSSH/g),
  ]
    .map((match) => match[1])
    .join('\n');

  it('builds locally, uploads dist, and avoids production-server builds', () => {
    expect(script).toMatch(/npm run build/);
    expect(script).toMatch(/rsync .*"\$DIST_DIR\/"/);
    expect(script).toMatch(/\$SERVER_PROJECT_PATH\/dist\//);

    expect(remoteBlocks).not.toMatch(
      /pnpm\s+run\s+build|npm\s+run\s+build|nest\s+build|deploy_lighthouse\.sh/,
    );
    expect(remoteBlocks).toMatch(/pnpm prisma migrate deploy/);
    expect(remoteBlocks).toMatch(/systemctl restart sevenkitchen-backend/);
  });
});
