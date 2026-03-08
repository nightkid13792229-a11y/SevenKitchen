#!/bin/bash
# ===========================================
# SevenKitchen 环境切换脚本
# ===========================================
# 用法: ./scripts/env.sh [dev|prod|status]

set -e

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# 项目根目录
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# 显示帮助信息
show_help() {
    echo "SevenKitchen 环境切换脚本"
    echo ""
    echo "用法: ./scripts/env.sh [命令]"
    echo ""
    echo "命令:"
    echo "  dev     切换到开发环境（本地数据库）"
    echo "  prod    切换到生产环境（生产数据库）"
    echo "  status  显示当前环境状态"
    echo "  help    显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  ./scripts/env.sh dev      # 切换到开发环境"
    echo "  ./scripts/env.sh status   # 查看当前状态"
}

# 显示当前状态
show_status() {
    echo -e "${BLUE}=== 环境状态 ===${NC}"
    echo ""

    # 后端环境
    if [ -f "$PROJECT_ROOT/backend/.env" ]; then
        BACKEND_ENV=$(grep -E "^NODE_ENV" "$PROJECT_ROOT/backend/.env" 2>/dev/null | cut -d'=' -f2 || echo "development")
        echo -e "后端环境: ${GREEN}${BACKEND_ENV:-development}${NC}"
    else
        echo -e "后端环境: ${YELLOW}未配置${NC}"
    fi

    # 检查环境文件
    echo ""
    echo "环境文件:"
    for env_file in .env.development .env.production .env; do
        if [ -f "$PROJECT_ROOT/backend/$env_file" ]; then
            echo -e "  ${GREEN}✓${NC} backend/$env_file"
        else
            echo -e "  ${RED}✗${NC} backend/$env_file ${YELLOW}(不存在)${NC}"
        fi
    done

    # 小程序构建类型
    echo ""
    echo -e "${BLUE}小程序构建:${NC}"
    echo "  开发构建: npm run dev:mp-weixin  → localhost:3001"
    echo "  生产构建: npm run build:mp-weixin → api.sevenkitchen.cloud"
}

 # 切换到开发环境
switch_to_dev() {
    echo -e "${BLUE}=== 切换到开发环境 ===${NC}"

    # 创建后端开发环境配置
    if [ ! -f "$PROJECT_ROOT/backend/.env.development" ]; then
        echo -e "${YELLOW}警告: .env.development 不存在，请先创建${NC}"
        exit 1
    fi

    # 复制开发环境配置为当前配置
    cp "$PROJECT_ROOT/backend/.env.development" "$PROJECT_ROOT/backend/.env"

    echo -e "${GREEN}✓ 后端已切换到开发环境${NC}"
    echo ""
    echo -e "开发环境配置:"
    echo -e "  - 数据库: localhost:5432/sevenkitchen_dev"
    echo -e "  - API 地址: http://localhost:3001/api/v1"
    echo ""
    echo -e "${YELLOW}提示: 请运行以下命令启动后端:${NC}"
    echo -e "  cd backend && pnpm start:dev"
}

# 切换到生产环境
switch_to_prod() {
    echo -e "${BLUE}=== 切换到生产环境 ===${NC}"

    # 检查生产环境配置是否存在
    if [ ! -f "$PROJECT_ROOT/backend/.env.production" ]; then
        echo -e "${YELLOW}警告: .env.production 不存在${NC}"
        echo -e "请在生产服务器上手动创建 .env.production 文件"
        echo -e "参考 .env.example 获取配置模板"
        exit 1
    fi

    # 复制生产环境配置为当前配置
    cp "$PROJECT_ROOT/backend/.env.production" "$PROJECT_ROOT/backend/.env"

    echo -e "${GREEN}✓ 后端已切换到生产环境${NC}"
    echo ""
    echo -e "${YELLOW}提示: 请运行以下命令启动后端:${NC}"
    echo -e "  cd backend && pnpm start:prod"
}

# 主逻辑
case "${1:-}" in
    dev)
        switch_to_dev
        ;;
    prod)
        switch_to_prod
        ;;
    status)
        show_status
        ;;
    help|--help|-h|--h)
        show_help
        ;;
    *)
        echo -e "${RED}未知命令: $1${NC}"
        echo ""
        show_help
        exit 1
        ;;
esac
