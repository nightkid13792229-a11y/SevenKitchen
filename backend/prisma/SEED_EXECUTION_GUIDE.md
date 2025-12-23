# 200品种数据库写入执行指南

## 📋 数据概览

- **总品种数**: 200个
- **数据来源**: AKC (American Kennel Club)
- **分类标准**: AAHA (American Animal Hospital Association)
- **命名格式**: 中文 (English Name)
- **排序方式**: 按中国大陆常见程度排序

## 📊 品种分布统计

| 体型分类 | 数量 | 成熟月龄 | 老龄年龄 | 体重范围 |
|---------|------|----------|----------|----------|
| SMALL (小型) | ~85 | 10个月 | 11年 | < 10kg |
| MEDIUM (中型) | ~60 | 12个月 | 10年 | 10-25kg |
| LARGE (大型) | ~40 | 18个月 | 8年 | 25-45kg |
| GIANT (巨型) | ~15 | 24个月 | 7年 | > 45kg |

## 🎯 Top 20 常见品种（中国）

1. 拉布拉多 (Labrador Retriever) - LARGE
2. 泰迪 (Toy Poodle) - SMALL
3. 贵宾犬 (Miniature Poodle) - SMALL
4. 贵宾犬 (Standard Poodle) - LARGE
5. 金毛 (Golden Retriever) - LARGE
6. 比熊 (Bichon Frise) - SMALL
7. 哈士奇 (Siberian Husky) - MEDIUM
8. 德牧 (German Shepherd Dog) - LARGE
9. 边牧 (Border Collie) - MEDIUM
10. 柯基 (Pembroke Welsh Corgi) - SMALL
11. 萨摩耶 (Samoyed) - MEDIUM
12. 法国斗牛犬 (French Bulldog) - SMALL
13. 吉娃娃 (Chihuahua) - SMALL
14. 博美 (Pomeranian) - SMALL
15. 雪纳瑞 (Miniature Schnauzer) - SMALL
16. 约克夏 (Yorkshire Terrier) - SMALL
17. 马尔济斯 (Maltese) - SMALL
18. 腊肠犬 (Dachshund) - SMALL
19. 阿拉斯加 (Alaskan Malamute) - LARGE
20. 杜宾 (Doberman Pinscher) - LARGE

## 🔄 执行步骤

### Step 1: 备份现有数据库

```bash
# SSH到云服务器
ssh root@1.14.3.2

# 备份PostgreSQL数据库
pg_dump -U postgres sevenkitchen > /root/sevenkitchen_backup_$(date +%Y%m%d_%H%M%S).sql

# 验证备份文件
ls -lh /root/sevenkitchen_backup_*.sql
```

### Step 2: 检查当前品种表状态

```bash
# 连接数据库
psql -U postgres -d sevenkitchen

# 查看当前品种数量
SELECT COUNT(*) FROM "DogBreed";

# 查看现有品种
SELECT id, name, "sizeCategory" FROM "DogBreed" ORDER BY name;

# 退出数据库
\q
```

### Step 3: 备份现有seed脚本

```bash
cd /opt/sevenkitchen/SevenKitchen/backend/prisma
cp seed-dog-breeds.ts seed-dog-breeds.backup.ts
```

### Step 4: 上传新的seed脚本

```bash
# 在本地执行（从本地上传到服务器）
scp /Users/zhaochen/Documents/SevenKitchen/backend/prisma/seed-dog-breeds-200.ts \
    root@1.14.3.2:/opt/sevenkitchen/SevenKitchen/backend/prisma/
```

### Step 5: 清空现有品种表（可选）

**选项A - 保留现有数据，仅添加新品种（推荐）**
- 现有脚本已包含跳过逻辑，不会重复创建

**选项B - 清空后重新导入**
```bash
psql -U postgres -d sevenkitchen -c "TRUNCATE TABLE \"DogBreed\" RESTART IDENTITY CASCADE;"
```

### Step 6: 执行seed脚本

```bash
cd /opt/sevenkitchen/SevenKitchen/backend

# 编译并执行seed脚本
npx ts-node prisma/seed-dog-breeds-200.ts
```

### Step 7: 验证数据导入

