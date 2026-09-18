# API Contract — Sổ Văn Bản Đi

> Tài liệu dùng chung cho backend (`server/`) và frontend (`web/`). BASE URL: `/api`.

## Quy ước chung

- JSON body; lỗi trả về `{ "error": "thông báo tiếng Việt" }` với mã HTTP phù hợp (400/401/403/404/409/500).
- Xác thực: header `Authorization: Bearer <accessToken>` (JWT, hết hạn 15 phút; refresh token hết hạn 7 ngày).
- Ngày tháng: chuỗi `YYYY-MM-DD`.
- Vai trò: `ADMIN` (toàn quyền), `VANTHU` (nhập/sửa văn bản + import), `TRACUU` (chỉ đọc).
- `loaiVB` enum: `CONG_VAN | CONG_DIEN | QUYET_DINH | CHI_THI | BAO_CAO | THONG_BAO | HO_NGHI | GIOI_THIEU | KHAC`.

## DTO

```ts
DocumentDTO {
  id: number
  soVaoSo: number            // duy nhất theo năm
  nam: number
  loaiVB: DocType
  soKyHieu: string           // VD "145/2026/CV-ABC" — server sinh theo mẫu
  ngayBanHanh: string        // YYYY-MM-DD
  nguoiKy: string
  trichYeu: string
  noiNhan: string
  soBan: number              // mặc định 1
  ghiChu: string | null
  nguoiTao: { id: number; fullName: string }
  attachments: { id: number; fileName: string; size: number }[]
  createdAt: string; updatedAt: string
}
```

## Auth

| Method | Path | Body | Phản hồi | Quyền |
|---|---|---|---|---|
| POST | `/auth/login` | `{username, password}` | `{accessToken, refreshToken, user:{id, username, fullName, role}}` | công khai |
| POST | `/auth/refresh` | `{refreshToken}` | `{accessToken, refreshToken}` | công khai |
| POST | `/auth/logout` | `{refreshToken}` | `{ok: true}` | đã đăng nhập |
| GET | `/auth/me` | — | `user` | đã đăng nhập |
| PATCH | `/auth/password` | `{currentPassword, password}` (tối thiểu 8 ký tự) | `{ok: true}` | đã đăng nhập — đổi mật khẩu cho chính mình, xác minh mật khẩu hiện tại |

## Cài đặt ban đầu

| Method | Path | Body | Phản hồi | Quyền |
|---|---|---|---|---|
| GET | `/setup/status` | — | `{needed: boolean}` — `true` khi hệ thống chưa có người dùng nào | công khai (rate-limit 30 lượt/phút/IP) |
| POST | `/setup` | `{username, password (≥8), fullName}` | `201 {user}` — tạo tài khoản **ADMIN** đầu tiên | công khai **chỉ khi DB còn trống**; sau đó luôn trả `403` (trang cài đặt tự đóng vĩnh viễn, không có mật khẩu admin mặc định) |

## Documents

| Method | Path | Mô tả | Quyền |
|---|---|---|---|
| GET | `/documents` | Danh sách có lọc | mọi vai trò đã đăng nhập |
| GET | `/documents/:id` | Chi tiết + attachments | mọi vai trò |
| POST | `/documents` | Tạo mới (nếu bỏ trống `soVaoSo` → tự cấp số lớn nhất +1) | VANTHU, ADMIN |
| PATCH | `/documents/:id` | Sửa (không cho đổi `soVaoSo`/`nam` sau khi cấp) | VANTHU, ADMIN |
| DELETE | `/documents/:id` | Xoá (kèm attachments) | ADMIN |
| GET | `/documents/next-number?nam=2026` | `{soVaoSo, soKyHieu}` xem trước số kế tiếp | VANTHU, ADMIN |

Query lọc cho `GET /documents`: `q` (tìm trong trích yếu/số ký hiệu/người ký/nơi nhận), `nam`, `loaiVB`, `noiNhan`, `from`, `to` (ngày ban hành), `page` (từ 1), `pageSize` (mặc định 20, tối đa 100), `sort` (`soVaoSo|ngayBanHanh`), `order` (`asc|desc`, mặc định asc).

Phản hồi: `{ data: DocumentDTO[], total: number, page: number, pageSize: number }`.

## Attachments

| Method | Path | Mô tả | Quyền |
|---|---|---|---|
| POST | `/documents/:id/attachments` | multipart/form-data, field `files` (nhiều file, ≤5, ≤20MB, PDF/DOC/DOCX/JPG/PNG) | VANTHU, ADMIN |
| GET | `/attachments/:id/download` | Stream file về (Content-Disposition tên gốc) | mọi vai trò |
| DELETE | `/attachments/:id` | Xoá file | VANTHU, ADMIN |

## Xuất / Nhập

| Method | Path | Mô tả | Quyền |
|---|---|---|---|
| GET | `/export/excel?<cùng bộ lọc>` | File .xlsx toàn bộ kết quả lọc | mọi vai trò |
| POST | `/import/excel` | multipart `file` .xlsx — cột bắt buộc: ngày ban hành, người ký, trích yếu, nơi nhận; tự cấp số vào sổ | VANTHU, ADMIN |

