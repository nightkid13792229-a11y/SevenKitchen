#!/bin/bash

# 彻底清理并重新编译小程序
# 解决微信开发者工具缓存问题

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}彻底清理并重新编译${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""

# 检查目录
if [ ! -f "package.json" ]; then
    echo -e "${RED}错误: 请在 miniapp 目录下运行此脚本${NC}"
    exit 1
fi

# 步骤 1: 停止编译进程
echo -e "${YELLOW}[1/4] 停止所有编译进程...${NC}"
pkill -f "uni -p mp-weixin" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
echo -e "${GREEN}✓ 进程已停止${NC}"
echo ""

# 步骤 2: 清理所有缓存和编译输出
echo -e "${YELLOW}[2/4] 清理缓存和编译输出...${NC}"
echo -e "  删除 dist/ 目录..."
rm -rf dist/
echo -e "  删除 node_modules/.vite/ 目录..."
rm -rf node_modules/.vite
echo -e "  删除 node_modules/.cache/ 目录..."
rm -rf node_modules/.cache
echo -e "${GREEN}✓ 清理完成${NC}"
echo ""

# 步骤 3: 重新编译
echo -e "${YELLOW}[3/4] 重新编译项目...${NC}"
pnpm run dev:mp-weixin &
BUILD_PID=$!

# 等待编译完成
echo "正在编译..."
sleep 8

# 检查是否编译成功
if [ -d "dist/dev/mp-weixin" ] && [ -f "dist/dev/mp-weixin/app.json" ]; then
    echo -e "${GREEN}✓ 编译成功${NC}"

    # 显示关键文件
    echo ""
    echo -e "${YELLOW}[4/4] 验证关键文件...${NC}"
    echo "关键文件检查："
    [ -f "dist/dev/mp-weixin/app.json" ] && echo "  ✓ app.json"
    [ -f "dist/dev/mp-weixin/app.js" ] && echo "  ✓ app.js"
    [ -f "dist/dev/mp-weixin/app.wxss" ] && echo "  ✓ app.wxss"

    PAGE_COUNT=$(find dist/dev/mp-weixin/pages -name "*.json" | wc -l | tr -d ' ')
    echo "  ✓ 页面配置文件: ${PAGE_COUNT} 个"

    WXSS_COUNT=$(find dist/dev/mp-weixin -name "*.wxss" | wc -l | tr -d ' ')
    echo "  ✓ 样式文件: ${WXSS_COUNT} 个"
else
    echo -e "${RED}✗ 编译失败${NC}"
    echo "请检查上面的错误信息"
    exit 1
fi

echo ""
echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}编译完成！${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""
echo -e "下一步操作："
echo ""
echo -e "1. 完全退出微信开发者工具（确保完全退出）"
echo -e "2. 重新打开微信开发者工具"
echo -e "3. 点击「导入项目」"
echo -e "4. 选择目录: $(pwd)/dist/dev/mp-weixin"
echo -e "5. 点击「导入」"
echo ""
echo -e "${RED}重要提示:${NC}"
echo -e "- 不要点击「打开最近项目」"
echo -e "- 必须重新导入项目"
echo -e "- 导入后等待自动编译完成"
echo ""
