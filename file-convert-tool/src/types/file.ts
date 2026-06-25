// ============================================================
// 文件转换工具 - 核心类型定义
// 所有TS类型严格定义，杜绝隐式any
// ============================================================

/** 支持的文件格式类型 */
export type FileType = 'pdf' | 'docx' | 'xlsx' | 'png' | 'jpg' | 'webp'

/** 转换任务状态 */
export type ConvertStatus = 'idle' | 'loading' | 'success' | 'error'

/** 单个文件转换任务对象 */
export interface ConvertFileItem {
  id: string
  file: File
  fileName: string
  fileSize: number
  fileType: FileType
  targetType: FileType
  status: ConvertStatus
  /** 转换进度 0-100 */
  progress: number
  /** 错误信息 */
  errorMsg: string
  /** 单个结果文件 */
  resultBlob?: Blob
  /** 多个结果文件（PDF转图片时多页） */
  resultBlobs?: Blob[]
}

/** 转换配置选项 */
export interface ConvertOption {
  /** 图片质量 0-1 */
  imageQuality: number
  /** PDF转换页码范围，如 "1-3,5" 或 "all" */
  pdfPageRange: string
  /** 目标转换格式 */
  targetType: FileType
}

/** 文件上传校验结果 */
export interface FileCheckResult {
  valid: boolean
  error?: string
  fileType?: FileType
}

/** 单个转换结果 */
export interface ConvertResult {
  success: boolean
  blob?: Blob
  blobs?: Blob[]
  fileName: string
  error?: string
}

/** Toast消息类型 */
export type ToastType = 'success' | 'error' | 'info' | 'warning'

/** Toast消息 */
export interface ToastMessage {
  id: string
  type: ToastType
  message: string
  duration: number
}

// ============================================================
// 常量映射表
// ============================================================

/** MIME类型 → 文件类型映射 */
export const SUPPORTED_MIME_TYPES: Record<string, FileType> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp'
}

/** 扩展名 → 文件类型映射（MIME降级判断） */
export const EXTENSION_TYPE_MAP: Record<string, FileType> = {
  'pdf': 'pdf',
  'docx': 'docx',
  'xlsx': 'xlsx',
  'png': 'png',
  'jpg': 'jpg',
  'jpeg': 'jpg',
  'webp': 'webp'
}

/** 每种源格式可转换的目标格式列表 */
export const CONVERSION_TARGETS: Record<FileType, FileType[]> = {
  pdf: ['png', 'jpg', 'docx', 'xlsx'],
  docx: ['pdf', 'png', 'jpg'],
  xlsx: ['pdf', 'png', 'jpg'],
  png: ['jpg', 'webp', 'pdf'],
  jpg: ['png', 'webp', 'pdf'],
  webp: ['png', 'jpg', 'pdf']
}

/** 文件类型 → 扩展名映射 */
export const FILE_EXTENSIONS: Record<FileType, string> = {
  pdf: 'pdf',
  docx: 'docx',
  xlsx: 'xlsx',
  png: 'png',
  jpg: 'jpg',
  webp: 'webp'
}

/** 文件类型 → MIME类型映射 */
export const FILE_MIME_TYPES: Record<FileType, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp'
}

/** 文件类型中文名映射 */
export const FILE_TYPE_LABELS: Record<FileType, string> = {
  pdf: 'PDF',
  docx: 'Word',
  xlsx: 'Excel',
  png: 'PNG',
  jpg: 'JPG',
  webp: 'WebP'
}

/** 文件类型对应图标（emoji） */
export const FILE_TYPE_ICONS: Record<FileType, string> = {
  pdf: '📄',
  docx: '📝',
  xlsx: '📊',
  png: '🖼️',
  jpg: '🖼️',
  webp: '🖼️'
}

/** 上传接受的文件MIME类型 */
export const ACCEPT_MIME_TYPES = Object.keys(SUPPORTED_MIME_TYPES).join(',')

/** 上传接受的文件扩展名 */
export const ACCEPT_EXTENSIONS = Object.values(FILE_EXTENSIONS)
  .map(ext => `.${ext}`)
  .join(',')
