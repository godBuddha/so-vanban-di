// Service ghi audit log — mọi thao tác quan trọng đều chép lịch sử
import prisma from '../db.js';

export type AuditAction =
  | 'CREATE' | 'UPDATE' | 'DELETE'
  | 'LOGIN' | 'IMPORT' | 'EXPORT'
  | 'UPLOAD' | 'ATTACHMENT_DELETE';

export interface AuditInput {
  userId: number;
  action: AuditAction;
  entity: string;            // "Document" | "User" | "Attachment" | "Auth" | "Export"
  entityId?: number | null;
  detail?: string | null;    // Mô tả ngắn tiếng Việt
  documentId?: number | null;
}

/** Ghi một dòng audit log — lỗi ghi log không được làm hỏng nghiệp vụ chính */
export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        detail: input.detail ?? null,
        documentId: input.documentId ?? null,
      },
    });
  } catch (err) {
    console.error('Ghi audit log thất bại:', err);
  }
}
