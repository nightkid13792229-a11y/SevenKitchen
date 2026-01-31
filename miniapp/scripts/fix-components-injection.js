#!/usr/bin/env node

/**
 * 微信小程序构建后配置验证
 * 此脚本验证构建后的配置是否正确
 */

const fs = require('fs');
const path = require('path');

const appJsonPath = path.join(__dirname, '../dist/build/mp-weixin/app.json');

console.log('🔧 验证构建配置...');

// 读取 app.json
if (!fs.existsSync(appJsonPath)) {
  console.error('❌ app.json 文件不存在:', appJsonPath);
  process.exit(1);
}

const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf-8'));

// 移除无效的 component2Dir 配置（微信小程序不支持）
if (appJson.component2Dir) {
  delete appJson.component2Dir;
  fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n', 'utf-8');
  console.log('✅ 已移除无效的 component2Dir 配置');
}

console.log('✨ 构建配置验证完成！');
