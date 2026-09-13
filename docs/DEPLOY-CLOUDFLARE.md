# Hướng dẫn triển khai: Docker + Cloudflare (từ con số 0)

Tài liệu dành cho quản trị viên. Làm lần lượt **8 bước**, mỗi bước 5–15 phút. Sau khi xong, hệ thống chạy tại `https://<tên-miền>` với chứng chỉ SSL tự động.

---

## Bước 1 — Thuê VPS

Mua 1 VPS với cấu hình khuyến nghị:

| Nhà cung cấp Việt Nam | Gợi ý gói |
|---|---|
| Viettel Cloud, VNPT Cloud, VNG Cloud | 2 vCPU / 4GB RAM / 40GB SSD |
| Hetzner / DigitalOcean (nước ngoài) | CX22 / Basic 2GB |

Hệ điều hành: **Ubuntu 24.04**. Sau khi mua, nhà cung cấp cấp: **IP công khai** + **mật khẩu (hoặc SSH key)** của user `root`.

## Bước 2 — Đưa tên miền lên Cloudflare

1. Đăng ký tài khoản tại [dash.cloudflare.com](https://dash.cloudflare.com) → **Add a domain** → nhập tên miền (VD `congty.vn`) → gói **Free**.
2. Cloudflare cấp **2 nameserver** (VD `ada.ns.cloudflare.com`, `lee.ns.cloudflare.com`).
3. Vào trang quản lý tên miền của nơi mua (VNNIC, Matbao, Tenten...) → **đổi nameserver** sang 2 nameserver của Cloudflare → chờ 5 phút – 24h đến khi Cloudflare báo **Active**.

## Bước 3 — Tạo DNS record trỏ về VPS

Trong Cloudflare → tab **DNS** → **Add record**:

- Type: `A` · Name: `vanban` (subdomain tùy chọn) · IPv4: `<IP VPS ở Bước 1>` · **Proxy status: bật (đám mây cam 🟠)**

## Bước 4 — Bật chế độ SSL Full (strict)

Cloudflare → tab **SSL/TLS** → **Overview** → chọn **Full (strict)**.
(Rigime này bắt buộc vì máy chủ của ta sẽ dùng chứng chỉ hợp lệ do Caddy cấp.)

Tuỳ chọn nên bật:

- **SSL/TLS → Edge Certificates → Always Use HTTPS: ON**
- **Security → WAF**: tạo rule chỉ cho phép quốc gia `VN` nếu hệ thống chỉ dùng trong nước.

## Bước 5 — Tạo Cloudflare API Token (để cấp SSL tự động)

Caddy cần token này để xác minh DNS khi cấp chứng chỉ:

1. Cloudflare → ảnh đại diện → **My Profile → API Tokens → Create Token**.
2. Chọn template **Edit zone DNS**.
3. Zone Resources: `Include → Specific zone → congty.vn`.
4. **Continue to summary → Create Token** → **copy token** (chỉ hiện 1 lần!).

## Bước 6 — Cài Docker trên VPS

SSH vào VPS (`ssh root@<IP>`), chạy:

```bash
curl -fsSL https://get.docker.com | sh
```

## Bước 7 — Tải mã nguồn & cấu hình

```bash
# (nếu dùng git: clone repo; hoặc tải file nén từ máy mình lên bằng scp)
cd /opt
git clone <repo> so-vanban-di     # hoặc: scp -r so-vanban-di root@<IP>:/opt/
cd so-vanban-di

# Tạo file cấu hình
cp .env.example .env
nano .env
```

Điền các giá trị trong `.env`:

```
POSTGRES_PASSWORD=<chuỗi ngẫu nhiên mạnh>
JWT_SECRET=<chuỗi ngẫu nhiên 64 ký tự>        # sinh bằng: openssl rand -hex 32
JWT_REFRESH_SECRET=<chuỗi ngẫu nhiên khác>
DOMAIN=vanban.congty.vn                        # đúng như record ở Bước 3
ACME_EMAIL=admin@congty.vn
CF_DNS_API_TOKEN=<token ở Bước 5>
UNIT_ABBR=UBND                                 # viết tắt cơ quan, VD 145/2026/CV-UBND
UNIT_NAME=UBND PHƯỜNG ABC                      # in trên trang sổ
```

## Bước 8 — Chạy!

```bash
./scripts/deploy.sh
# Kiểm tra:
curl -I https://vanban.congty.vn     # → HTTP/2 200, TLS hợp lệ
```

Mở `https://vanban.congty.vn`, đăng nhập `admin / Admin@123` → **đổi mật khẩu ngay** (Quản trị → Người dùng).

---

## Dịch vụ bổ sung

### OCR (nhận dạng chữ tiếng Việt) — tự chạy cùng stack

OCR (PaddleOCR, chạy CPU) được khai báo sẵn trong `docker-compose.prod.yml`, `./scripts/deploy.sh` tự build và bật — không cần thao tác gì thêm. App gọi qua mạng nội bộ `http://ocr:8000` (biến `OCR_URL`), **không mở port ra ngoài**.

> Lần **đầu tiên** container OCR khởi động sẽ tự tải model ~200MB (vài phút, tùy mạng). Xem tiến trình: `docker logs -f so-vanban-di-ocr-1`. Model nằm trong container, các lần khởi động sau dùng lại ngay. Thử tính năng "quét văn bản" với 1 ảnh/PDF công văn.
>
> Lưu ý chất lượng: model đa ngôn ngữ gốc của PaddleOCR nhận tốt chữ in tiếng Việt nhưng có thể bỏ một số dấu "ơ/ư" (VD "mời họp" → "mi hop"). Nếu cần chính xác tuyệt đối, thay model rec fine-tuned tiếng Việt bằng biến môi trường `OCR_REC_MODEL` (xem `docker/ocr/main.py`).

### AI local với Ollama (tùy chọn, cần thêm RAM)

```bash
docker compose -f docker-compose.prod.yml --profile ai up -d
# Tải 2 model nhẹ phổ biến (tổng RAM chiếm ~8GB):
docker compose -f docker-compose.prod.yml exec ollama ollama pull bge-m3      # embedding 1024 chiều
docker compose -f docker-compose.prod.yml exec ollama ollama pull qwen2.5:7b  # hội thoại
```

Ollama **không mở port ra ngoài** — app gọi qua mạng nội bộ `http://ollama:11434` (biến `OLLAMA_BASE_URL`). Sau khi tải model, vào **Quản trị → Trợ lý AI** trong giao diện để cấu hình provider. API key của AI provider đám mây (OpenAI/Gemini...) cũng nhập tại đó — **không đặt key trong .env**.

### Giám sát với Uptime Kuma (tùy chọn)

```bash
docker compose -f docker-compose.prod.yml --profile monitor up -d
```

Port 3001 chỉ **bind 127.0.0.1** trên VPS (không ra Internet). Truy cập qua SSH tunnel từ máy mình:

```bash
ssh -L 3001:127.0.0.1:3001 root@<IP VPS>
# rồi mở trên trình duyệt máy cá nhân: http://127.0.0.1:3001
```

Lần đầu vào, Uptime Kuma yêu cầu tạo tài khoản admin (chỉ nằm trong VPS). Sau đó thêm monitor mới:

- Type: **HTTP(s)** · URL: `https://<tên-miền>/api/health` · chu kỳ 60s.
- Nên bật thêm thông báo (Telegram/email) để nhận cảnh báo khi app sập.

---

## Nâng cấp từ bản cũ (v1.0.0 → mới)

Bản mới cần PostgreSQL có extension **pgvector** (cho cột vector/embedding). Image Postgres trong compose đã đổi sang `pgvector/pgvector:pg16` — extension sẽ do migration của backend tự tạo (`CREATE EXTENSION vector`), **không cần làm gì thêm trong compose**. Dữ liệu nằm trong volume `pgdata`, giữ nguyên khi đổi image.

Lệnh nâng cấp an toàn (chạy lần lượt tại thư mục dự án trên VPS):

```bash
# 1. Sao lưu trước khi đụng gì cả (tạo bản .sql.gz + .tar.gz trong volume backups)
docker compose -f docker-compose.prod.yml exec backup sh /scripts/backup.sh --once

# 2. Tải image postgres mới (tag đổi sang pgvector/pgvector:pg16)
docker compose -f docker-compose.prod.yml pull postgres

# 3. Lên container postgres mới — dữ liệu volume giữ nguyên, app tự migrate
docker compose -f docker-compose.prod.yml up -d postgres && ./scripts/deploy.sh
```

> Nếu `pull` báo không có image `postgres:16-alpine` cũ trong cache cũng không sao — compose chỉ cần image mới. Muốn kiểm tra extension đã bật: `docker compose -f docker-compose.prod.yml exec postgres psql -U ${POSTGRES_USER} -c "\dx"` → phải thấy dòng `vector`.

---

## Vận hành hằng ngày

| Việc | Lệnh |
|---|---|
| Xem log ứng dụng | `./scripts/deploy.sh logs` |
| Cập nhật phiên bản mới | `git pull && ./scripts/deploy.sh` |
| Xem bản sao lưu | `docker compose -f docker-compose.prod.yml exec backup ls -lh /backups` |
| Sao lưu thủ công | `docker compose -f docker-compose.prod.yml exec backup sh /backup.sh --once` |
| Khôi phục từ bản sao lưu | `./scripts/restore.sh backups/db-YYYYMMDD-HHMMSS.sql.gz backups/uploads-YYYYMMDD-HHMMSS.tar.gz` |

> Sao lưu tự động chạy lúc **02:00 mỗi ngày**, giữ **30 ngày gần nhất**, nằm trong volume `backups`. Nên tải thêm 1 bản về máy tính cá nhân hàng tuần:
> `docker compose -f docker-compose.prod.yml cp backup:/backups/db-<ngày>.sql.gz .`

## Sự cố thường gặp

| Hiện tượng | Nguyên nhân & cách xử lý |
|---|---|
| Site trả lỗi 522 | Caddy chưa chạy xong / VPS tường chặn port 443 → `ufw allow 80,443/tcp` rồi `./scripts/deploy.sh logs` |
| Lỗi cấp SSL trong log Caddy | Token Cloudflare sai/hết quyền → kiểm tra `CF_DNS_API_TOKEN`, quyền **Zone.DNS Edit** |
| 502 Bad Gateway | Container app chưa sẵn sàng → `docker compose -f docker-compose.prod.yml ps` + xem log app |
| Quên mật khẩu admin | `docker compose -f docker-compose.prod.yml exec app node -e "..."` hoặc liên hệ người vận hành để đặt lại |

## Yêu cầu tối thiểu tổng hợp

| Mức | RAM | Ghi chú |
|---|---|---|
| Cơ bản (app + OCR + Caddy + Postgres) | **4GB** | 2 vCPU / 40GB SSD, Ubuntu 24.04, mở port 80 + 443 |
| Thêm AI local (Ollama: bge-m3 + qwen2.5:7b) | **8GB** | bật profile `ai`; chỉ dùng AI đám mây thì không cần |

- Tên miền đã đưa lên Cloudflare, record A trỏ IP VPS, proxy bật, SSL Full (strict)
- Cloudflare API Token quyền `Zone → DNS → Edit`
