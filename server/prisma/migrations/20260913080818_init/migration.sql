-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'VANTHU', 'TRACUU');

-- CreateEnum
CREATE TYPE "DocType" AS ENUM ('CONG_VAN', 'CONG_DIEN', 'QUYET_DINH', 'CHI_THI', 'BAO_CAO', 'THONG_BAO', 'HO_NGHI', 'GIOI_THIEU', 'KHAC');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'TRACUU',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" SERIAL NOT NULL,
    "soVaoSo" INTEGER NOT NULL,
    "nam" INTEGER NOT NULL,
    "loaiVB" "DocType" NOT NULL DEFAULT 'CONG_VAN',
    "soKyHieu" TEXT NOT NULL,
    "ngayBanHanh" DATE NOT NULL,
    "nguoiKy" TEXT NOT NULL,
    "trichYeu" TEXT NOT NULL,
    "noiNhan" TEXT NOT NULL,
    "soBan" INTEGER NOT NULL DEFAULT 1,
    "ghiChu" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "nguoiTaoId" INTEGER NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" INTEGER,
    "detail" TEXT,
    "documentId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "year_counters" (
    "nam" INTEGER NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "year_counters_pkey" PRIMARY KEY ("nam")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "documents_nam_soVaoSo_idx" ON "documents"("nam", "soVaoSo");

-- CreateIndex
CREATE INDEX "documents_ngayBanHanh_idx" ON "documents"("ngayBanHanh");

-- CreateIndex
CREATE INDEX "documents_trichYeu_idx" ON "documents"("trichYeu");

-- CreateIndex
CREATE UNIQUE INDEX "documents_soVaoSo_nam_key" ON "documents"("soVaoSo", "nam");

-- CreateIndex
CREATE INDEX "attachments_documentId_idx" ON "attachments"("documentId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_nguoiTaoId_fkey" FOREIGN KEY ("nguoiTaoId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
