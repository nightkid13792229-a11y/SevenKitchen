# 腾讯云COS快速配置指南

> **极简MVP版本** - 10分钟配置完成

---

## 📋 前置条件

- 已有腾讯云账号（如果没有，访问 https://cloud.tencent.com 注册）

---

## ⚡ 快速配置（10分钟）

### 步骤1：创建COS存储桶（3分钟）

1. 访问腾讯云控制台：https://console.cloud.tencent.com/cos5
2. 点击【创建存储桶】
3. 填写配置：
   - **存储桶名称**：`sevenkitchen-xxxx`（xxxx可以用随机数字，例如：sevenkitchen-mvp-123）
   - **所属地域**：选择【广州】（ap-guangzhou）
   - **访问权限**：选择【私有读写】
4. 点击【创建】完成

> ✅ 完成后，存储桶列表会显示新创建的存储桶

---

### 步骤2：获取访问密钥（2分钟）

1. 访问：https://console.cloud.tencent.com/capi
2. 如果是第一次使用，点击【创建密钥】
3. 复制以下两个值：
   - **SecretId**：类似 `AKIDxxxxxxxxxxxxxxxx`
   - **SecretKey**：类似 `xxxxxxxxxxxxxxxx`

> ⚠️ **重要提示**：密钥只会显示一次，请立即保存！

---

### 步骤3：配置后端环境变量（1分钟）

在 `backend/.env` 文件末尾添加以下内容：

```env
# 腾讯云COS配置
COS_SECRET_ID=你的SecretId
COS_SECRET_KEY=你的SecretKey
COS_BUCKET=sevenkitchen-xxxx-ap-guangzhou
COS_REGION=ap-guangzhou
```

**说明：**
- `COS_SECRET_ID`：步骤2复制的SecretId
- `COS_SECRET_KEY`：步骤2复制的SecretKey
- `COS_BUCKET`：存储桶名称（格式：`名称-地域`，例如 `sevenkitchen-mvp-123-ap-guangzhou`）
- `COS_REGION`：地域代码，广州是 `ap-guangzhou`

---

### 步骤4：重启后端服务（1分钟）

```bash
# 如果后端服务正在运行，先停止
# 然后重新启动
cd backend
npm run start:dev
```

检查启动日志，如果没有看到 "Missing COS credentials" 的警告，说明配置成功！

---

## ✅ 测试上传功能

### 测试1：食谱封面上传

```bash
# 使用Postman或curl测试
POST http://localhost:3000/api/v1/admin/recipes/upload-image
Content-Type: multipart/form-data
X-Admin-Token: 你的管理员token

# 上传一个图片文件
```

### 测试2：过敏记录上传

```bash
POST http://localhost:3000/api/v1/health/upload-image
Content-Type: multipart/form-data
X-Customer-Id: 你的用户ID

# 上传过敏记录PDF或图片
```

### 测试3：狗狗头像上传

```bash
POST http://localhost:3000/api/v1/dogs/{dogId}/avatar
Content-Type: multipart/form-data
X-Customer-Id: 你的用户ID

# 上传狗狗头像图片
```

---

## 📁 文件存储结构

上传的文件会自动存储在以下结构中：

```
your-bucket/
├── recipes/           # 食谱图片
│   └── xxxxxx.jpg
├── allergy-records/   # 过敏记录
│   └── xxxxxx.pdf
└── dogs/
    └── avatars/       # 狗狗头像
        └── xxxxxx.jpg
```

文件名自动生成格式：`时间戳-随机数.扩展名`

---

## 🔧 常见问题

### Q1: 上传时提示"CORS错误"

**解决方案：**
1. 进入存储桶配置 → 基础配置 → 跨域访问CORS
2. 点击【添加规则】
3. 配置：
   - 来源：`*`
   - 允许Methods：`GET, POST, PUT`
   - 允许Headers：`*`
   - 暴露Headers：留空
   - 超时时间：`3600`
4. 点击【提交】

### Q2: 上传后无法访问图片URL

**原因：** 存储桶设置为私有读写

**解决方案：**
- 小程序端可以直接使用返回的URL访问
- 如需公开访问，可进入存储桶配置 → 权限管理 → 存储桶访问权限 → 修改为【公共读】

### Q3: 提示"Missing COS credentials"

**原因：** 环境变量未配置或配置错误

**解决方案：**
1. 检查 `.env` 文件是否添加了COS配置
2. 检查密钥是否正确
3. 确认已重启后端服务

### Q4: 文件上传失败

**检查清单：**
- [ ] 存储桶名称格式是否正确（需包含地域）
- [ ] SecretId 和 SecretKey 是否正确
- [ ] 文件大小是否超限（图片5MB，PDF 10MB）
- [ ] 文件类型是否支持（jpg, png, gif, webp, pdf）

---

## 💰 成本估算（参考）

| 资源 | 单价 | 月用量估算 | 月成本 |
|------|------|-----------|--------|
| 存储空间 | ¥0.118/GB/月 | 10GB | ¥1.18 |
| 流量费用 | ¥0.21/GB | 20GB | ¥4.20 |
| 请求次数 | 100万次/月免费 | 10万次 | ¥0 |
| **合计** | - | - | **约¥5/月** |

> 实际费用根据使用量计算，可在腾讯云控制台查看详细账单

---

## 🚀 下一步（可选）

配置完成后，您可以考虑：

1. **绑定自定义域名**（CDN加速）
   - 如果有已备案的域名，可以配置CDN加速访问
   - 需要在CDN控制台添加域名并解析

2. **设置生命周期管理**
   - 自动删除临时文件
   - 降低长期存储成本

3. **开启版本控制**
   - 防止误删除
   - 支持文件回滚

---

## 📞 技术支持

如遇到问题，可以：
- 查看腾讯云COS文档：https://cloud.tencent.com/document/product/436
- 联系腾讯云技术支持
- 检查后端日志：`console.log` 输出的错误信息

---

**配置完成！现在可以使用图片上传功能了！** 🎉
