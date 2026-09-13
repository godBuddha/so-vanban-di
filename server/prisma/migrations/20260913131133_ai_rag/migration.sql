-- Module AI/RAG: pgvector + cấu hình AI + đoạn vector văn bản
-- Yêu cầu DB dùng image pgvector/pgvector:pg16 (extension tạo tự động nếu thiếu)

CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "AiConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "chatProvider" TEXT NOT NULL DEFAULT 'none',
    "ollamaBaseUrl" TEXT,
    "openaiBaseUrl" TEXT,
    "openaiApiKey" TEXT,
    "chatModel" TEXT,
    "embedProvider" TEXT NOT NULL DEFAULT 'none',
    "embedModel" TEXT,
    "rerankProvider" TEXT NOT NULL DEFAULT 'none',
    "rerankBaseUrl" TEXT,
    "rerankApiKey" TEXT,
    "rerankModel" TEXT,
    "ocrUrl" TEXT NOT NULL DEFAULT 'http://ocr:8000',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentChunk" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentChunk_documentId_idx" ON "DocumentChunk"("documentId");

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Dòng cấu hình mặc định (singleton id=1)
INSERT INTO "AiConfig" ("id", "updatedAt") VALUES (1, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
