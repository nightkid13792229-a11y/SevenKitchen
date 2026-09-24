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
#
# ⚠️ 这里原来的写法是 `pkill -f "uni -p mp-weixin"`，**它一个都匹配不到**：
#    实际命令行是 `.../vite-plugin-uni/bin/uni.js -p mp-weixin`，
#    "uni" 后面跟的是 ".js" 而不是空格，所以这个模式永远不命中。
#    后果是旧的 watcher 从来没被杀掉过 —— 实测同一时间堆了 5 个（最老的从 9/18 起），
#    全都在往 dist/dev/mp-weixin 里写，互相覆盖。之前"app.json 莫名其妙丢了"就是它导致的。
#    改成匹配真正出现在命令行里的字符串。
echo -e "${YELLOW}🛑 停止旧的编译进程...${NC}"
pkill -f "vite-plugin-uni/bin/uni.js" || true
pkill -f "dev:mp-weixin" || true
sleep 2
# 复核：确认真的清干净了，否则后面就是多个 watcher 抢同一个输出目录
if pgrep -f "vite-plugin-uni/bin/uni.js" > /dev/null; then
    echo -e "${YELLOW}   ⚠️ 仍有残留进程，强制结束${NC}"
    pkill -9 -f "vite-plugin-uni/bin/uni.js" || true
    sleep 1
fi
echo -e "${GREEN}   ✅ 旧进程已清空${NC}"

# 清理旧的编译输出
echo -e "${YELLOW}🧹 清理编译输出...${NC}"
rm -rf dist/dev/mp-weixin/*

# 启动新的编译进程
echo -e "${GREEN}🚀 启动 uni-app 编译服务...${NC}"
nohup pnpm run dev:mp-weixin > /tmp/uni-compile.log 2>&1 &
UNI_PID=$!

echo -e "${YELLOW}⏳ 等待编译完成...${NC}"

# 原来是 `sleep 15` 然后直接检查 —— 冷编译（刚清空 dist 之后）实测要 35 秒以上，
# 于是脚本每次都会误报"编译失败: app.json 未生成"，其实只是还没编完。
# 改成轮询：最多等 120 秒，每 2 秒看一次，编完就走。
WAIT_MAX=60   # 60 × 2s = 120s
for i in $(seq 1 $WAIT_MAX); do
    sleep 2
    if [ -f "dist/dev/mp-weixin/app.json" ] && [ -f "dist/dev/mp-weixin/app.js" ]; then
        echo -e "${GREEN}   ✅ 编译完成（约 $((i * 2)) 秒）${NC}"
        break
    fi
    # 编译进程要是已经死了，就别再空等
    if ! pgrep -f "vite-plugin-uni/bin/uni.js" > /dev/null; then
        echo -e "${RED}   ❌ 编译进程已退出${NC}"
        break
    fi
done
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
