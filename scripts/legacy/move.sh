#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "$ROOT_DIR"

# 构建 apps/main
echo "=== build apps/main ==="
cd apps/main
pnpm install
if [ $? -ne 0 ]; then
    echo "apps/main install error"
    exit 1
fi
pnpm build
if [ $? -ne 0 ]; then
    echo "apps/main build error"
    exit 1
fi
cd ..

# 构建 apps/window
echo ""
echo "=== build apps/window ==="
cd apps/window
pnpm install
if [ $? -ne 0 ]; then
    echo "apps/window install error"
    exit 1
fi
pnpm build
if [ $? -ne 0 ]; then
    echo "apps/window build error"
    exit 1
fi
cd ..

# 构建 backend
echo ""
echo "=== build backend ==="
cd apps/backend
pnpm install
if [ $? -ne 0 ]; then
    echo "backend install error"
    exit 1
fi
pnpm build
if [ $? -ne 0 ]; then
    echo "backend build error"
    exit 1
fi
cd ..

# 运行 Python 脚本移动文件
echo ""
echo "=== run Python : moveDist.py ==="
python scripts/legacy/moveDist.py
