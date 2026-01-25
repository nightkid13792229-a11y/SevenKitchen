#!/bin/bash

echo "=== 测试报销单费用明细功能 ==="

# 配置
API_BASE="http://localhost:3000/api/v1/staff/purchasing"
TOKEN="your-test-token-here"

echo ""
echo "测试1: 提交包含费用明细的报销申请"
curl -X POST "${API_BASE}/reimbursements" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "purchaseListIds": [],
    "receiptUrls": ["https://example.com/receipt.jpg"],
    "totalActualCost": 65.00,
    "platformShippingFee": 10.00,
    "platformPackagingFee": 5.00,
    "customFees": [
      {"description": "打车费", "amount": 30.00},
      {"description": "搬运费", "amount": 20.00}
    ]
  }' | jq '.'

echo ""
echo "测试2: 获取报销单详情（替换REIMBURSEMENT_ID）"
echo "curl -X GET \"${API_BASE}/reimbursements/REIMBURSEMENT_ID\" \\"
echo "  -H \"Authorization: Bearer ${TOKEN}\" | jq '.'"

echo ""
echo "测试3: 测试费用验证失败的情况"
curl -X POST "${API_BASE}/reimbursements" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "purchaseListIds": [],
    "receiptUrls": ["https://example.com/receipt.jpg"],
    "totalActualCost": 100.00,
    "platformShippingFee": 10.00
  }' | jq '.'

echo ""
echo "=== 测试完成 ==="
