# Dịch vụ OCR cho Sổ Văn Bản Đi — nhận dạng chữ tiếng Việt bằng PaddleOCR (CPU).
# Nhận ảnh (jpg/png/...) hoặc PDF; PDF sẽ được chuyển từng trang sang ảnh (poppler-utils).
# Model PP-OCRv6 medium (det + rec đa ngôn ngữ, nhận đúng dấu tiếng Việt).
# LẦN ĐẦU KHỞI ĐỘNG sẽ tự tải model ~200MB vào ~/.paddlex
# (chỉ tải 1 lần; các lần khởi động sau dùng lại cache có sẵn).

import io
import os
import threading
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
from pdf2image import convert_from_bytes

MAX_UPLOAD = int(os.getenv("OCR_MAX_MB", "20")) * 1024 * 1024  # giới hạn 20MB
ALLOWED_TYPES = {
    "image/jpeg", "image/png", "image/webp", "image/bmp", "image/tiff",
    "application/pdf",
}
MODEL_WAIT_SECONDS = 300  # chờ model tải xong tối đa 5 phút

state = {"ocr": None, "ready": False, "error": None}
_lock = threading.Lock()


def _load_model() -> None:
    """Khởi tạo PaddleOCR đúng 1 lần (chạy nền lúc app start để /health không bị treo)."""
    from paddleocr import PaddleOCR

    try:
        with _lock:
            if state["ocr"] is None:
                # PP-OCRv6: 1 model đa ngôn ngữ 50 thứ tự (gồm tiếng Việt, nhận đúng dấu).
                # Tên model có thể override qua env (VD khi có model rec fine-tuned tiếng Việt
                # muốn thay vào, chỉ cần đặt OCR_REC_MODEL trong compose, không cần sửa code).
                # Lưu ý chất lượng: model đa ngôn ngữ gốc vẫn hay bỏ dấu "ơ/ư" (VD "mời họp"
                # → "mi hop"). Muốn chính xác 100% cần model rec fine-tuned riêng cho tiếng Việt.
                state["ocr"] = PaddleOCR(
                    text_detection_model_name=os.getenv("OCR_DET_MODEL", "PP-OCRv6_medium_det"),
                    text_recognition_model_name=os.getenv("OCR_REC_MODEL", "PP-OCRv6_medium_rec"),
                    use_doc_orientation_classify=False,
                    use_doc_unwarping=False,
                    use_textline_orientation=False,
                )
                state["ready"] = True
    except Exception as exc:  # noqa: BLE001
        state["error"] = f"Lỗi khởi tạo model OCR: {exc}"
        raise


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Tải model nền ngay khi app start; /health vẫn trả lời được trong lúc tải
    threading.Thread(target=_load_model, name="ocr-model-init", daemon=True).start()
    yield


app = FastAPI(title="OCR — Sổ Văn Bản Đi", lifespan=lifespan)


@app.get("/health")
def health():
    return {"ok": True, "ready": state["ready"], "error": state["error"]}


def _wait_model() -> None:
    deadline = time.time() + MODEL_WAIT_SECONDS
    while not state["ready"] and state["error"] is None and time.time() < deadline:
        time.sleep(1)
    if state["error"]:
        raise HTTPException(status_code=503, detail=state["error"])
    if not state["ready"]:
        raise HTTPException(status_code=503, detail="Model OCR chưa tải xong, thử lại sau")


def _images_from_pdf(data: bytes):
    try:
        return convert_from_bytes(data, dpi=200, fmt="png")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=f"Không đọc được PDF: {exc}")


def _images_from_bytes(data: bytes):
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
        return [img]
    except UnidentifiedImageError:
        raise HTTPException(status_code=415, detail="Định dạng ảnh không hỗ trợ")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=f"Không đọc được ảnh: {exc}")


def _run_ocr(images) -> tuple[str, int]:
    import numpy as np

    pages_text: list[str] = []
    for img in images:
        result = state["ocr"].predict(np.array(img.convert("RGB")))
        lines: list[str] = []
        for page in result:
            lines.extend(page["rec_texts"])
        pages_text.append("\n".join(t for t in lines if t.strip()))
    text = "\n".join(pages_text)
    return text, len(images)


@app.post("/ocr")
async def ocr(file: UploadFile = File(...)):
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail="Chỉ nhận ảnh (jpg/png/webp/bmp/tiff) hoặc PDF")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="File rỗng")
    if len(data) > MAX_UPLOAD:
        raise HTTPException(
            status_code=413,
            detail=f"File quá lớn (tối đa {MAX_UPLOAD // (1024 * 1024)}MB)",
        )

    _wait_model()

    images = _images_from_pdf(data) if content_type == "application/pdf" else _images_from_bytes(data)
    text, pages = _run_ocr(images)
    return {"text": text, "pages": pages}
