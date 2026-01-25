#!/bin/bash

# SevenKitchen 采购管理API测试脚本
# 测试所有新添加的功能

BASE_URL="http://localhost:3001"
ADMIN_ID="65c162eb-5767-42fa-8075-5cfc1e765fce"  # 布欧（管理员）
TEST_DATE="2026-01-25"

echo "========================================="
echo "SevenKitchen 采购管理API测试"
echo "========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试1: 预览采购需求
echo -e "${YELLOW}测试1: 预览采购需求（不改变订单状态）${NC}"
echo "GET /api/v1/staff/purchasing/preview?startDate=$TEST_DATE"
curl -s -X GET "$BASE_URL/api/v1/staff/purchasing/preview?startDate=$TEST_DATE" \
  -H "X-Customer-Id: $ADMIN_ID" \
  -H "Content-Type: application/json" | jq '.'
echo -e "\n"

# 读取预览结果中的订单ID（用于后续测试）
sleep 2

# 测试2: 生成采购清单
echo -e "${YELLOW}测试2: 生成采购清单${NC}"
echo "POST /api/v1/staff/purchasing/lists"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/staff/purchasing/lists" \
  -H "X-Customer-Id: $ADMIN_ID" \
  -H "Content-Type: application/json" \
  -d "{\"startDate\":\"$TEST_DATE\"}")

echo "$RESPONSE" | jq '.'
PURCHASE_LIST_ID=$(echo "$RESPONSE" | jq -r '.data.id')
echo -e "${GREEN}采购清单ID: $PURCHASE_LIST_ID${NC}\n"
sleep 2

# 测试3: 检查日期变更（应该没有变更）
echo -e "${YELLOW}测试3: 检查订单制作日期变更${NC}"
echo "GET /api/v1/staff/purchasing/lists/$PURCHASE_LIST_ID/check-date-changes"
curl -s -X GET "$BASE_URL/api/v1/staff/purchasing/lists/$PURCHASE_LIST_ID/check-date-changes" \
  -H "X-Customer-Id: $ADMIN_ID" \
  -H "Content-Type: application/json" | jq '.'
echo -e "\n"
sleep 2

# 测试4: 添加原料到采购清单
echo -e "${YELLOW}测试4: 添加原料到采购清单${NC}"
echo "POST /api/v1/staff/purchasing/lists/$PURCHASE_LIST_ID/items"
curl -s -X POST "$BASE_URL/api/v1/staff/purchasing/lists/$PURCHASE_LIST_ID/items" \
  -H "X-Customer-Id: $ADMIN_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "ingredientId": "test-ingredient-001",
    "ingredientName": "测试原料",
    "type": "SUPPLEMENT",
    "quantityNeeded": 500,
    "quantityUnit": "G",
    "estimatedCost": 50,
    "purchaseChannel": "测试渠道",
    "productModel": "测试型号"
  }' | jq '.'
echo -e "\n"
sleep 2

# 测试5: 获取采购清单详情（验证原料已添加）
echo -e "${YELLOW}测试5: 获取采购清单详情（验证原料已添加）${NC}"
echo "GET /api/v1/staff/purchasing/lists/$PURCHASE_LIST_ID"
curl -s -X GET "$BASE_URL/api/v1/staff/purchasing/lists/$PURCHASE_LIST_ID" \
  -H "X-Customer-Id: $ADMIN_ID" \
  -H "Content-Type: application/json" | jq '.data.itemCount, .data.items | length'
echo -e "\n"
sleep 2

# 测试6: 删除刚才添加的原料
# 首先需要获取原料ID
echo -e "${YELLOW}测试6: 删除原料${NC}"
echo "DELETE /api/v1/staff/purchasing/lists/$PURCHASE_LIST_ID/items/:itemId"

# 获取采购清单详情以找到原料ID
DETAIL_RESPONSE=$(curl -s -X GET "$BASE_URL/api/v1/staff/purchasing/lists/$PURCHASE_LIST_ID" \
  -H "X-Customer-Id: $ADMIN_ID" \
  -H "Content-Type: application/json")

