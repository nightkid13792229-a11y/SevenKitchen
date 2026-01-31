# 数据库迁移说明

## 问题
生产数据库缺少 `recipe.is_custom_recipe` 字段，导致API返回500错误。

## 错误信息
```
The column 'recipe.is_custom_recipe' does not exist in the current database.
```

## 解决方案

### 方法1: 使用自动化脚本（推荐）

```bash
# 1. 进入后端目录
cd backend

# 2. 执行迁移脚本
bash prisma/migrations/20260130_add_is_custom_recipe/migration.sh
```

### 方法2: 手动执行 SQL

```bash
# 1. 连接到生产数据库
psql $DATABASE_URL

# 2. 执行以下SQL
ALTER TABLE "recipe" ADD COLUMN IF NOT EXISTS "is_custom_recipe" BOOLEAN NOT NULL DEFAULT false;

# 3. 创建索引（可选但推荐）
CREATE INDEX IF NOT EXISTS "recipe_is_custom_recipe_idx" ON "recipe"("is_custom_recipe");

# 4. 验证
\d recipe

# 5. 退出
\q
```

### 方法3: 使用 Prisma Studio（如果可用）

```bash
cd backend
npx prisma studio
# 在浏览器中手动添加字段
```

## 验证迁移成功

执行以下命令验证字段已添加：

```bash
psql $DATABASE_URL -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'recipe' AND column_name = 'is_custom_recipe';"
```

预期输出：
```
 column_name      | data_type
------------------+-----------
 is_custom_recipe | boolean
```

## 迁移后操作

1. **重启后端服务**（如果正在运行）
   ```bash
   # 如果使用 PM2
   pm2 restart backend

   # 或使用 systemd
   sudo systemctl restart sevenkitchen-backend
   ```

2. **测试API**
   ```bash
   curl https://api.sevenkitchen.cloud/api/v1/recipes
   ```

3. **检查小程序**
   - 重新编译小程序
   - 刷新首页
   - 验证食谱列表能正常加载

## 回滚（如果需要）

如果需要回滚此迁移：

```sql
ALTER TABLE "recipe" DROP COLUMN IF EXISTS "is_custom_recipe";
DROP INDEX IF EXISTS "recipe_is_custom_recipe_idx";
```

## 注意事项

- ⚠️ 此迁移会修改生产数据库结构
- ✅ 使用 `IF NOT EXISTS` 确保幂等性
- ✅ 设置默认值 `false` 避免破坏现有数据
- ✅ 创建索引提高查询性能

## 支持

如果遇到问题，请检查：
1. DATABASE_URL 环境变量是否正确
2. 数据库连接是否正常
3. 是否有足够的权限执行 DDL 操作
