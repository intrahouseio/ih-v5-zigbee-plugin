#!/bin/bash
set -e

ROOT="./zigbee"

# 1. Удаляем все скрытые файлы и папки (.*) кроме .env
find "$ROOT" -name ".*" \
  ! -name "." \
  ! -name ".." \
  ! -path "$ROOT/node_modules/.pnpm*" \
  ! -name ".env" \
  -exec rm -rf {} +

# 2. Удаляем целые папки
rm -rf "$ROOT/test" "$ROOT/docker"

# 3. Удаляем файлы по расширениям, кроме внутри assets/ и images/
find "$ROOT" \
  -type f \( \
    -name "*.ts" \
    -o -name "*.tsbuildinfo" \
    -o -name "*.test.ts" \
    -o -name "*.bench.ts" \
    -o -name "*.spec.ts" \
    -o -name "*.d.ts" \
    -o -name "*.d.ts.map" \
    -o -name "*.map" \
    -o -name "*.md" \
    -o -name "*.drawio" \
  \) ! -path "*/assets/*" ! -path "*/images/*" -exec rm -f {} +

# 4. Чистим node_modules от лишних папок
find "$ROOT/node_modules" \
  -type d \( \
    -name "test" \
    -o -name "tests" \
    -o -name "docs" \
    -o -name "examples" \
  \) -prune -exec rm -rf {} +

# 5. Удаляем лишние файлы из node_modules
find "$ROOT/node_modules" \
  -type f \( \
    -name "*.md" \
    -o -name "*.map" \
    -o -name "*.ts" \
  \) -exec rm -f {} +

echo "Очистка завершена."
