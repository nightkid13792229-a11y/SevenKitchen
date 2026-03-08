#!/bin/bash
# ===========================================
# SevenKitchen 统一部署脚本
# ===========================================
# 用法: ./deploy.sh [backend|admin-web|miniapp|all]
#
# 重要: 此脚本是唯一推荐的部署方式！
# 请勿让 Claude Code 或其他工具直接执行部署命令。

set -euo pipefail

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Helper functions
info() { echo -e "${BLUE}ℹ ${1}${NC}"; }
ok() { echo -e "${GREEN}✓ ${1}${NC}"; }
warn() { echo -e "${YELLOW}⚠ ${1}${NC}"; }
fail() { echo -e "${RED}✗ ${1}${NC}"; }

# 显示帮助信息
show_help() {
    echo "SevenKitchen 统一部署脚本"
    echo ""
    echo "用法: ./deploy.sh [目标] [选项]"
    echo ""
    echo "目标:"
    echo "  backend     部署后端到生产服务器"
    echo "  admin-web   部署管理后台到生产服务器"
    echo "  miniapp     构建小程序生产版本（本地）"
    echo "  all         部署后端和管理后台"
    echo ""
    echo "选项:"
    echo "  --dry-run   只显示将要执行的命令，不实际执行"
    echo "  --help      显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  ./deploy.sh backend          # 部署后端"
    echo "  ./deploy.sh admin-web        # 部署管理后台"
    echo "  ./deploy.sh miniapp          # 构建小程序"
    echo "  ./deploy.sh all              # 部署全部"
    echo ""
    echo "=========================================="
    echo "⚠️  重要提示"
    echo "=========================================="
    echo "1. 这是唯一推荐的部署方式"
    echo "2. 请勿让 Claude Code 直接执行部署命令"
    echo "3. 如需部署，请让 Claude Code 调用此脚本"
    echo "4. 所有部署操作都会被记录"
    echo ""
}

# 检查是否为 dry-run 模式
DRY_RUN=false
if [[ "$*" == *"--dry-run"* ]]; then
    DRY_RUN=true
    info "Dry-run 模式：只显示命令，不实际执行"
fi

# 部署后端
deploy_backend() {
    echo ""
    echo "=========================================="
    echo "部署后端到生产服务器"
    echo "=========================================="
    echo ""

    if [ "$DRY_RUN" = true ]; then
        info "将执行以下操作:"
        echo "  1. SSH 到生产服务器"
        echo "  2. 拉取最新代码"
        echo "  3. 生成 Prisma Client"
        echo "  4. 运行数据库迁移"
        echo "  5. 构建项目"
        echo "  6. 重启服务"
        echo ""
        info "实际命令: cd backend && bash scripts/deploy_lighthouse.sh"
        return
    fi

    # 记录部署日志
    LOG_FILE="deploy-backend-$(date +%Y%m%d-%H%M%S).log"

    info "开始部署后端... (日志: $LOG_FILE)"

    cd backend
    bash scripts/deploy_lighthouse.sh 2>&1 | tee "../$LOG_FILE"
    cd ..

    if [ ${PIPESTATUS[0]} -eq 0 ]; then
        ok "后端部署完成!"
        echo ""
        info "验证部署:"
        echo "  curl https://api.sevenkitchen.cloud/api/v1/health"
    else
        fail "后端部署失败! 请查看日志: $LOG_FILE"
        exit 1
    fi
}

# 部署管理后台
deploy_admin_web() {
    echo ""
    echo "=========================================="
    echo "部署管理后台到生产服务器"
    echo "=========================================="
    echo ""

    if [ "$DRY_RUN" = true ]; then
        info "将执行以下操作:"
        echo "  1. 本地构建管理后台"
        echo "  2. SSH 到生产服务器"
        echo "  3. 部署构建文件"
        echo ""
        info "实际命令: bash deploy-admin-web.sh"
        return
    fi

    # 记录部署日志
    LOG_FILE="deploy-admin-web-$(date +%Y%m%d-%H%M%S).log"

    info "开始部署管理后台... (日志: $LOG_FILE)"

    bash deploy-admin-web.sh 2>&1 | tee "$LOG_FILE"

    if [ ${PIPESTATUS[0]} -eq 0 ]; then
        ok "管理后台部署完成!"
        echo ""
        info "访问地址: http://1.14.3.2"
    else
        fail "管理后台部署失败! 请查看日志: $LOG_FILE"
        exit 1
    fi
}

# 构建小程序
build_miniapp() {
    echo ""
    echo "=========================================="
    echo "构建小程序生产版本"
    echo "=========================================="
    echo ""

    if [ "$DRY_RUN" = true ]; then
        info "将执行以下操作:"
        echo "  1. 进入 miniapp 目录"
        echo "  2. 运行 npm run build:mp-weixin"
        echo "  3. 输出目录: miniapp/dist/build/mp-weixin"
        echo ""
        info "提示: 构建后需使用微信开发者工具上传"
        return
    fi

    info "开始构建小程序..."

    cd miniapp
    npm run build:mp-weixin
    cd ..

    ok "小程序构建完成!"
    echo ""
    info "下一步:"
    echo "  1. 使用微信开发者工具打开 miniapp/dist/build/mp-weixin"
    echo "  2. 点击上传按钮"
    echo "  3. 填写版本号和备注"
}

# 主逻辑
case "${1:-}" in
    backend)
        deploy_backend
        ;;
    admin-web)
        deploy_admin_web
        ;;
    miniapp)
        build_miniapp
        ;;
    all)
        deploy_backend
        echo ""
        deploy_admin_web
        ;;
    --help|help|-h)
        show_help
        ;;
    *)
        if [ -n "${1:-}" ]; then
            fail "未知目标: $1"
        fi
        show_help
        exit 1
        ;;
esac

echo ""
info "部署脚本执行完成: $(date '+%Y-%m-%d %H:%M:%S')"