> **In sổ / xuất PDF**: làm phía giao diện — trang "In sổ" render bảng giống sổ giấy (khổ A4 ngang, tiêu đề `SỔ VĂN BẢN ĐI NĂM …`, tên cơ quan từ cấu hình) + print CSS; người dùng bấm In và chọn "Lưu thành PDF" của trình duyệt. Không cần endpoint PDF phía server (tránh nhúng font tiếng Việt).

Phản hồi import: `{ created: number, skipped: number, errors: [{row: number, message: string}] }`.

## Users (ADMIN)

| Method | Path | Mô tả |
|---|---|---|
| GET | `/users` | Danh sách (không có cột password) |
| POST | `/users` | `{username, password, fullName, role, active}` |
| PATCH | `/users/:id` | Sửa `{fullName?, role?, active?}` (không tự xoá/vô hiệu chính mình) |
| PATCH | `/users/:id/password` | `{password}` (tối thiểu 8 ký tự) |
| DELETE | `/users/:id` | Xoá (đã có văn bản thì báo lỗi, chỉ vô hiệu hoá) |

## Audit logs

| Method | Path | Mô tả |
|---|---|---|
| GET | `/audit-logs?page=&pageSize=&q=` | `{data:[{id, user:{fullName}, action, entity, entityId, detail, createdAt}], total}` — ADMIN only |

Ghi log cho: LOGIN, CREATE, UPDATE, DELETE, IMPORT, EXPORT, UPLOAD, ATTACHMENT_DELETE.

## Đánh số & ký hiệu

- Số vào sổ: cấp trong transaction với `YearCounter` (bảng `year_counters`, khoá theo `nam`) — không trùng kể cả nhập song song.
- Số ký hiệu tự ghép: `{soVaoSo}/{nam}/{KY_HIEU_LOAI}-{VIET_TAT_DON_VI}`, VD `145/2026/CV-UBND`.
  - `KY_HIEU_LOAI`: CV (công văn), CĐ (công điện), QĐ (quyết định), CT (chỉ thị), BC (báo cáo), TB (thông báo), HN (hỏng nghị), GT (giới thiệu), VB (khác).
  - `VIET_TAT_DON_VI` đọc từ biến môi trường `UNIT_ABBR` (cấu hình theo cơ quan).
  - Người dùng vẫn được phép sửa `soKyHieu` thủ công trước khi lưu (điền trước khi in).

## AI (từ v1.0.1)

Chi tiết cấu hình xem `docs/AI.md`. Mọi endpoint yêu cầu đăng nhập; cấu hình provider/key nằm trong DB (bảng `AiConfig`), chỉnh qua giao diện ADMIN.

| Method | Path | Ai được gọi | Mô tả |
|---|---|---|---|
| GET | `/health` | Không cần auth | `{ok, uptime}` — cho healthcheck Docker / Uptime Kuma |
| POST | `/ai/ocr` | Mọi vai trò | Multipart `file` (JPG/PNG/PDF ≤20MB) → `{text}` — proxy sang dịch vụ PaddleOCR, không phụ thuộc AI provider |
| POST | `/ai/ocr-extract` | VANTHU, ADMIN | Như trên + LLM trích `{text, fields: {soKyHieu, ngayBanHanh, nguoiKy, trichYeu, noiNhan, loaiVB} \| null}` — LLM lỗi thì `fields=null` (an toàn) |
| POST | `/ai/search` | Mọi vai trò | `{q, topK?=10}` — embedding câu hỏi, pgvector cosine, (tuỳ chọn) rerank → `{results: [{documentId, soVaoSo, soKyHieu, trichYeu, ngayBanHanh, score, snippet}]}` |
| POST | `/ai/chat` | Mọi vai trò | `{messages}` → **SSE**: `data {"type":"sources","sources":[…]}` → `data {"type":"delta","text"}` ×N → `data {"type":"done"}`; lỗi giữa stream: `{"type":"error","message"}` |
| GET | `/admin/ai/config` | ADMIN | Cấu hình hiện tại (apiKey mask `••••`) — shape `{data: …}` |
| PUT | `/admin/ai/config` | ADMIN | Cập nhật từng trường optional; gửi lại mask → giữ key cũ; key không ghi ra audit |
| GET | `/admin/ai/status` | ADMIN | `{ocr: {status,url}, chat, embed, rerank, chunks, documents, indexedDocs}` |
| POST | `/admin/ai/reindex` | ADMIN | `{documentId?}` — embed lại (batch 16, chunk ≤800 ký tự) → `{indexed, chunks}` |

Lỗi chung: chưa cấu hình → `400 {"error":"Chưa cấu hình AI: hãy yêu cầu quản trị viên cấu hình trong Quản trị → Trợ lý AI"}`. Tạo/sửa văn bản tự index ngầm (fire-and-forget, lỗi AI không ảnh hưởng nhập sổ).
