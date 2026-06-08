#!/bin/bash
# 自动同步编译后的文件到 dist/build/mp-weixin 目录
# 在开发模式下使用

echo "🔄 监控文件变化并同步到 dist/build/mp-weixin..."

SOURCE_DIR="dist/dev/mp-weixin"
TARGET_DIR="dist/build/mp-weixin"

# 首次同步
echo "📦 首次同步..."
mkdir -p "$TARGET_DIR"
rsync -av --delete "$SOURCE_DIR/" "$TARGET_DIR/"
echo "✅ 首次同步完成"

# 监控文件变化
if command -v fswatch &> /dev/null; then
    echo "✅ 使用 fswatch 监控文件变化"
    fswatch -o "$SOURCE_DIR" | while read -r; do
        echo "[$(date '+%H:%M:%S')] 检测到文件变化，正在同步..."
        rsync -av --delete "$SOURCE_DIR/" "$TARGET_DIR/"
        echo "✅ 同步完成"
    done
elif command -v inotifywait &> /dev/null; then
    echo "✅ 使用 inotifywait 监控文件变化"
    inotifywait -r -e modify,create,delete,move "$SOURCE_DIR" |
        while read -r directory event filename; do
            echo "[$(date '+%H:%M:%S')] 检测到文件变化，正在同步..."
            rsync -av --delete "$SOURCE_DIR/" "$TARGET_DIR/"
            echo "✅ 同步完成"
        done
else
    echo "❌ 错误: 需要安装 fswatch (macOS) 或 inotify-tools (Linux)"
    echo "安装方法："
    echo "  macOS: brew install fswatch"
    echo "  Linux: sudo apt-get install inotify-tools"
    echo ""
    echo "或者手动同步："
    echo "  rsync -av --delete dist/dev/mp-weixin/ dist/build/mp-weixin/"
    exit 1
fi
