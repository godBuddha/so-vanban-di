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

- VPS: 2 vCPU / 4GB RAM / 40GB SSD, Ubuntu 24.04, mở port 80 + 443
- Tên miền đã đưa lên Cloudflare, record A trỏ IP VPS, proxy bật, SSL Full (strict)
- Cloudflare API Token quyền `Zone → DNS → Edit`
