const fs = require('fs');
const path = require('path');

const sourceDir = path.join(__dirname, 'src/assets/fonts');
const targetDir = path.join(__dirname, 'dist/assets/fonts');

console.log('Copying font files...');

// Create target directory
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// Copy font files
const files = fs.readdirSync(sourceDir);
files.forEach(file => {
  if (file.endsWith('.otf') || file.endsWith('.ttf')) {
    const sourcePath = path.join(sourceDir, file);
    const targetPath = path.join(targetDir, file);
    fs.copyFileSync(sourcePath, targetPath);
    console.log(`Copied: ${file}`);
  }
});

console.log('Font files copied successfully!');
