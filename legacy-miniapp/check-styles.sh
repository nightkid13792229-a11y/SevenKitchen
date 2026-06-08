#!/bin/bash

# 微信小程序样式问题诊断脚本

echo "======================================"
echo "微信小程序样式问题诊断"
echo "======================================"
echo ""

# 1. 检查编译输出
echo "[1] 检查编译输出目录..."
if [ -d "dist/dev/mp-weixin" ]; then
    echo "✓ 编译输出目录存在"
    echo "  路径: $(pwd)/dist/dev/mp-weixin"
else
    echo "✗ 编译输出目录不存在"
    echo "  请运行: ./build-dev.sh"
    exit 1
fi
echo ""

# 2. 检查样式文件
echo "[2] 检查样式文件..."
STYLE_COUNT=$(find dist/dev/mp-weixin -name "*.wxss" | wc -l)
echo "✓ 找到 $STYLE_COUNT 个样式文件"
echo ""

# 3. 列出主要样式文件大小
echo "[3] 主要样式文件大小检查:"
echo "----------------------------------------"
for file in "dist/dev/mp-weixin/pages/home/index.wxss" \
            "dist/dev/mp-weixin/pages/staff-purchasing/reimbursement/detail.wxss" \
            "dist/dev/mp-weixin/pages/staff-purchasing/reimbursement/list.wxss" \
            "dist/dev/mp-weixin/common/assets/index.wxss"; do
    if [ -f "$file" ]; then
        SIZE=$(ls -lh "$file" | awk '{print $5}')
        echo "✓ $file: $SIZE"
    else
        echo "✗ $file: 文件不存在"
    fi
done
echo "----------------------------------------"
echo ""

# 4. 检查是否有公共样式
echo "[4] 检查公共样式文件..."
if [ -f "dist/dev/mp-weixin/common/assets/index.wxss" ]; then
    SIZE=$(ls -lh "dist/dev/mp-weixin/common/assets/index.wxss" | awk '{print $5}')
    echo "✓ 公共样式文件存在 (大小: $SIZE)"
else
    echo "✗ 公共样式文件不存在"
fi
echo ""

# 5. 提供解决建议
echo "======================================"
echo "诊断结果与解决建议"
echo "======================================"
echo ""
echo "如果样式文件都存在，但小程序中仍然没有样式，"
echo "请按以下步骤操作："
echo ""
echo "1. 确认微信开发者工具导入的目录是："
echo "   $(pwd)/dist/dev/mp-weixin"
echo ""
echo "2. 在微信开发者工具中："
echo "   - 点击「工具」菜单"
echo "   - 点击「清缓存」"
echo "   - 选择「清除全部缓存」"
echo "   - 点击「确定」"
echo ""
echo "3. 重新编译项目："
echo "   ./build-dev.sh"
echo ""
echo "4. 在微信开发者工具中："
echo "   - 点击「编译」按钮（或按 Cmd+B）"
echo ""
echo "5. 如果仍然无效，重启微信开发者工具："
echo "   - 完全退出微信开发者工具"
echo "   - 重新打开项目"
echo ""
echo "6. 最后手段 - 重置环境："
echo "   rm -rf dist/ node_modules/.vite"
echo "   ./build-dev.sh"
echo ""
echo "======================================"
