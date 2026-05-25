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
const SUBPACKAGE_ONLY_HELPER_MODULES = [
  'api/orders.js',
  'utils/diy-sheet-format.js',
  'utils/dog-breed-search.js',
  'utils/dog-breed-search-catalog.js',
  'utils/dog-breed-ui.js',
  'utils/dog-profile-create-actions.js',
  'utils/dog-profile-create-view.js',
  'utils/dog-profile-draft.js',
  'utils/dog-profile-overview.js',
  'utils/dog-recommendation-summary.js',
  'utils/label-mapping.js',
  'utils/order-package-plan.js',
  'utils/page-scroll.js',
  'utils/print-canvas.js',
];
const DIST_DIRS = [
  path.join(__dirname, '../dist/build/mp-weixin'),
  path.join(__dirname, '../dist/dev/mp-weixin'),
];

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

const copyDirectoryRecursive = (sourceDir, targetDir) => {
  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryRecursive(sourcePath, targetPath);
      continue;
    }

    if (entry.isFile()) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
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
  copyDirectoryRecursive(sourceDir, targetDir);
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

const toPosixPath = (filePath) => filePath.split(path.sep).join('/');

const normalizeModulePath = (filePath) => path.posix.normalize(toPosixPath(filePath)).replace(/^\.\//, '');

const getSubpackageRoots = (appJson) => (appJson?.subPackages || appJson?.subpackages || [])
  .map((subPackage) => normalizeModulePath(subPackage.root || ''))
  .filter(Boolean);

const isInsidePackageRoot = (filePath, packageRoot) => filePath === packageRoot || filePath.startsWith(`${packageRoot}/`);

const isInsideAnySubpackage = (filePath, subpackageRoots) => subpackageRoots.some((root) => isInsidePackageRoot(filePath, root));

const collectJsFiles = (dir) => {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectJsFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(entryPath);
    }
  }

  return files;
};

const toDistRelativePath = (distDir, filePath) => normalizeModulePath(path.relative(distDir, filePath));

const resolveRequireTarget = (fromFile, requestPath) => {
  if (!requestPath.startsWith('.')) {
    return null;
  }

  return normalizeModulePath(path.posix.join(path.posix.dirname(fromFile), requestPath));
};

const toRequirePath = (fromFile, targetFile) => {
  let requestPath = path.posix.relative(path.posix.dirname(fromFile), targetFile);

  if (!requestPath.startsWith('.')) {
    requestPath = `./${requestPath}`;
  }

  return requestPath;
};

