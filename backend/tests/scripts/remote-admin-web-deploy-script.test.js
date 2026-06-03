const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');

const root = resolve(__dirname, '../../..');
const scriptPath = resolve(root, 'backend/scripts/remote_deploy_admin_web.sh');

test('remote admin-web deploy script uses remote checkout, build, release, and verification guards', () => {
  const script = readFileSync(scriptPath, 'utf8');

  assert.match(script, /source "\$SSH_HELPER_SCRIPT"/);
  assert.match(script, /validate_ssh_connection/);
  assert.match(script, /DEPLOY_REF="\$\{DEPLOY_REF:-main\}"/);
  assert.match(script, /REMOTE_SOURCE_PATH="\$\{REMOTE_SOURCE_PATH:-\/opt\/sevenkitchen\/SevenKitchen-admin-web-source\}"/);
  assert.match(script, /REMOTE_DEPLOY_PATH="\$\{REMOTE_DEPLOY_PATH:-\/opt\/sevenkitchen\/SevenKitchen\/admin-web\}"/);
  assert.match(script, /git fetch origin "\$DEPLOY_REF"/);
  assert.match(script, /git reset --hard FETCH_HEAD/);
  assert.match(script, /cd "\$REMOTE_SOURCE_PATH\/admin-web"/);
  assert.match(script, /npm ci/);
  assert.match(script, /npm run build:prod/);
  assert.match(script, /REMOTE_RELEASES_PATH/);
  assert.match(script, /rsync -a --delete dist\/ "\$release_dir\/"/);
  assert.match(script, /test -f "\$release_dir\/index.html"/);
  assert.match(script, /mv "\$REMOTE_DEPLOY_PATH" "\$previous_dir"/);
  assert.match(script, /mv "\$release_dir" "\$REMOTE_DEPLOY_PATH"/);
  assert.match(script, /test -f "\$REMOTE_DEPLOY_PATH\/index.html"/);
});
