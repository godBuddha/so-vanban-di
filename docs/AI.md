# Trợ lý AI — Hướng dẫn cấu hình & sử dụng (từ v1.0.1)

Hệ thống hỗ trợ **2 dạng AI**, dùng được độc lập hoặc kết hợp — đúng cách Cherry Studio cho phép cấu hình nhà cung cấp:

| Dạng | Dịch vụ | Dùng cho |
|---|---|---|
| **AI qua API provider** | Bất kỳ dịch vụ tương thích OpenAI (OpenAI, Gemini/OpenRouter, Groq, SiliconFlow, Together, DeepSeek…) | Hội thoại, embedding, rerank |
| **AI local (Ollama)** | Ollama chạy ngay trong stack Docker | Hội thoại, embedding — dữ liệu không rời máy chủ |
| **OCR PaddleOCR** | Container riêng trong stack (PaddleOCR CPU, model tiếng Việt) | Nhận dạng chữ từ ảnh/PDF |

> 🔒 **Bảo mật**: mọi model/API key cấu hình trong giao diện *Quản trị → Trợ lý AI* (chỉ ADMIN), không đặt trong `.env`. Nếu dùng Ollama + PaddleOCR local thì **dữ liệu văn bản không rời khỏi VPS**.

---

## 1. Bật dịch vụ trong Docker

```bash
# OCR (chạy cùng stack, luôn bật khi ./scripts/deploy.sh)
# Ollama (tuỳ chọn — AI local):
docker compose -f docker-compose.prod.yml --profile ai up -d
docker compose -f docker-compose.prod.yml exec ollama ollama pull qwen2.5:7b     # hội thoại (~4.7GB, cần ~8GB RAM)
docker compose -f docker-compose.prod.yml exec ollama ollama pull bge-m3        # embedding 1024 chiều (~1.2GB)
# Giám sát (tuỳ chọn):
docker compose -f docker-compose.prod.yml --profile monitor up -d
```

## 2. Cấu hình trong giao diện (ADMIN)

Đăng nhập ADMIN → **Quản trị → Trợ lý AI**:

| Mục | Bật AI local | Bật AI qua API |
|---|---|---|
| Trợ lý hội thoại | Ollama · `http://ollama:11434` · model `qwen2.5:7b` | OpenAI tương thích · `https://api.openai.com` (hoặc OpenRouter/SiliconFlow…) · key · model |
| Embedding | Ollama · model `bge-m3` | cùng provider, model `text-embedding-3-small`… |
| Rerank | — (Ollama chưa có rerank) | OpenAI tương thích `/rerank` (Jina/SiliconFlow): URL + key + model |
| OCR | `http://ocr:8000` (mặc định) | — |

Bấm **Kiểm tra kết nối** → từng dịch vụ hiện ✓/✗, kèm số khối văn bản đã lập chỉ mục.

## 3. Tính năng

### 3.1 Nhận dạng văn bản (OCR) — trong form nhập
Nút **📷 Nhận dạng từ ảnh/PDF** → chọn ảnh chụp văn bản hoặc PDF → hệ thống OCR (PaddleOCR tiếng Việt) rồi dùng LLM trích cấu trúc → tự điền số ký hiệu, ngày ban hành, người ký, trích yếu, nơi nhận, đoán loại văn bản — và đính kèm file gốc. Văn thư chỉ soát lại và bấm Lưu.

> Pipeline giống Cherry Studio: **PaddleOCR trích chữ thô → LLM chuyển thành JSON có cấu trúc**. Nếu chưa cấu hình LLM, chỉ nhận được chữ thô (đã đủ để copy).

### 3.2 Tìm kiếm ngữ nghĩa (RAG)
Ví kiểu Cherry Studio: khi văn bản được tạo/sửa, nội dung (số, trích yếu, người ký, nơi nhận…) được **chunking → embedding** lưu vào PostgreSQL (pgvector). Tìm kiếm:
1. Câu hỏi → embedding → so khớp cosine trong pgvector (kết quả thô ×3)
2. Có cấu hình **Rerank** → xếp lại theo mức liên quan (bge-reranker / jina-reranker) → top 10

Kết quả kèm điểm % và đoạn trích bôi đậm.

### 3.3 Trợ lý hỏi đáp
Chat có **RAG**: mỗi câu hỏi được truy xuất 6 văn bản liên quan nhất nhét vào ngữ cảnh → LLM trả lời **dựa chỉ trên sổ**, kèm thẻ "Nguồn tham chiếu" (số vào sổ + số ký hiệu), trả lời theo luồng (stream).

---

## 4. Cấu hình tối thiểu theo nhu cầu

| Muốn dùng | Cần cấu hình | RAM thêm |
|---|---|---|
| Chỉ OCR điền form | OCR (mặc định) | ~2GB (container OCR) |
| + Tìm kiếm ngữ nghĩa | Embedding (Ollama `bge-m3` hoặc API) | +2GB nếu local |
| + Trợ lý hỏi đáp | Hội thoại (Ollama 7B hoặc API) | +5GB nếu local |
| + Rerank chính xác hơn | Rerank qua API (SiliconFlow/Jina có gói free) | 0 |

Yêu cầu RAM tổng: **cơ bản 4GB · +OCR 6GB · AI local đầy đủ 8–12GB** (hoặc AI qua API thì giữ 4–6GB).

## 5. Lập chỉ mục (embedding) dữ liệu

- Văn bản **mới nhập tự động** được index ngầm (lỗi AI không làm lỗi nhập sổ).
- Dữ liệu cũ: Quản trị → Trợ lý AI → **Lập chỉ mục lại toàn bộ**.

## 6. Lỗi thường gặp

| Hiện tượng | Xử lý |
|---|---|
| "Chưa cấu hình AI" khi dùng trợ lý | ADMIN vào Quản trị → Trợ lý AI cấu hình provider + model |
| Kiểm tra kết nối ✗ Ollama | Container chưa chạy: `--profile ai up -d`; model chưa pull |
| OCR báo lỗi | `docker compose -f docker-compose.prod.yml logs ocr`; lần chạy đầu container tải model (~1 phút) |
| Tìm kiếm kém liên quan | Bật Rerank (API) hoặc đổi embedding model chất lượng hơn (bge-m3) |
| Đổi model embedding | Phải bấm **Lập chỉ mục lại toàn bộ** (vector cũ sai chiều) |
