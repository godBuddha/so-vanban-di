// ===== Kiểu dữ liệu khớp hợp đồng API (docs/API.md) =====
import type { DocType, Role } from './docTypes'

export interface UserAuth {
  id: number
  username: string
  fullName: string
  role: Role
}

export interface Attachment {
  id: number
  fileName: string
  size: number
}

export interface DocumentDTO {
  id: number
  soVaoSo: number
  nam: number
  loaiVB: DocType
  soKyHieu: string
  ngayBanHanh: string // YYYY-MM-DD
  nguoiKy: string
  trichYeu: string
  noiNhan: string
  soBan: number
  ghiChu: string | null
  nguoiTao: { id: number; fullName: string }
  attachments: Attachment[]
  createdAt: string
  updatedAt: string
}

export interface PagedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

export interface DocumentFilters {
  q?: string
  nam?: number | ''
  loaiVB?: DocType | ''
  noiNhan?: string
  from?: string
  to?: string
  page?: number
  pageSize?: number
  sort?: 'soVaoSo' | 'ngayBanHanh'
  order?: 'asc' | 'desc'
}

export interface NextNumberInfo {
  soVaoSo: number
  soKyHieu: string
}

export interface UserRow {
  id: number
  username: string
  fullName: string
  role: Role
  active: boolean
  createdAt?: string
  updatedAt?: string
}

export interface AuditLogRow {
  id: number
  user: { fullName: string } | null
  action: string
  entity: string
  entityId: number | null
  detail: string | null
  createdAt: string
}

export interface ImportResult {
  created: number
  skipped: number
  errors: { row: number; message: string }[]
}