const rewriteRequires = (source, fromFile, getReplacementPath) => source.replace(
  /require\((['"])([^'"]+)\1\)/g,
  (match, quote, requestPath) => {
    const targetFile = resolveRequireTarget(fromFile, requestPath);

    if (!targetFile) {
      return match;
    }

    const replacementPath = getReplacementPath(targetFile);

    return replacementPath ? `require(${quote}${replacementPath}${quote})` : match;
  },
);

const getSelectedModuleDependencies = (distDir, modulePath, selectedModules) => {
  const moduleFilePath = path.join(distDir, modulePath);

  if (!fs.existsSync(moduleFilePath)) {
    return [];
  }

  const dependencies = new Set();
  const source = fs.readFileSync(moduleFilePath, 'utf-8');

  rewriteRequires(source, modulePath, (targetFile) => {
    if (selectedModules.has(targetFile)) {
      dependencies.add(targetFile);
    }

    return null;
  });

  return Array.from(dependencies);
};

const getSelectedModulesRequiredByMainPackage = (distDir, subpackageRoots, selectedModules) => {
  const keepModules = new Set();
  const jsFiles = collectJsFiles(distDir);

  for (const filePath of jsFiles) {
    const fileRelativePath = toDistRelativePath(distDir, filePath);

    if (isInsideAnySubpackage(fileRelativePath, subpackageRoots) || selectedModules.has(fileRelativePath)) {
      continue;
    }

    const source = fs.readFileSync(filePath, 'utf-8');

    rewriteRequires(source, fileRelativePath, (targetFile) => {
      if (selectedModules.has(targetFile)) {
        keepModules.add(targetFile);
      }

      return null;
    });
  }

  const pendingModules = Array.from(keepModules);

  while (pendingModules.length > 0) {
    const modulePath = pendingModules.pop();

    for (const dependency of getSelectedModuleDependencies(distDir, modulePath, selectedModules)) {
      if (!keepModules.has(dependency)) {
        keepModules.add(dependency);
        pendingModules.push(dependency);
      }
    }
  }

  return keepModules;
};

const localizeSubpackageOnlyModules = (
  distDir,
  appJson,
  modulePaths = SUBPACKAGE_ONLY_HELPER_MODULES,
) => {
  const subpackageRoots = getSubpackageRoots(appJson);

  if (subpackageRoots.length === 0) {
    return { copiedModules: 0, removedModules: 0, rewrittenFiles: 0 };
  }

  const selectedModules = new Set(modulePaths.map(normalizeModulePath));
  const copiedModulesByRoot = new Map();
  let copiedModules = 0;
  let rewrittenFiles = 0;

  const copyModuleToSubpackage = (subpackageRoot, modulePath) => {
    const sourcePath = path.join(distDir, modulePath);

    if (!fs.existsSync(sourcePath)) {
      return;
    }

    const packageModules = copiedModulesByRoot.get(subpackageRoot) || new Set();
    copiedModulesByRoot.set(subpackageRoot, packageModules);

    if (packageModules.has(modulePath)) {
      return;
    }

    packageModules.add(modulePath);

    const localizedPath = normalizeModulePath(path.posix.join(subpackageRoot, modulePath));
    const localizedFilePath = path.join(distDir, localizedPath);
    fs.mkdirSync(path.dirname(localizedFilePath), { recursive: true });

    const source = fs.readFileSync(sourcePath, 'utf-8');
    const localizedSource = rewriteRequires(source, modulePath, (targetFile) => {
      if (selectedModules.has(targetFile)) {
        copyModuleToSubpackage(subpackageRoot, targetFile);
        return toRequirePath(localizedPath, normalizeModulePath(path.posix.join(subpackageRoot, targetFile)));
      }

      const targetPath = path.join(distDir, targetFile);
      if (fs.existsSync(targetPath)) {
        return toRequirePath(localizedPath, targetFile);
      }

      return null;
    });

    fs.writeFileSync(localizedFilePath, localizedSource, 'utf-8');
    copiedModules += 1;
  };

  for (const root of subpackageRoots) {
    const rootDir = path.join(distDir, root);

    for (const filePath of collectJsFiles(rootDir)) {
      const fileRelativePath = toDistRelativePath(distDir, filePath);
      const source = fs.readFileSync(filePath, 'utf-8');
      const rewrittenSource = rewriteRequires(source, fileRelativePath, (targetFile) => {
        if (!selectedModules.has(targetFile)) {
          return null;
        }

        const localizedTarget = normalizeModulePath(path.posix.join(root, targetFile));
        copyModuleToSubpackage(root, targetFile);
        return toRequirePath(fileRelativePath, localizedTarget);
      });

      if (rewrittenSource !== source) {
        fs.writeFileSync(filePath, rewrittenSource, 'utf-8');
        rewrittenFiles += 1;
      }
    }
  }

  const keepModules = getSelectedModulesRequiredByMainPackage(distDir, subpackageRoots, selectedModules);
  let removedModules = 0;

  for (const modulePath of selectedModules) {
    const moduleFilePath = path.join(distDir, modulePath);

    if (!fs.existsSync(moduleFilePath) || keepModules.has(modulePath)) {
      continue;
    }

    fs.rmSync(moduleFilePath, { force: true });
    removedModules += 1;
  }

  if (copiedModules > 0 || rewrittenFiles > 0 || removedModules > 0) {
    console.log(
      `✅ 已迁移分包专用 JS: 复制 ${copiedModules} 个，改写 ${rewrittenFiles} 个文件，移除主包 ${removedModules} 个`,
    );
  }

  return { copiedModules, removedModules, rewrittenFiles };
};

const run = () => {
  console.log('🔧 验证并同步微信小程序构建配置...');

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
    let appJson = null;

    for (const assetDirName of STATIC_ASSET_DIRECTORIES) {
      syncStaticAssetDirectory(distDir, assetDirName);
    }

    if (fs.existsSync(appJsonPath)) {
      appJson = safeReadJson(appJsonPath);
      let appJsonChanged = false;

      if (appJson && appJson.component2Dir) {
        delete appJson.component2Dir;
        appJsonChanged = true;
        console.log(`✅ 已移除无效的 component2Dir 配置: ${distDir}`);
      }

      if (appJson && Object.prototype.hasOwnProperty.call(appJson, 'usingShopPlugin')) {
        delete appJson.usingShopPlugin;
        appJsonChanged = true;
        console.log(`✅ 已移除无效的 usingShopPlugin 配置: ${distDir}`);
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

    if (appJson) {
      localizeSubpackageOnlyModules(distDir, appJson);
    }

    if (fs.existsSync(projectConfigPath)) {
      const projectConfig = safeReadJson(projectConfigPath) || {};
      projectConfig.miniprogramRoot = './';
      projectConfig.libVersion = rootProjectConfig.libVersion || '3.13.0';
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
};

if (require.main === module) {
  run();
}

module.exports = {
  localizeSubpackageOnlyModules,
  run,
};
