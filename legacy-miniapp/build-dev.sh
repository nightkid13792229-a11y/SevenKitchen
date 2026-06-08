#!/bin/bash

# SevenKitchen 小程序开发编译脚本
# 用途：自动化开发环境编译流程，避免微信开发者工具不稳定问题

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}SevenKitchen 小程序开发编译${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""

# 检查是否在正确的目录
if [ ! -f "package.json" ]; then
    echo -e "${RED}错误: 请在 miniapp 目录下运行此脚本${NC}"
    exit 1
fi

# 检查 node_modules 是否存在
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}未检测到 node_modules，正在安装依赖...${NC}"
    pnpm install
fi

# 步骤 1: 清理旧的编译文件
echo -e "${YELLOW}[1/3] 清理旧的编译文件...${NC}"
rm -rf dist/dev/mp-weixin
echo -e "${GREEN}✓ 清理完成${NC}"
echo ""

# 步骤 2: 执行开发编译
echo -e "${YELLOW}[2/3] 开始编译（开发模式）...${NC}"
pnpm run dev:mp-weixin
echo -e "${GREEN}✓ 编译完成${NC}"
echo ""

# 步骤 3: 验证输出
echo -e "${YELLOW}[3/3] 验证编译输出...${NC}"
if [ -d "dist/dev/mp-weixin" ]; then
    FILE_COUNT=$(find dist/dev/mp-weixin -type f | wc -l)
    echo -e "${GREEN}✓ 编译成功！生成了 ${FILE_COUNT} 个文件${NC}"
    echo -e "${GREEN}  输出目录: $(pwd)/dist/dev/mp-weixin${NC}"
else
    echo -e "${RED}✗ 编译失败：未找到输出目录${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}编译完成！下一步操作：${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""
echo -e "1. 打开微信开发者工具"
echo -e "2. 点击「导入项目」"
echo -e "3. 选择目录: $(pwd)/dist/dev/mp-weixin"
echo -e "4. 项目名称: SevenKitchen (开发版)"
echo -e "5. AppID: 使用测试号或你的 AppID"
echo ""
echo -e "${YELLOW}注意:${NC}"
echo -e "- 请勿直接在微信开发者工具中修改代码"
echo -e "- 代码修改后请重新运行此脚本"
echo -e "- 如遇预览问题，请点击「清缓存」→「清除全部缓存」"
echo ""
