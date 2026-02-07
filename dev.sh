#!/bin/bash

# Anywhere Desktop - 一键启动开发环境脚本
# 
# 功能: 安装依赖、构建项目、启动 Electron 应用
# 用法: ./dev.sh [选项]
#
# 选项:
#   --skip-install    跳过依赖安装
#   --skip-build      跳过构建步骤（直接启动）
#   --rebuild         强制重新构建（清理缓存）
#   -h, --help        显示帮助信息

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 显示帮助
show_help() {
    cat << EOF
Anywhere Desktop - 一键启动开发环境

用法: ./dev.sh [选项]

选项:
  --skip-install    跳过依赖安装（已安装过时使用）
  --skip-build      跳过构建步骤（直接启动已构建的应用）
  --rebuild         强制重新构建（清理 dist 目录后再构建）
  -h, --help        显示此帮助信息

示例:
  ./dev.sh                  # 完整流程：安装 → 构建 → 启动
  ./dev.sh --skip-install   # 跳过安装，直接构建并启动
  ./dev.sh --skip-build     # 跳过构建，直接启动（需已构建过）
  ./dev.sh --rebuild        # 清理缓存后重新构建

EOF
    exit 0
}

# 解析参数
SKIP_INSTALL=false
SKIP_BUILD=false
REBUILD=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-install)
            SKIP_INSTALL=true
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --rebuild)
            REBUILD=true
            shift
            ;;
        -h|--help)
            show_help
            ;;
        *)
            log_error "未知选项: $1"
            echo "使用 ./dev.sh --help 查看帮助"
            exit 1
            ;;
    esac
done

# 检查 pnpm
check_pnpm() {
    if ! command -v pnpm &> /dev/null; then
        log_error "未找到 pnpm，请先安装: npm install -g pnpm"
        exit 1
    fi
    log_info "pnpm 版本: $(pnpm --version)"
}

# 安装依赖
install_deps() {
    if [ "$SKIP_INSTALL" = true ]; then
        log_warn "跳过依赖安装"
        return
    fi

    log_info "安装根目录依赖..."
    pnpm install

    log_info "安装所有子项目依赖..."
    pnpm run install:all

    log_success "依赖安装完成"
}

# 构建项目
build_project() {
    if [ "$SKIP_BUILD" = true ]; then
        log_warn "跳过构建步骤"
        return
    fi

    if [ "$REBUILD" = true ]; then
        log_info "清理构建缓存..."
        rm -rf Anywhere_main/dist
        rm -rf Anywhere_window/dist
        rm -rf v2.0.0/main
        rm -rf v2.0.0/window
        rm -rf v2.0.0/fast_window
    fi

    log_info "构建前端和后端..."
    pnpm build

    log_success "项目构建完成"
}

# 检查构建产物
check_build_artifacts() {
    local missing=false
    
    if [ ! -f "v2.0.0/main/index.html" ]; then
        log_error "缺少: v2.0.0/main/index.html"
        missing=true
    fi
    
    if [ ! -f "v2.0.0/preload.js" ]; then
        log_error "缺少: v2.0.0/preload.js"
        missing=true
    fi
    
    if [ ! -f "v2.0.0/window_preload.js" ]; then
        log_error "缺少: v2.0.0/window_preload.js"
        missing=true
    fi
    
    if [ ! -f "v2.0.0/fast_window_preload.js" ]; then
        log_error "缺少: v2.0.0/fast_window_preload.js"
        missing=true
    fi
    
    if [ "$missing" = true ]; then
        log_error "构建产物缺失，请先运行: ./dev.sh（不带 --skip-build）"
        exit 1
    fi
}

# 启动 Electron
start_electron() {
    if [ "$SKIP_BUILD" = true ]; then
        check_build_artifacts
    fi

    log_info "启动 Electron 应用..."
    echo ""
    echo "=========================================="
    echo "    Anywhere Desktop 已启动"
    echo "    按 Ctrl+C 停止应用"
    echo "=========================================="
    echo ""
    
    pnpm start
}

# 主流程
main() {
    echo ""
    echo "╔══════════════════════════════════════════╗"
    echo "║     Anywhere Desktop 开发环境启动器      ║"
    echo "╚══════════════════════════════════════════╝"
    echo ""

    check_pnpm
    install_deps
    build_project
    start_electron
}

main
