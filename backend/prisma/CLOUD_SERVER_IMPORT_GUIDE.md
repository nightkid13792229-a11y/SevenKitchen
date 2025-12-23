# 200品种数据库导入 - 云服务器执行指南

## 准备工作

### 1. 备份数据库
```bash
ssh root@1.14.3.2

# 备份数据库
pg_dump -U postgres sevenkitchen > /root/sevenkitchen_backup_$(date +%Y%m%d_%H%M%S).sql

# 验证备份
ls -lh /root/sevenkitchen_backup_*.sql
```

### 2. 上传seed脚本到服务器

在**本地机器**执行：
```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
scp prisma/seed-dog-breeds-200.ts root@1.14.3.2:/opt/sevenkitchen/SevenKitchen/backend/prisma/
```

### 3. 清空现有品种表

在**云服务器**执行：
```bash
# 连接到数据库
psql -U postgres -d sevenkitchen

# 清空品种表（不保留现有10个品种）
TRUNCATE TABLE "DogBreed" RESTART IDENTITY CASCADE;

# 退出数据库
\q
```

### 4. 执行seed脚本

在**云服务器**执行：
```bash
cd /opt/sevenkitchen/SevenKitchen/backend

# 编译并执行seed脚本
npx ts-node prisma/seed-dog-breeds-200.ts
```

**预期输出**：
```
🌱 Seeding 200 dog breeds...
✅ Created breed: 拉布拉多 (uuid)
✅ Created breed: 泰迪 (uuid)
...
✨ 200 breed seeding completed!
```

### 5. 验证导入结果

```bash
# 连接数据库验证
psql -U postgres -d sevenkitchen

-- 检查总数
SELECT COUNT(*) FROM "DogBreed";

-- 检查各体型分类数量
SELECT "sizeCategory", COUNT(*) FROM "DogBreed" GROUP BY "sizeCategory";

-- 查看Top 5品种
SELECT name, "sizeCategory", "averageAdultWeightKg"
FROM "DogBreed"
ORDER BY id
LIMIT 5;

-- 退出数据库
\q
```

### 6. 测试前端品种选择器

1. 打开微信开发者工具
2. 进入"创建狗狗档案"页面
3. 点击"品种"选择器
4. 验证是否显示200个品种
5. 选择不同品种，验证体型自动匹配

## 回滚方案（如需恢复）

```bash
# 从备份恢复
psql -U postgres -d sevenkitchen < /root/sevenkitchen_backup_YYYYMMDD_HHMMSS.sql
```

## 验证清单

- [ ] 数据库备份完成
- [ ] Seed脚本上传成功
- [ ] 现有品种表已清空
- [ ] Seed脚本执行成功，创建了200个品种
- [ ] 导入后品种总数 = 200
- [ ] 各体型分类分布合理
- [ ] 前端品种选择器显示正常
- [ ] 体型自动匹配测试通过

---

**执行日期**: 2025-12-23
**执行人**: 待执行
**状态**: 等待手动执行