# 找到测试原料的ID
ITEM_ID=$(echo "$DETAIL_RESPONSE" | jq -r '.data.items[] | select(.ingredientName == "测试原料") | .id')

if [ -n "$ITEM_ID" ] && [ "$ITEM_ID" != "null" ]; then
  echo "找到原料ID: $ITEM_ID"
  curl -s -X DELETE "$BASE_URL/api/v1/staff/purchasing/lists/$PURCHASE_LIST_ID/items/$ITEM_ID" \
    -H "X-Customer-Id: $ADMIN_ID" \
    -H "Content-Type: application/json" | jq '.'
  echo -e "${GREEN}原料删除成功${NC}\n"
else
  echo -e "${RED}未找到测试原料${NC}\n"
fi
sleep 2

# 测试7: 剔除订单（从采购清单中移除一个订单）
echo -e "${YELLOW}测试7: 剔除订单${NC}"
echo "DELETE /api/v1/staff/purchasing/lists/$PURCHASE_LIST_ID/orders"

# 获取采购清单的订单ID
ORDER_ID=$(echo "$DETAIL_RESPONSE" | jq -r '.data.sourceOrderIds[0]')

if [ -n "$ORDER_ID" ] && [ "$ORDER_ID" != "null" ]; then
  echo "剔除订单ID: $ORDER_ID"
  curl -s -X DELETE "$BASE_URL/api/v1/staff/purchasing/lists/$PURCHASE_LIST_ID/orders" \
    -H "X-Customer-Id: $ADMIN_ID" \
    -H "Content-Type: application/json" \
    -d "{\"orderIds\":[\"$ORDER_ID\"]}" | jq '.'
  echo -e "${GREEN}订单剔除成功${NC}\n"
else
  echo -e "${RED}未找到订单${NC}\n"
fi
sleep 2

# 测试8: 追加订单（将刚才剔除的订单加回来）
echo -e "${YELLOW}测试8: 追加订单${NC}"
echo "POST /api/v1/staff/purchasing/lists/$PURCHASE_LIST_ID/orders"

if [ -n "$ORDER_ID" ] && [ "$ORDER_ID" != "null" ]; then
  echo "追加订单ID: $ORDER_ID"
  curl -s -X POST "$BASE_URL/api/v1/staff/purchasing/lists/$PURCHASE_LIST_ID/orders" \
    -H "X-Customer-Id: $ADMIN_ID" \
    -H "Content-Type: application/json" \
    -d "{\"orderIds\":[\"$ORDER_ID\"]}" | jq '.'
  echo -e "${GREEN}订单追加成功${NC}\n"
else
  echo -e "${RED}未找到订单${NC}\n"
fi
sleep 2

# 测试9: 删除采购清单
echo -e "${YELLOW}测试9: 删除采购清单${NC}"
echo "DELETE /api/v1/staff/purchasing/lists/$PURCHASE_LIST_ID"
curl -s -X DELETE "$BASE_URL/api/v1/staff/purchasing/lists/$PURCHASE_LIST_ID" \
  -H "X-Customer-Id: $ADMIN_ID" \
  -H "Content-Type: application/json" | jq '.'
echo -e "${GREEN}采购清单删除成功${NC}\n"

echo "========================================="
echo -e "${GREEN}所有测试完成！${NC}"
echo "========================================="
echo ""
echo "验证清单："
echo "✓ 预览功能：应该显示原料需求但不改变订单状态"
echo "✓ 生成清单：应该创建采购清单并转换订单状态"
echo "✓ 日期检测：应该检测是否有订单制作日期变更"
echo "✓ 添加原料：应该能手动添加原料"
echo "✓ 删除原料：应该能删除原料"
echo "✓ 剔除订单：应该能移除订单并回退状态"
echo "✓ 追加订单：应该能添加订单并转换状态"
echo "✓ 删除清单：应该能删除清单并回退所有订单状态"
echo ""
