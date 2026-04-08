#!/usr/bin/env node

/**
 * 微信小程序构建后配置修正
 * 1. 清理 app.json 中微信开发者工具不支持的字段
 * 2. 同步 project.config.json 中的依赖分析相关设置，避免 dist 目录被直接打开时误过滤依赖文件
 */

const fs = require('fs');
const path = require('path');

const ROOT_PROJECT_CONFIG_PATH = path.join(__dirname, '../project.config.json');
const ROOT_PRIVATE_PROJECT_CONFIG_PATH = path.join(__dirname, '../project.private.config.json');
const DIST_DIRS = [
  path.join(__dirname, '../dist/build/mp-weixin'),
  path.join(__dirname, '../dist/dev/mp-weixin'),
];

console.log('🔧 验证并同步微信小程序构建配置...');

const safeReadJson = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
};

const safeWriteJson = (filePath, payload) => {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf-8');
};

const rootProjectConfig = safeReadJson(ROOT_PROJECT_CONFIG_PATH) || {};
const rootPrivateProjectConfig = safeReadJson(ROOT_PRIVATE_PROJECT_CONFIG_PATH) || {};

const normalizedProjectSetting = {
  ...(rootProjectConfig.setting || {}),
  ignoreDevUnusedFiles: false,
  ignoreUploadUnusedFiles: false,
  ignoreUnusedFiles: false,
  filterNoDependencyFile: false,
};

const normalizedPrivateSetting = {
  ...(rootPrivateProjectConfig.setting || {}),
  urlCheck: false,
  ignoreDevUnusedFiles: false,
  ignoreUploadUnusedFiles: false,
  ignoreUnusedFiles: false,
};

let processedDistCount = 0;

for (const distDir of DIST_DIRS) {
  if (!fs.existsSync(distDir)) {
    continue;
  }

  processedDistCount += 1;

  const appJsonPath = path.join(distDir, 'app.json');
  const projectConfigPath = path.join(distDir, 'project.config.json');
  const privateProjectConfigPath = path.join(distDir, 'project.private.config.json');

  if (fs.existsSync(appJsonPath)) {
    const appJson = safeReadJson(appJsonPath);

    if (appJson && appJson.component2Dir) {
      delete appJson.component2Dir;
      safeWriteJson(appJsonPath, appJson);
      console.log(`✅ 已移除无效的 component2Dir 配置: ${distDir}`);
    }
  }

  if (fs.existsSync(projectConfigPath)) {
    const projectConfig = safeReadJson(projectConfigPath) || {};
    projectConfig.setting = {
      ...(projectConfig.setting || {}),
      ...normalizedProjectSetting,
    };
    projectConfig.packOptions = projectConfig.packOptions || { ignore: [] };
    safeWriteJson(projectConfigPath, projectConfig);
    console.log(`✅ 已同步 project.config.json: ${distDir}`);
  }

  const privateProjectConfig = safeReadJson(privateProjectConfigPath) || {};
  privateProjectConfig.setting = {
    ...(privateProjectConfig.setting || {}),
    ...normalizedPrivateSetting,
  };
  safeWriteJson(privateProjectConfigPath, privateProjectConfig);
  console.log(`✅ 已同步 project.private.config.json: ${distDir}`);
}

if (processedDistCount === 0) {
  console.error('❌ 未找到任何可同步的 mp-weixin 构建目录');
  process.exit(1);
}

console.log('✨ 构建配置同步完成！');
