#!/bin/sh
# ===== Deploy / cập nhật production =====
# Cách dùng trên VPS (tại thư mục dự án, đã có .env):
#   ./scripts/deploy.sh          # build + cập nhật
#   ./scripts/deploy.sh logs     # xem log app
set -eu
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "Chưa có file .env — copy .env.example rồi điền cấu hình trước."; exit 1; }

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
echo "==> Xong. Kiểm tra: curl -I https://$DOMAIN"
