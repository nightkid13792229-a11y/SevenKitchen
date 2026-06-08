const fs = require('fs');
const path = require('path');

const requiredFiles = [
  'src/App.vue',
  'src/pages.json',
  'src/manifest.json',
  'src/main.ts'
];

console.log('🔍 检查 uni-app 项目环境...\n');

const missing = requiredFiles.filter(file => {
  const exists = fs.existsSync(path.join(__dirname, '..', file));
  if (!exists) {
    console.error(`❌ 缺少文件: ${file}`);
  }
  return !exists;
});

if (missing.length > 0) {
  console.error('\n❌ 项目环境检查失败！\n');
  console.error('缺少的文件数量:', missing.length);
  process.exit(1);
}

console.log('✅ 项目环境检查通过\n');
console.log('所有必需文件都存在，可以开始编译。\n');
