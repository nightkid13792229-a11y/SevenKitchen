# API 地址迁移总结 - 本地 → 生产环境

## 修改文件列表

### 1. 核心配置文件
- **`src/utils/config.ts`** - API 基础地址配置

### 2. UI 提示文本
- **`src/pages/network-settings/index.vue`** - 网络设置页面的示例文本和说明

## 修改前 / 修改后示例

### 文件 1: `src/utils/config.ts`

**修改前：**
```typescript
const DEFAULT_BASE_URL = 'http://127.0.0.1:3000/api/v1'
```

**修改后：**
```typescript
const DEFAULT_BASE_URL = 'https://api.sevenkitchen.cloud/api/v1'
```

### 文件 2: `src/pages/network-settings/index.vue`

**修改前：**
```vue
<!-- placeholder -->
placeholder="例如: http://127.0.0.1:3000/api/v1"

<!-- 使用说明 -->
<text>• 开发环境建议使用: http://127.0.0.1:3000/api/v1</text>
<text>• 生产环境请使用实际服务器地址</text>
```

**修改后：**
```vue
<!-- placeholder -->
placeholder="例如: https://api.sevenkitchen.cloud/api/v1"

<!-- 使用说明 -->
<text>• 默认使用生产环境: https://api.sevenkitchen.cloud/api/v1</text>
<text>• 开发环境可切换为: http://127.0.0.1:3000/api/v1</text>
```

## API 调用验证

所有 API 调用都通过统一的 `request()` 函数，该函数使用 `getBaseUrl()` 获取基础地址：

### 1. 登录接口 `/api/v1/auth/login`
- **位置**：`src/utils/api.ts` → `performLogin()`
- **调用**：`${baseUrl}/auth/login`
- **状态**：✅ 已自动切换到生产环境

### 2. 狗狗档案列表接口 `/api/v1/dogs`
- **位置**：`src/pages/dog-profile-list/index.vue`
- **调用**：`request({ url: '/dogs' })`
- **状态**：✅ 已自动切换到生产环境

### 3. 创建档案接口 `/api/v1/dogs` (POST)
- **位置**：`src/pages/dog-create/index.vue`
- **调用**：`request({ url: '/dogs', method: 'POST', data: ... })`
- **状态**：✅ 已自动切换到生产环境

## 影响范围

### ✅ 自动生效的接口（无需额外修改）
- `/api/v1/auth/login` - 登录接口
- `/api/v1/dogs` (GET) - 获取狗狗列表
- `/api/v1/dogs` (POST) - 创建狗狗档案
- 所有其他通过 `request()` 函数调用的接口

### 📝 说明
- 所有 API 调用都通过 `src/utils/api.ts` 中的 `request()` 函数
- `request()` 函数内部调用 `getBaseUrl()` 获取基础地址
- 修改 `config.ts` 中的 `DEFAULT_BASE_URL` 后，所有接口自动使用新地址
- 如果用户之前通过"网络设置"页面修改过地址，需要清除存储或重置为默认值

## 验证步骤

### 1. 构建验证（已完成）
```bash
cd miniapp
pnpm run build:mp-weixin
```

### 2. 微信开发者工具验证
1. 打开微信开发者工具
2. 导入项目：`miniapp/dist/build/mp-weixin`
3. 点击"编译"
4. 打开"调试器" → "Console"
5. 查看启动日志，应显示：
   ```
   📡 BASE_URL: https://api.sevenkitchen.cloud/api/v1
   ```

### 3. 功能验证
1. **登录验证**：
   - 打开小程序
   - 查看 Console，应看到登录请求发送到 `https://api.sevenkitchen.cloud/api/v1/auth/login`
   - 应看到 "✓ Auto-login successful" 或相关日志

2. **创建狗狗档案验证**：
   - 点击"创建狗狗档案"按钮
   - 填写信息并提交
   - 查看 Console，应看到请求发送到 `https://api.sevenkitchen.cloud/api/v1/dogs`
   - 应看到明确的响应（成功或错误提示）

3. **网络设置验证**：
   - 进入"网络设置"页面
   - 查看默认值应显示：`https://api.sevenkitchen.cloud/api/v1`
   - placeholder 应显示生产环境地址

## 是否需要重新上传体验版？

### ✅ **是的，需要重新上传体验版**

**原因：**
1. 默认 API 地址已从本地开发地址改为生产环境地址
2. 只有重新构建并上传体验版，真机才能使用新的 API 地址
3. 旧版本体验版仍会使用本地地址（如果用户未手动修改过网络设置）

**操作步骤：**
1. 确认已重新构建：`pnpm run build:mp-weixin`
2. 在微信开发者工具中点击"上传"
3. 填写版本号（建议：`v1.0.1-production` 或带时间戳）
4. 在微信公众平台提交审核并发布体验版
5. 用手机扫码测试，验证"创建狗狗档案"功能

## 注意事项

1. **存储覆盖**：如果用户之前通过"网络设置"页面修改过地址并保存，该设置会覆盖默认值。需要：
   - 在"网络设置"页面点击"重置为默认值"
   - 或清除小程序数据重新打开

2. **域名配置**：确保在微信公众平台已配置 `request` 合法域名：
   - `api.sevenkitchen.cloud`
   - 配置路径：微信公众平台 → 开发 → 开发管理 → 开发设置 → 服务器域名

3. **开发环境**：如需本地开发，可通过"网络设置"页面临时切换回 `http://127.0.0.1:3000/api/v1`

---

**修改完成时间**：2025-12-22  
**默认 API 地址**：`https://api.sevenkitchen.cloud/api/v1`  
**构建输出目录**：`dist/build/mp-weixin`  
**需要重新上传体验版**：✅ **是**

