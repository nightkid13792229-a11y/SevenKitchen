# 腾讯云对象存储(COS)配置指南

## 📋 目录
1. [创建腾讯云COS存储桶](#1-创建腾讯云cos存储桶)
2. [获取访问密钥](#2-获取访问密钥)
3. [配置后端环境变量](#3-配置后端环境变量)
4. [安装SDK依赖](#4-安装sdk依赖)
5. [配置CORS跨域](#5-配置cors跨域)

---

## 1. 创建腾讯云COS存储桶

### 1.1 登录腾讯云控制台
访问：https://console.cloud.tencent.com/cos

### 1.2 创建存储桶
1. 点击 **【创建存储桶】**
2. 配置以下参数：
   - **存储桶名称**: `sevenkitchen-prod` (必须全局唯一)
   - **所属地域**: 选择离用户最近的地域（如：上海-ap-shanghai）
   - **访问权限**: **私有读写**
   - **存储类型**: 标准存储
   - **版本控制**: 不开启

### 1.3 记录关键信息
创建成功后，记录以下信息：
```
存储桶名称: sevenkitchen-prod-1234567890
所属地域: ap-shanghai
访问域名: https://sevenkitchen-prod-1234567890.cos.ap-shanghai.myqcloud.com
```

---

## 2. 获取访问密钥

### 2.1 创建API密钥
1. 访问：https://console.cloud.tencent.com/cam/capi
2. 点击 **【创建密钥】**
3. 记录以下信息：
   ```
   SecretId: AKIDxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   SecretKey: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

### 2.2 创建子账号（推荐）
为了安全，建议创建子账号并授予COS权限：

1. 访问：https://console.cloud.tencent.com/cam
2. 点击 **【用户列表】** → **【新建用户】**
3. 选择 **【可编程访问】**
4. 授予权限策略：`QCloudCOSFullAccess` 或自定义权限

---

## 3. 配置后端环境变量

### 3.1 创建 .env 配置
在 `backend/.env` 中添加以下配置：

```bash
# 腾讯云COS配置
TENCENT_COS_SECRET_ID=AKIDxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TENCENT_COS_SECRET_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TENCENT_COS_BUCKET=sevenkitchen-prod-1234567890
TENCENT_COS_REGION=ap-shanghai
TENCENT_COS_DOMAIN=https://sevenkitchen-prod-1234567890.cos.ap-shanghai.myqcloud.com
```

### 3.2 环境变量说明
| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| TENCENT_COS_SECRET_ID | 腾讯云访问密钥ID | AKIDxxxxx |
| TENCENT_COS_SECRET_KEY | 腾讯云访问密钥Key | xxxxxxxx |
| TENCENT_COS_BUCKET | 存储桶名称 | sevenkitchen-prod-1234567890 |
| TENCENT_COS_REGION | 所在地域 | ap-shanghai |
| TENCENT_COS_DOMAIN | 访问域名 | https://xxx.cos.ap-shanghai.myqcloud.com |

---

## 4. 安装SDK依赖

### 4.1 后端SDK
```bash
cd backend
npm install --save @tencent-cloud/cos-sdk
npm install --save @nestjs/config
npm install --save multer
npm install --save @types/multer -D
```

### 4.2 小程序SDK（可选）
小程序端直接通过后端API上传，无需安装COS SDK

---

## 5. 配置CORS跨域

### 5.1 为什么需要CORS
由于小程序通过前端直接调用COS接口，需要配置跨域资源共享。

### 5.2 配置步骤
1. 进入存储桶配置 → **基础配置** → **跨域CORS设置**
2. 点击 **【添加规则】**
3. 配置规则：
   ```
   来源: * (生产环境建议指定具体域名)
   允许的Method: GET, POST, PUT, DELETE, HEAD
   允许的Header: *
   暴露的Header: ETag
   超时时间: 600秒
   ```

---

## 6. 文件目录结构规划

### 6.1 推荐的目录结构
```
sevenkitchen-prod-1234567890/
├── production-photos/          # 生产备料照片
│   ├── 2026/01/09/            # 按日期归档
│   └── {orderId}/             # 按订单ID归档
├── aftersale-photos/           # 售后凭证图片
│   ├── 2026/01/09/
│   └── {orderId}/
├── recipe-images/             # 食谱图片
└── user-uploads/              # 其他用户上传
```

---

## 7. 安全建议

### 7.1 访问控制
- ✅ 使用私有读写存储桶
- ✅ 通过后端API生成临时签名URL
- ✅ 设置图片URL过期时间（默认1小时）

### 7.2 内容审核
- 开启内容审核功能，自动检测违规图片
- 配置审核规则：色情、暴力、政治等

### 7.3 成本优化
- 设置生命周期规则，自动删除旧文件
- 开启智能压缩，降低存储成本
- 使用CDN加速，降低流量成本

---

## 8. 测试验证

### 8.1 上传测试
使用后端API测试上传：
```bash
curl -X POST http://localhost:3000/api/v1/upload \
  -H "Content-Type: multipart/form-data" \
  -F "file=@test.jpg" \
  -F "category=production-photos"
```

### 8.2 访问测试
访问返回的URL，确认图片可以正常访问：
```bash
curl https://sevenkitchen-prod-1234567890.cos.ap-shanghai.myqcloud.com/production-photos/test.jpg
```

---

## 9. 故障排查

### 问题1：上传失败 "Access Denied"
- 检查密钥是否正确
- 确认存储桶权限设置为私有读写
- 验证子账号是否有COS权限

### 问题2：CORS错误
- 确认CORS规则已配置
- 检查来源域名是否正确
- 清除浏览器缓存重试

### 问题3：图片无法访问
- 确认URL路径正确
- 检查文件是否成功上传
- 验证存储桶是否存在

---

## 10. 相关文档
- [腾讯云COS官方文档](https://cloud.tencent.com/document/product/436)
- [Node.js SDK使用指南](https://cloud.tencent.com/document/product/436/8629)
- [CORS配置说明](https://cloud.tencent.com/document/product/436/15383)

---

**配置完成后，请继续阅读后端API实现文档。**
