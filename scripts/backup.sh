#!/bin/sh
# ===== Sao lưu tự động hàng ngày =====
# Chạy trong container "backup": pg_dump + nén file đính kèm, giữ 30 bản gần nhất.
# Cài đặt lịch chạy thủ công ngoài compose: docker exec so-vanban-backup-1 sh /backup.sh
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
KEEP="${KEEP_DAYS:-30}"
STAMP="$(date +%Y%m%d-%H%M%S)"

# pg_dump đọc mật khẩu từ PGPASSWORD
export PGPASSWORD="${POSTGRES_PASSWORD:?Thiếu POSTGRES_PASSWORD}"

mkdir -p "$BACKUP_DIR"

echo "[backup] $(date '+%F %T') bắt đầu..."

# 1) Dump database
pg_dump -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  | gzip > "$BACKUP_DIR/db-$STAMP.sql.gz"

# 2) Nén toàn bộ file đính kèm
if [ -d "$UPLOADS_DIR" ] && [ -n "$(ls -A "$UPLOADS_DIR" 2>/dev/null)" ]; then
  tar -czf "$BACKUP_DIR/uploads-$STAMP.tar.gz" -C "$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")"
else
  touch "$BACKUP_DIR/uploads-$STAMP.tar.gz" # chưa có file nào
fi

# 3) Xoá bản cũ quá hạn giữ
find "$BACKUP_DIR" -name 'db-*.sql.gz' -mtime +"$KEEP" -delete
find "$BACKUP_DIR" -name 'uploads-*.tar.gz' -mtime +"$KEEP" -delete

echo "[backup] xong: $BACKUP_DIR/db-$STAMP.sql.gz ($(du -h "$BACKUP_DIR/db-$STAMP.sql.gz" | cut -f1))"

# Vòng lặp lịch: chạy lại sau 24h (container giữ sống để cron không chết).
# Chạy thủ công: thêm cờ --once để chỉ sao lưu 1 lần rồi dừng.
#   docker compose -f docker-compose.prod.yml exec backup sh /backup.sh --once
if [ "${1:-}" != "--once" ]; then
  sleep 86400
  exec sh "$0" --once
fi
