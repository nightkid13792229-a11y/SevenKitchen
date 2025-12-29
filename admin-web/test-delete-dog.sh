#!/bin/bash

echo "========================================="
echo "测试狗狗档案删除功能"
echo "========================================="
echo ""

BASE_URL="http://localhost:3000/api/v1"
HEADER="-H 'Content-Type: application/json' -H 'X-Customer-Id: admin-system'"

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试1: 获取狗狗列表
echo "📋 获取当前狗狗列表..."
DOGS=$(curl -s "$BASE_URL/admin/dogs?page=1&pageSize=5" -H "X-Customer-Id: admin-system")
echo "$DOGS" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    dogs = data.get('data', [])
    print(f'找到 {len(dogs)} 只狗狗:')
    for dog in dogs[:3]:
        print(f\"  - {dog['name']} (ID: {dog['id'][:8]}...)\")
except:
    print('解析失败')
"
echo ""

# 测试2: 删除不存在的狗狗
echo "🧪 测试1: 删除不存在的狗狗 ID..."
RESPONSE=$(curl -s -X DELETE "$BASE_URL/admin/dogs/non-existent-id" -H "X-Customer-Id: admin-system" -w "\n%{http_code}")
STATUS=$(echo "$RESPONSE" | tail -n1)
if [ "$STATUS" = "404" ]; then
    echo -e "${GREEN}✓ 通过${NC} - 返回 404 Not Found"
else
    echo -e "${RED}✗ 失败${NC} - 期望 404，实际: $STATUS"
fi
echo ""

# 测试3: 尝试删除有订单的狗狗（如果存在）
echo "🧪 测试2: 检查是否有测试狗狗..."
TEST_DOG_ID=$(curl -s "$BASE_URL/admin/dogs?search=测试狗狗" -H "X-Customer-Id: admin-system" | python3 -c "
import sys, json
data = json.load(sys.stdin)
dogs = data.get('data', [])
for dog in dogs:
    if '测试狗狗' in dog['name']:
        print(dog['id'])
        break
" 2>/dev/null)

if [ -n "$TEST_DOG_ID" ]; then
    echo "找到测试狗狗: $TEST_DOG_ID"

    # 检查是否有订单
    echo "📊 检查该狗狗的订单..."
    ORDERS=$(curl -s "$BASE_URL/admin/dogs/$TEST_DOG_ID" -H "X-Customer-Id: admin-system")

    # 尝试删除
    echo "🗑️  尝试删除该狗狗..."
    DEL_RESPONSE=$(curl -s -X DELETE "$BASE_URL/admin/dogs/$TEST_DOG_ID" -H "X-Customer-Id: admin-system" -w "\n%{http_code}")
    DEL_STATUS=$(echo "$DEL_RESPONSE" | tail -n1)
    DEL_BODY=$(echo "$DEL_RESPONSE" | head -n-1)

    if [ "$DEL_STATUS" = "204" ]; then
        echo -e "${GREEN}✓ 删除成功${NC} - HTTP 204 No Content"
    elif [ "$DEL_STATUS" = "400" ]; then
        echo -e "${YELLOW}⚠ 删除被阻止${NC} - HTTP 400 Bad Request"
        echo "$DEL_BODY" | python3 -c "import sys, json; data=json.load(sys.stdin); print('原因:', data.get('message', '未知错误'))" 2>/dev/null || echo "$DEL_BODY"
    else
        echo -e "${RED}✗ 意外响应${NC} - HTTP $DEL_STATUS"
        echo "$DEL_BODY" | head -3
    fi
else
    echo -e "${YELLOW}⚠ 未找到测试狗狗${NC}"
fi
echo ""

echo "========================================="
echo "测试完成"
echo "========================================="
