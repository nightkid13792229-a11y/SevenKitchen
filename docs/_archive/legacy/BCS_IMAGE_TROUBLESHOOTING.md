# BCS图片加载问题诊断清单

## ❌ 问题现象
控制台显示：`[BCS Guide] Failed to load BCS guide image, showing fallback content`

## 🔍 诊断步骤

### 步骤1：验证URL是否可访问

**在浏览器中打开以下URL：**
```
https://img.sevenkitchen.cloud/bcs-standards/BCS-chart.png
```

**期望结果：** 应该能看到BCS体态评分标准图

**如果404 Not Found：**
- 图片未上传到COS
- 文件夹路径或文件名不匹配

---

### 步骤2：检查COS控制台

#### 2.1 登录COS控制台
1. 访问：https://console.cloud.tencent.com/cos5
2. 选择存储桶：`sevenkitchen-mvp-123-1392823718`
3. 选择地域：`ap-chengdu（成都）`

#### 2.2 检查文件夹结构
在存储桶中应该看到：
```
/
├── avatars/
│   └── {用户ID}/
│       └── avatar.jpg
├── bcs-standards/          ← 这个文件夹必须存在
│   └── BCS-chart.png       ← 文件名必须完全匹配（区分大小写）
├── recipe-covers/
│   └── {食谱ID}/
│       └── cover.jpg
└── recipes/
    └── {时间戳}-{随机ID}.jpg
```

#### 2.3 验证文件名

**重要：文件名区分大小写！**

| ✅ 正确示例 | ❌ 错误示例 |
|------------|------------|
| `BCS-chart.png` | `bcs-chart.png` |
| `BCS-chart.png` | `BCS-CHART.PNG` |
| `BCS-chart.png` | `bcs-Chart.png` |
| `BCS-chart.png` | `BCS chart.png` (有空格) |

---

### 步骤3：检查COS权限设置

#### 3.1 检查存储桶权限
1. 在COS控制台，点击存储桶名称
2. 进入"权限管理" → "存储桶ACL"
3. 确认权限为：**"公共读"** 或包含"所有人读"权限

#### 3.2 检查文件夹权限（可选）
1. 进入 `bcs-standards/` 文件夹
2. 点击文件夹，查看详情
3. 确认权限设置允许公共读取

---

### 步骤4：使用coscli验证文件（可选）

如果您已配置coscli工具：

```bash
# 列出bcs-standards文件夹内容
coscli ls cos://sevenkitchen-mvp-123-1392823718/ap-chengdu/bcs-standards/

# 应该看到：BCS-chart.png
```

---

## 🛠️ 常见问题修复

### 问题1：文件名不匹配
**症状：** 浏览器访问URL显示404

**解决方案：**
1. 在COS控制台中重命名文件为 `BCS-chart.png`
2. 或删除错误文件，重新上传并确保文件名正确

### 问题2：文件夹路径错误
**症状：** 浏览器访问URL显示404

**解决方案：**
1. 确认文件在 `bcs-standards/` 文件夹中
2. 不应在其他位置（如 `avatars/`、`images/` 等）

### 问题3：权限问题
**症状：** 浏览器显示"Access Denied"或"无权限"

**解决方案：**
1. 修改存储桶ACL为"公共读"
2. 或为 `bcs-standards/` 文件夹单独设置公共读权限

### 问题4：CDN缓存未刷新
**症状：** 刚上传后无法访问，等待几分钟后可以访问

**解决方案：**
- 等待5-10分钟让CDN缓存刷新
- 或在COS控制台中刷新CDN缓存

---

## 📝 上传图片的完整步骤

如果您还没上传或需要重新上传：

### 方法1：通过COS控制台上传（推荐）

1. **创建文件夹**
   - 进入存储桶根目录
   - 点击"新建文件夹"
   - 输入文件夹名：`bcs-standards`（全小写，有连字符）

2. **上传图片**
   - 进入 `bcs-standards` 文件夹
   - 点击"上传文件"
   - 选择您的BCS图片文件
   - **重要**：上传前确保文件名为 `BCS-chart.png`
     - BCS：大写
     - chart：小写
     - 连字符：-
     - 扩展名：.png（小写）

3. **验证上传**
   - 上传完成后，在浏览器中访问：
     ```
     https://img.sevenkitchen.cloud/bcs-standards/BCS-chart.png
     ```
   - 应该能看到图片

### 方法2：通过COSBrowser上传

1. 下载并安装COSBrowser
2. 使用以下配置登录：
   - SecretId: `AKIDoZ9YpvnRs8TcXGn7HEzYt0vdAVcXEhwz`
   - SecretKey: `ub3HKAmAOPDoCjAOQFtJVUIuJVXN0Pjs`
   - Region: `ap-chengdu`
   - Bucket: `sevenkitchen-mvp-123-1392823718`
3. 创建 `bcs-standards` 文件夹
4. 上传文件并确保文件名为 `BCS-chart.png`

---

## 🧪 修复后验证

### 1. 浏览器验证
访问：https://img.sevenkitchen.cloud/bcs-standards/BCS-chart.png
- ✅ 应该看到BCS图片

### 2. 小程序验证
1. 清除小程序缓存：项目 → 清除缓存 → 清除全部缓存
2. 重新编译：项目 → 编译
3. 进入"创建狗狗档案"页面
4. 点击"查看标准"按钮
5. ✅ 应该看到BCS图片而不是文字描述

### 3. 控制台验证
应该看到：
```
[BCS Guide] Opening BCS guide popup
[BCS Guide] Image loaded successfully
```

而不是：
```
[BCS Guide] Failed to load BCS guide image
```

---

## 📸 图片规格建议

- **格式**：PNG或JPG
- **尺寸**：建议宽度 750px - 1200px
- **文件大小**：建议 < 500KB
- **内容**：清晰的BCS 1-9分体态对比图

---

**最后更新**：2026-02-01
**问题状态**：待诊断
