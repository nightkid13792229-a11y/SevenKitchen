#!/usr/bin/env node

/**
 * 微信小程序构建后配置修正
 * 1. 清理 app.json 中微信开发者工具不支持的字段
 * 2. 同步 project.config.json 中的依赖分析相关设置，避免 dist 目录被直接打开时误过滤依赖文件
 * 3. 补齐 uni 构建未稳定复制的静态资源目录，避免微信开发者工具启动失败
 * 4. 补齐 app.json 的微信开发者工具兼容默认值，避免 WXSS 编译器读取空配置时报错
 * 5. 移除微信代码质量扫描会标记为无依赖的可选生成文件
 */

const fs = require('fs');
const path = require('path');

const ROOT_PROJECT_CONFIG_PATH = path.join(__dirname, '../project.config.json');
const STATIC_SOURCE_ROOTS = [
  path.join(__dirname, '../src/static'),
  path.join(__dirname, '../static'),
];
const STATIC_ASSET_DIRECTORIES = ['tabbar'];
const CODE_QUALITY_NO_DEPENDENCY_FILES = ['project.private.config.json', 'App.wxml'];
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

const findStaticSourceDir = (assetDirName) => {
  for (const sourceRoot of STATIC_SOURCE_ROOTS) {
    const sourceDir = path.join(sourceRoot, assetDirName);

    if (fs.existsSync(sourceDir)) {
      return sourceDir;
    }
  }

  return null;
};

const syncStaticAssetDirectory = (distDir, assetDirName) => {
  const sourceDir = findStaticSourceDir(assetDirName);

  if (!sourceDir) {
    console.warn(`⚠️ 未找到静态资源源目录: ${assetDirName}`);
    return;
  }

  const targetDir = path.join(distDir, 'static', assetDirName);
  fs.rmSync(targetDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  fs.cpSync(sourceDir, targetDir, { recursive: true });
  console.log(`✅ 已同步静态资源 ${assetDirName}: ${distDir}`);
};

const assertTabBarIconsExist = (distDir, appJson) => {
  const tabBarItems = appJson?.tabBar?.list || [];
  const missingIconPaths = [];

  for (const item of tabBarItems) {
    for (const iconPath of [item.iconPath, item.selectedIconPath]) {
      if (!iconPath) {
        continue;
      }

      const resolvedPath = path.join(distDir, iconPath);
      if (!fs.existsSync(resolvedPath)) {
        missingIconPaths.push(iconPath);
      }
    }
  }

  if (missingIconPaths.length > 0) {
    console.error(`❌ tabBar 图标文件缺失: ${missingIconPaths.join(', ')}`);
    process.exit(1);
  }
};

const removeCodeQualityNoDependencyFiles = (distDir) => {
  for (const fileName of CODE_QUALITY_NO_DEPENDENCY_FILES) {
    const filePath = path.join(distDir, fileName);

    if (!fs.existsSync(filePath)) {
      continue;
    }

    fs.rmSync(filePath, { force: true });
    console.log(`✅ 已移除无依赖生成文件 ${fileName}: ${distDir}`);
  }
};

const rootProjectConfig = safeReadJson(ROOT_PROJECT_CONFIG_PATH) || {};

const normalizedProjectSetting = {
  ...(rootProjectConfig.setting || {}),
  urlCheck: false,
  ignoreDevUnusedFiles: false,
  ignoreUploadUnusedFiles: false,
  ignoreUnusedFiles: false,
  filterNoDependencyFile: false,
};

let processedDistCount = 0;

for (const distDir of DIST_DIRS) {
  if (!fs.existsSync(distDir)) {
    continue;
  }

  processedDistCount += 1;

  const appJsonPath = path.join(distDir, 'app.json');
  const projectConfigPath = path.join(distDir, 'project.config.json');

  for (const assetDirName of STATIC_ASSET_DIRECTORIES) {
    syncStaticAssetDirectory(distDir, assetDirName);
  }

  if (fs.existsSync(appJsonPath)) {
    const appJson = safeReadJson(appJsonPath);
    let appJsonChanged = false;

    if (appJson && appJson.component2Dir) {
      delete appJson.component2Dir;
      appJsonChanged = true;
      console.log(`✅ 已移除无效的 component2Dir 配置: ${distDir}`);
    }

    if (appJson && !Object.prototype.hasOwnProperty.call(appJson, 'functionalPages')) {
      appJson.functionalPages = false;
      appJsonChanged = true;
      console.log(`✅ 已补齐 functionalPages 默认配置: ${distDir}`);
    }

    if (appJsonChanged) {
      safeWriteJson(appJsonPath, appJson);
    }

    assertTabBarIconsExist(distDir, appJson);
  }

  if (fs.existsSync(projectConfigPath)) {
    const projectConfig = safeReadJson(projectConfigPath) || {};
    projectConfig.miniprogramRoot = './';
    projectConfig.setting = {
      ...(projectConfig.setting || {}),
      ...normalizedProjectSetting,
    };
    projectConfig.packOptions = projectConfig.packOptions || { ignore: [] };
    safeWriteJson(projectConfigPath, projectConfig);
    console.log(`✅ 已同步 project.config.json: ${distDir}`);
  }

  removeCodeQualityNoDependencyFiles(distDir);
}

if (processedDistCount === 0) {
  console.error('❌ 未找到任何可同步的 mp-weixin 构建目录');
  process.exit(1);
}

console.log('✨ 构建配置同步完成！');
