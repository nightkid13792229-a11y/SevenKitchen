#!/bin/bash

###############################################################################
# 数据库迁移脚本：WAITING_FOR_PRODUCTION → PURCHASING
#
# 功能：
# 1. 备份数据库
# 2. 执行状态迁移
# 3. 验证迁移结果
# 4. 生成迁移报告
#
# 使用方法：
#   cd backend
#   chmod +x scripts/migrate-to-purchasing.sh
#   ./scripts/migrate-to-purchasing.sh
#
# 环境要求：
# - PostgreSQL 客户端工具（psql）
# - 数据库连接权限
###############################################################################

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置
DB_NAME="${DB_NAME:-sevenkitchen}"
DB_USER="${DB_USER:-postgres}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/pre_migration_${TIMESTAMP}.sql"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}订单状态迁移：WAITING_FOR_PRODUCTION → PURCHASING${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 1. 检查环境
echo -e "${YELLOW}[步骤 1/6] 检查环境...${NC}"
if ! command -v psql &> /dev/null; then
    echo -e "${RED}错误: 未找到 psql 命令，请先安装 PostgreSQL 客户端${NC}"
    exit 1
fi

# 检查数据库连接
if ! PGPASSWORD=${PGPASSWORD} psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d postgres -c '\q' 2>/dev/null; then
    echo -e "${RED}错误: 无法连接到数据库，请检查连接参数${NC}"
    exit 1
fi
echo -e "${GREEN}✓ 环境检查通过${NC}"
echo ""

# 2. 创建备份目录
echo -e "${YELLOW}[步骤 2/6] 创建备份目录...${NC}"
mkdir -p ${BACKUP_DIR}
echo -e "${GREEN}✓ 备份目录: ${BACKUP_DIR}${NC}"
echo ""

# 3. 备份数据库
echo -e "${YELLOW}[步骤 3/6] 备份数据库...${NC}"
echo "备份文件: ${BACKUP_FILE}"

PGPASSWORD=${PGPASSWORD} pg_dump -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} \
    --format=plain \
    --no-owner \
    --no-acl \
    --verbose \
    ${DB_NAME} > ${BACKUP_FILE} 2>&1 | grep -v "SECURITY:"

if [ $? -eq 0 ]; then
    BACKUP_SIZE=$(du -h ${BACKUP_FILE} | cut -f1)
    echo -e "${GREEN}✓ 数据库备份成功 (${BACKUP_SIZE})${NC}"
else
    echo -e "${RED}✗ 数据库备份失败${NC}"
    exit 1
fi
echo ""

# 4. 执行前验证
echo -e "${YELLOW}[步骤 4/6] 执行前验证...${NC}"

# 检查是否有订单处于旧状态
OLD_COUNT=$(PGPASSWORD=${PGPASSWORD} psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} -t -c "
    SELECT COUNT(*) FROM \"Order\" WHERE status = 'WAITING_FOR_PRODUCTION';
" 2>/dev/null | tr -d ' ')

echo "当前 WAITING_FOR_PRODUCTION 状态的订单数量: ${OLD_COUNT}"

if [ "${OLD_COUNT}" -eq "0" ]; then
    echo -e "${YELLOW}⚠ 警告: 没有订单处于 WAITING_FOR_PRODUCTION 状态${NC}"
    read -p "是否继续迁移? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "迁移已取消"
        exit 0
    fi
fi
echo ""

# 5. 执行迁移
echo -e "${YELLOW}[步骤 5/6] 执行数据库迁移...${NC}"

# 执行迁移SQL
PGPASSWORD=${PGPASSWORD} psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} << 'EOF'
-- 开始事务
BEGIN;

-- 记录迁移开始
DO $$
DECLARE
    old_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO old_count FROM "Order" WHERE status = 'WAITING_FOR_PRODUCTION';
    RAISE NOTICE '开始迁移：% 个订单需要更新状态', old_count;
END $$;

-- 更新订单表
UPDATE "Order" SET status = 'PURCHASING' WHERE status = 'WAITING_FOR_PRODUCTION';

-- 更新订单状态历史表
UPDATE "OrderStatusHistory" SET "fromStatus" = 'PURCHASING' WHERE "fromStatus" = 'WAITING_FOR_PRODUCTION';
UPDATE "OrderStatusHistory" SET "toStatus" = 'PURCHASING' WHERE "toStatus" = 'WAITING_FOR_PRODUCTION';

-- 记录迁移完成
DO $$
DECLARE
    new_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO new_count FROM "Order" WHERE status = 'PURCHASING';
    RAISE NOTICE '迁移完成：% 个订单已更新为 PURCHASING 状态', new_count;
END $$;

-- 提交事务
COMMIT;

-- 验证结果
DO $$
DECLARE
    remaining_old INTEGER;
    new_count INTEGER;
BEGIN
    -- 检查是否还有旧状态
    SELECT COUNT(*) INTO remaining_old FROM "Order" WHERE status = 'WAITING_FOR_PRODUCTION';
    SELECT COUNT(*) INTO new_count FROM "Order" WHERE status = 'PURCHASING';

    IF remaining_old > 0 THEN
        RAISE EXCEPTION '迁移失败：仍有 % 个订单处于 WAITING_FOR_PRODUCTION 状态', remaining_old;
    END IF;

    RAISE NOTICE '验证通过：所有订单状态已成功迁移';
    RAISE NOTICE 'PURCHASING 状态订单总数：%', new_count;
END $$;
EOF

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ 数据库迁移成功${NC}"
else
    echo -e "${RED}✗ 数据库迁移失败${NC}"
    echo ""
    echo "正在回滚备份..."
    PGPASSWORD=${PGPASSWORD} psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d postgres -c "DROP DATABASE IF EXISTS ${DB_NAME};"
    PGPASSWORD=${PGPASSWORD} psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d postgres -c "CREATE DATABASE ${DB_NAME};"
    PGPASSWORD=${PGPASSWORD} psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} < ${BACKUP_FILE} > /dev/null
    echo -e "${GREEN}✓ 数据库已回滚到迁移前状态${NC}"
    exit 1
fi
echo ""

# 6. 生成迁移报告
echo -e "${YELLOW}[步骤 6/6] 生成迁移报告...${NC}"

REPORT_FILE="${BACKUP_DIR}/migration_report_${TIMESTAMP}.txt"

PGPASSWORD=${PGPASSWORD} psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} -t -c "
SELECT '=== 订单状态分布 ===' as header;
SELECT status || ': ' || COUNT(*) as distribution
FROM \"Order\"
GROUP BY status
ORDER BY status;

SELECT '' as blank;
SELECT '=== 订单状态历史统计 ===' as header;
SELECT \"fromStatus\" || ' → ' || \"toStatus\" || ': ' || COUNT(*) as transitions
FROM \"OrderStatusHistory\"
GROUP BY \"fromStatus\", \"toStatus\"
ORDER BY \"fromStatus\", \"toStatus\";
" > ${REPORT_FILE} 2>&1

echo -e "${GREEN}✓ 迁移报告已生成: ${REPORT_FILE}${NC}"
echo ""

# 完成
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}迁移完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "备份文件: ${BACKUP_FILE}"
echo "迁移报告: ${REPORT_FILE}"
echo ""
echo -e "${YELLOW}下一步操作：${NC}"
echo "1. 验证应用功能正常"
echo "2. 检查日志确认无错误"
echo "3. 如果一切正常，7天后可删除备份文件"
echo ""
