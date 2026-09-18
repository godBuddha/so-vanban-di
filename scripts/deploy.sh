#!/bin/sh
# ===== Deploy / cập nhật production =====
# Cách dùng trên VPS (tại thư mục dự án, đã có .env):
#   ./scripts/deploy.sh          # build + cập nhật
#   ./scripts/deploy.sh logs     # xem log app
set -eu
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "Chưa có file .env — copy .env.example rồi điền cấu hình trước."; exit 1; }

# --- Kiểm tra cấu hình trước khi deploy (chặn giá trị giữ chỗ, thiếu biến, secret yếu) ---
# shellcheck disable=SC1091
. ./.env

MISSING=""
for VAR in DOMAIN ACME_EMAIL CF_DNS_API_TOKEN POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB JWT_SECRET JWT_REFRESH_SECRET UNIT_NAME; do
  [ -n "$(eval "printf '%s' \"\${$VAR:-}\"")" ] || MISSING="$MISSING $VAR"
done
if [ -n "$MISSING" ]; then
  echo "LỖI: thiếu biến môi trường trong .env:$MISSING"
  echo "     Mở .env điền đầy đủ rồi chạy lại. Secret tạo bằng: openssl rand -hex 32"
  exit 1
fi

BAD=""
# Secret không được giữ nguyên giá trị giữ chỗ trong .env.example
case "$JWT_SECRET" in
  *ngau_nhien*|dev_secret*|chuoi_*) BAD="$BAD JWT_SECRET" ;;
esac
case "$JWT_REFRESH_SECRET" in
  *ngau_nhien*|dev_refresh*|chuoi_*) BAD="$BAD JWT_REFRESH_SECRET" ;;
esac
# Mật khẩu Postgres không được giữ placeholder, tối thiểu 8 ký tự
case "$POSTGRES_PASSWORD" in
  doi_mat_khau_nay|vanban_dev) BAD="$BAD POSTGRES_PASSWORD" ;;
esac
if [ "${#POSTGRES_PASSWORD}" -lt 8 ]; then
  BAD="$BAD POSTGRES_PASSWORD(quá-ngắn)"
fi
# Hai secret không được trùng nhau
[ "$JWT_SECRET" = "$JWT_REFRESH_SECRET" ] && BAD="$BAD JWT_SECRET(=JWT_REFRESH_SECRET)"
if [ -n "$BAD" ]; then
  echo "LỖI: các giá trị sau trong .env không hợp lệ:$BAD"
  echo "     Mở .env đặt giá trị thật. Secret ngẫu nhiên: openssl rand -hex 32"
  exit 1
fi

case "${1:-}" in
  logs)  docker compose -f docker-compose.prod.yml logs -f app; exit 0 ;;
  down)  docker compose -f docker-compose.prod.yml down; exit 0 ;;
esac

echo "==> Build & khởi động dịch vụ..."
docker compose -f docker-compose.prod.yml up -d --build

echo "==> Chờ app khỏe..."
for i in $(seq 1 30); do
  if docker compose -f docker-compose.prod.yml ps app | grep -q "running"; then
    break
  fi
  sleep 2
done

echo "==> Trạng thái:"
docker compose -f docker-compose.prod.yml ps
echo "==> Xong. Mở https://$DOMAIN — lần đầu truy cập sẽ hiện trang Cài đặt ban đầu để tạo tài khoản quản trị."
