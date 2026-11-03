# BCS体态评分标准图片 - 腾讯云 COS 配置

## ✅ 配置完成

BCS体态评分标准图片已配置为使用腾讯云COS存储，与用户头像、食谱封面共享同一个存储桶和CDN域名。

## 📁 COS 存储配置

### 文件夹路径
```
bcs-standards/
```

### 图片访问URL格式
```
https://img.sevenkitchen.cloud/bcs-standards/{文件名}
```

### 当前配置的图片
| 图片用途 | 文件名 | COS URL |
|---------|--------|---------|
| BCS体态评分标准图 | BCS-chart.png | https://img.sevenkitchen.cloud/bcs-standards/BCS-chart.png |

## 📤 上传步骤

### 方法1：通过腾讯云COS控制台上传

1. **登录腾讯云COS控制台**
   - 访问：https://console.cloud.tencent.com/cos5
   - 选择存储桶：`sevenkitchen-mvp-123-1392823718`
   - 选择地域：`ap-chengdu（成都）`

2. **创建文件夹**
   - 在存储桶根目录下创建文件夹：`bcs-standards`

3. **上传图片**
   - 进入 `bcs-standards` 文件夹
   - 点击"上传文件"
   - 上传您的BCS体态评分标准图片
   - **重要**：确保文件名为 `BCS-chart.png`（区分大小写）

### 方法2：通过COSBrowser工具上传

1. **下载COSBrowser**
   - 访问：https://cloud.tencent.com/document/product/436/11364
   - 安装并登录COSBrowser

2. **配置连接**
   - 使用以下配置：
     - SecretId: `AKIDoZ9YpvnRs8TcXGn7HEzYt0vdAVcXEhwz`
     - SecretKey: `ub3HKAmAOPDoCjAOQFtJVUIuJVXN0Pjs`
     - Region: `ap-chengdu`
     - Bucket: `sevenkitchen-mvp-123-1392823718`

3. **上传文件**
   - 导航到存储桶根目录
   - 创建文件夹 `bcs-standards`
   - 上传 `BCS-chart.png` 到该文件夹

### 方法3：通过命令行（coscli）上传

如果您已配置 `coscli` 工具：

```bash
# 创建文件夹
coscli mkdir cos://sevenkitchen-mvp-123-1392823718/ap-chengdu/bcs-standards/

# 上传图片
coscli cp /本地路径/BCS-chart.png cos://sevenkitchen-mvp-123-1392823718/ap-chengdu/bcs-standards/BCS-chart.png
```

## 🧪 测试步骤

### 1. 上传图片后，在小程序中测试

1. **清除缓存并重新编译**
   - 在微信开发者工具中：项目 → 清除缓存 → 清除全部缓存
   - 重新编译：项目 → 编译

2. **测试BCS图片显示**
   - 进入小程序
   - 打开"创建狗狗档案"页面
   - 在BCS评分字段旁边点击"查看标准"按钮
   - **预期结果**：弹窗中显示BCS体态评分标准图

3. **验证CDN访问**
   - 在浏览器中直接访问：`https://img.sevenkitchen.cloud/bcs-standards/BCS-chart.png`
   - **预期结果**：显示BCS评分标准图片

### 2. 故障排查

如果图片无法显示：

1. **检查文件名**
   - 确认文件名完全匹配：`BCS-chart.png`（区分大小写）
   - 不应是 `bcs-chart.png` 或 `BCS-CHART.PNG`

2. **检查文件夹路径**
   - 确认图片在：`bcs-standards/BCS-chart.png`
   - 不应在其他文件夹（如 `avatars/` 或 `recipes/`）

3. **检查权限设置**
   - 在COS控制台中，确保 `bcs-standards/` 文件夹的权限为"公共读"
   - 或确保整个存储桶的权限为"公共读"

4. **清除小程序缓存**
   - 微信开发者工具：项目 → 清除缓存
   - 真机调试：删除小程序重新进入

## 📊 与其他图片共享配置

BCS评分图与用户头像、食谱封面使用相同的腾讯云 COS 配置：

| 图片类型 | 文件夹路径 | 示例URL |
|---------|-----------|---------|
| 用户头像 | `avatars/{用户ID}/` | https://img.sevenkitchen.cloud/avatars/user123/avatar.jpg |
| 食谱封面 | `recipe-covers/{食谱ID}/` | https://img.sevenkitchen.cloud/recipe-covers/recipe456/cover.jpg |
| BCS评分图 | `bcs-standards/` | https://img.sevenkitchen.cloud/bcs-standards/BCS-chart.png |

**优势**：
- 统一的CDN加速域名（img.sevenkitchen.cloud）
- 共享存储桶配额
- 统一的访问权限管理
- 降低成本

## 🔧 技术细节

### 代码位置
- **前端页面**：`miniapp/src/pages/dog-create/index.vue`
- **配置变量**：`bcsGuideImageUrl` (第1251行)

### 当前代码
```typescript
// BCS评分图URL - 使用腾讯云COS存储
const bcsGuideImageUrl = ref('https://img.sevenkitchen.cloud/bcs-standards/BCS-chart.png')
```

### 降级策略
如果COS图片加载失败，系统会自动显示文字版的BCS评分标准（1-3分、4-5分、6-9分的描述），确保用户仍能了解评分标准。

## 📝 其他说明

### 图片规格建议
- **格式**：PNG（支持透明背景）或JPG
- **尺寸**：建议宽度 750px - 1200px
- **文件大小**：建议 < 500KB（优化加载速度）
- **内容**：清晰的BCS 1-9分体态对比图

### 多语言支持
如果需要支持多语言的BCS标准图，可以：
- 创建子文件夹：`bcs-standards/zh-CN/`, `bcs-standards/en/`
- 文件命名：`BCS-chart-zh-CN.png`, `BCS-chart-en.png`
- 根据用户语言环境动态加载不同图片

---

## ⚠️ 注意事项

1. **CDN缓存**
   - 上传新图片后，CDN可能需要几分钟才能刷新
   - 如果看不到更新，请等待5-10分钟后重试

2. **图片优化**
   - 上传前建议压缩图片以降低CDN流量成本
   - 可以使用 TinyPNG 或类似工具优化

3. **备份**
   - 保留原始图片的本地备份
   - 避免意外删除后无法恢复

---

**配置日期**：2026-02-01
**配置人员**：Claude Code Assistant
**文档版本**：1.0
