#!/bin/bash
# 确保小程序编译始终运行
# 用途：主动编译 + 验证输出完整性

set -e

MINIAPP_DIR="/Users/zhaochen/Documents/SevenKitchen/miniapp"
cd "$MINIAPP_DIR"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}SevenKitchen 小程序编译服务${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""

# 检查必要文件
echo "🔍 检查项目环境..."
if [ ! -f "src/App.vue" ] || [ ! -f "src/pages.json" ]; then
    echo -e "${RED}❌ 错误: 缺少必要的 uni-app 文件${NC}"
    exit 1
fi
echo -e "${GREEN}✅ 项目环境检查通过${NC}"
echo ""

# 停止旧进程
echo -e "${YELLOW}🛑 停止旧的编译进程...${NC}"
pkill -f "uni -p mp-weixin" || true
sleep 2

# 清理旧的编译输出
echo -e "${YELLOW}🧹 清理编译输出...${NC}"
rm -rf dist/dev/mp-weixin/*

# 启动新的编译进程
echo -e "${GREEN}🚀 启动 uni-app 编译服务...${NC}"
nohup pnpm run dev:mp-weixin > /tmp/uni-compile.log 2>&1 &
UNI_PID=$!

echo -e "${YELLOW}⏳ 等待编译完成（15秒）...${NC}"
sleep 15

# 验证编译输出
echo ""
echo "📋 验证编译输出..."
if [ ! -f "dist/dev/mp-weixin/app.json" ]; then
    echo -e "${RED}❌ 编译失败: app.json 未生成${NC}"
    echo -e "${YELLOW}📋 查看编译日志:${NC}"
    tail -50 /tmp/uni-compile.log
    exit 1
fi

if [ ! -f "dist/dev/mp-weixin/app.js" ]; then
    echo -e "${RED}❌ 编译失败: app.js 未生成${NC}"
    echo -e "${YELLOW}📋 查看编译日志:${NC}"
    tail -50 /tmp/uni-compile.log
    exit 1
fi

echo -e "${GREEN}✅ 编译成功！${NC}"
echo -e "${GREEN}📂 输出目录: dist/dev/mp-weixin${NC}"
echo -e "${GREEN}📄 核心文件:${NC}"
ls -lh dist/dev/mp-weixin/app.*
echo ""
echo -e "${GREEN}📌 编译进程 PID: $UNI_PID${NC}"
echo -e "${GREEN}📌 编译日志: /tmp/uni-compile.log${NC}"
echo ""
echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}编译服务已启动并正常运行${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""

# 保持进程运行
wait $UNI_PID
