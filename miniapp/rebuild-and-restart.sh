#!/bin/bash

echo "=========================================="
echo "🔄 停止现有编译进程..."
echo "=========================================="

# 查找并停止编译进程
VITE_PIDS=$(ps aux | grep -E "vite-plugin-uni.*mp-weixin" | grep -v grep | awk '{print $2}')

if [ -n "$VITE_PIDS" ]; then
    echo "找到编译进程: $VITE_PIDS"
    kill $VITE_PIDS 2>/dev/null
    sleep 2
    echo "✅ 进程已停止"
else
    echo "ℹ️  没有找到运行中的编译进程"
fi

echo ""
echo "=========================================="
echo "🧹 清理编译缓存..."
echo "=========================================="

# 进入项目目录
cd "$(dirname "$0")"

# 清理旧的编译文件
rm -rf dist/dev/mp-weixin
rm -rf node_modules/.vite
echo "✅ 缓存已清理"

echo ""
echo "=========================================="
echo "🔨 重新编译开发版本..."
echo "=========================================="

# 重新编译
npm run dev:mp-weixin &
BUILD_PID=$!

echo ""
echo "✅ 编译已启动（PID: $BUILD_PID）"
echo ""
echo "=========================================="
echo "⏳ 等待编译完成..."
echo "=========================================="
echo ""
echo "📂 输出目录: dist/dev/mp-weixin/"
echo "💡 提示：请确保微信开发者工具指向此目录"
echo ""
echo "=========================================="
echo "按 Ctrl+C 可停止编译进程"
echo "=========================================="

# 等待编译进程
wait $BUILD_PID
