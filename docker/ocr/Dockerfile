# ===== Sổ Văn Bản Đi — dịch vụ OCR (PaddleOCR, CPU) =====
# Lần đầu khởi động container sẽ tự tải model PP-OCRv6 medium (~200MB) vào
# /root/.paddlex trong container fs — chỉ tải 1 lần, không cần volume.

FROM python:3.11-slim

# libgl1 + libglib2.0-0: OpenCV (phụ thuộc của paddleocr)
# libgomp1: runtime OpenMP paddlepaddle cần khi import
# poppler-utils: pdf2image dùng để chuyển trang PDF thành ảnh
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libgl1 libglib2.0-0 libgomp1 poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
