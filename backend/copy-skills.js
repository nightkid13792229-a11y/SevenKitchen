const fs = require('fs');
const path = require('path');

const sourceDir = path.join(__dirname, 'skills');
const targetDir = path.join(__dirname, 'dist/skills');

console.log('Copying skill files...');

if (!fs.existsSync(sourceDir)) {
  console.log('No skills directory, skipped.');
  process.exit(0);
}

fs.cpSync(sourceDir, targetDir, { recursive: true });
console.log('Skill files copied successfully!');