```bash
# 连接数据库验证
psql -U postgres -d sevenkitchen

# 检查总数
SELECT COUNT(*) FROM "DogBreed";

# 检查各体型分类数量
SELECT "sizeCategory", COUNT(*) FROM "DogBreed" GROUP BY "sizeCategory";

# 检查Top 5品种
SELECT name, "sizeCategory", "averageAdultWeightKg"
FROM "DogBreed"
ORDER BY id
LIMIT 5;

# 退出数据库
\q
```

### Step 8: 测试前端品种选择器

```bash
# 在微信开发者工具中测试
# 1. 打开小程序
# 2. 进入"创建狗狗档案"页面
# 3. 点击"品种"选择器
# 4. 验证是否显示200个品种
# 5. 选择不同品种，验证体型自动匹配
```

### Step 9: 测试体型自动匹配

选择以下品种测试：

| 测试品种 | 预期体型 | 成熟月龄 |
|---------|---------|----------|
| 吉娃娃 | SMALL | 10个月 |
| 柯基 | SMALL | 10个月 |
| 边牧 | MEDIUM | 12个月 |
| 金毛 | LARGE | 18个月 |
| 大丹犬 | GIANT | 24个月 |

### Step 10: 前端验证步骤

1. 打开微信开发者工具
2. 进入狗狗档案创建页面
3. 选择品种"吉娃娃" → 自动匹配 SMALL 体型
4. 查看试算结果中的RER/DER计算
5. 测试体型覆盖功能：
   - 手动选择体型为"LARGE"
   - 验证覆盖是否生效

## 🔄 回滚方案

### 方案A - 恢复数据库备份

```bash
# 如果出现严重问题，从备份恢复
psql -U postgres -d sevenkitchen < /root/sevenkitchen_backup_YYYYMMDD_HHMMSS.sql
```

### 方案B - 恢复原seed脚本

```bash
cd /opt/sevenkitchen/SevenKitchen/backend/prisma
cp seed-dog-breeds.backup.ts seed-dog-breeds.ts
npx ts-node prisma/seed-dog-breeds.ts
```

### 方案C - 手动删除新导入的品种

```bash
psql -U postgres -d sevenkitchen
DELETE FROM "DogBreed" WHERE id > (SELECT id FROM "DogBreed" ORDER BY id LIMIT 1 OFFSET 9);
```

## ✅ 验证清单

- [ ] 数据库备份完成
- [ ] 当前品种数量记录
- [ ] Seed脚本上传成功
- [ ] Seed脚本执行无错误
- [ ] 导入后品种总数 = 200
- [ ] 各体型分类分布合理
- [ ] 前端品种选择器显示正常
- [ ] 体型自动匹配测试通过
- [ ] 体型覆盖功能测试通过

## 📞 问题排查

### 问题1: Seed脚本执行失败

**错误信息**: `Cannot find module '@prisma/client'`
```bash
cd /opt/sevenkitchen/SevenKitchen/backend
npm install
npx prisma generate
```

### 问题2: 数据库连接失败

**错误信息**: `Connection refused`
```bash
# 检查PostgreSQL服务状态
systemctl status postgresql

# 启动PostgreSQL
systemctl start postgresql
```

### 问题3: 前端显示旧数据

**解决方案**: 清除小程序缓存
```javascript
// 在微信开发者工具中
// 清除缓存 → 清除数据缓存
```

## 📝 注意事项

1. **数据一致性**: 新seed脚本使用`name`字段检查重复，不会覆盖现有品种
2. **ID自增**: 每个品种会自动生成唯一UUID
3. **时间戳**: `createdAt`和`updatedAt`自动生成
4. **体型计算**: 后端根据品种的`sizeCategory`自动计算，无需手动设置
5. **中文支持**: 数据库使用UTF-8编码，支持中文品种名

## 🎉 预期结果

执行成功后：
- 数据库中有200个品种记录
- 前端品种选择器显示完整的200个选项
- 选择品种后，体型自动匹配（可手动覆盖）
- RER/DER计算使用正确的体型参数

---

**执行日期**: 待定
**执行人**: 待定
**审核人**: 待定
