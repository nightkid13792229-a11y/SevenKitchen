import * as path from 'path';
import { resolveEnvConfigPath } from 'src/utils/env-config';

describe('env-config', () => {
  it('falls back from a worktree backend cwd to the main repo backend env file', () => {
    const worktreeBackend = '/Users/zhaochen/Documents/SevenKitchen/.worktrees/codex-dog-profile-flow/backend';
    const mainBackendEnv = '/Users/zhaochen/Documents/SevenKitchen/backend/.env';

    const resolved = resolveEnvConfigPath(worktreeBackend, 'development', (candidate) =>
      candidate === mainBackendEnv,
    );

    expect(resolved).toBe(mainBackendEnv);
  });

  it('prefers worktree-local env files when they exist', () => {
    const worktreeBackend = '/Users/zhaochen/Documents/SevenKitchen/.worktrees/codex-dog-profile-flow/backend';
    const localEnv = path.join(worktreeBackend, '.env.development');
    const mainBackendEnv = '/Users/zhaochen/Documents/SevenKitchen/backend/.env';

    const resolved = resolveEnvConfigPath(worktreeBackend, 'development', (candidate) =>
      candidate === localEnv || candidate === mainBackendEnv,
    );

    expect(resolved).toBe(localEnv);
  });

  it('returns null when neither worktree nor main backend env files exist', () => {
    const worktreeBackend = '/Users/zhaochen/Documents/SevenKitchen/.worktrees/codex-dog-profile-flow/backend';

    const resolved = resolveEnvConfigPath(worktreeBackend, 'development', () => false);

    expect(resolved).toBeNull();
  });
});
