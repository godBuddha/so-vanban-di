#!/bin/sh
# ===== Khôi phục từ bản sao lưu =====
# Cách dùng (trên VPS, tại thư mục dự án):
#   ./scripts/restore.sh backups/db-20260913-020000.sql.gz backups/uploads-20260913-020000.tar.gz
set -eu

DB_FILE="${1:?Cần đường dẫn file .sql.gz}"
UPLOAD_FILE="${2:?Cần đường dẫn file uploads .tar.gz}"

# Nạp biến môi trường (POSTGRES_USER/POSTGRES_DB...)
[ -f .env ] && set -a && . ./.env && set +a

echo "[restore] 1/3 Nạp database từ $DB_FILE ..."
gunzip -c "$DB_FILE" | docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"

echo "[restore] 2/3 Giải nén file đính kèm ..."
if [ -f "$UPLOAD_FILE" ]; then
  tar -xzf "$UPLOAD_FILE" -C /tmp
  docker compose -f docker-compose.prod.yml cp /tmp/uploads/. app:/data/uploads/
  rm -rf /tmp/uploads
else
  echo "[restore] Không có file đính kèm trong bản sao lưu — bỏ qua."
fi

echo "[restore] 3/3 Khởi động lại app ..."
docker compose -f docker-compose.prod.yml restart app

echo "[restore] HOÀN TẤT ✅"
