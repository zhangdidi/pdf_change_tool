// ============================================================
// 文件校验模块 - 格式校验、大小校验、类型判断
// ============================================================

import type { FileType, FileCheckResult } from '@/types/file'
import { SUPPORTED_MIME_TYPES, EXTENSION_TYPE_MAP } from '@/types/file'

/** 单文件最大大小限制 50MB */
const MAX_FILE_SIZE = 50 * 1024 * 1024

/**
 * 获取文件类型（MIME优先，扩展名降级）
 */
export const getFileType = (file: File): FileType | null => {
  // 优先通过MIME类型判断
  if (SUPPORTED_MIME_TYPES[file.type]) {
    return SUPPORTED_MIME_TYPES[file.type]
  }
  // MIME为空或未识别时，降级为扩展名判断
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  return EXTENSION_TYPE_MAP[ext] || null
}

/**
 * 校验文件是否支持
 */
export const checkFileSupport = (file: File): boolean => {
  return getFileType(file) !== null
}

/**
 * 校验文件大小是否在限制内
 */
export const checkFileSize = (file: File): boolean => {
  return file.size <= MAX_FILE_SIZE
}

/**
 * 综合校验文件（格式 + 大小 + 空文件）
 */
export const validateFile = (file: File): FileCheckResult => {
  // 空文件检查
  if (!file || file.size === 0) {
    return { valid: false, error: '文件为空，请重新选择' }
  }

  // 格式校验
  const fileType = getFileType(file)
  if (!fileType) {
    return {
      valid: false,
      error: `不支持的文件格式".${file.name.split('.').pop()}"，支持：PDF、Word、Excel、PNG、JPG、WebP`
    }
  }

  // 大小校验
  if (!checkFileSize(file)) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(1)
    const maxMB = (MAX_FILE_SIZE / 1024 / 1024).toFixed(0)
    return {
      valid: false,
      error: `文件大小超出限制：${sizeMB}MB > ${maxMB}MB，请压缩后重试`
    }
  }

  return { valid: true, fileType }
}

/**
 * 批量校验多个文件
 */
export const validateFiles = (files: File[]): FileCheckResult[] => {
  return files.map(file => validateFile(file))
}

/**
 * 生成唯一文件ID
 */
export const createFileId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * 格式化文件大小为可读字符串
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

/**
 * 获取文件扩展名
 */
export const getFileExtension = (fileName: string): string => {
  return fileName.split('.').pop()?.toLowerCase() || ''
}

/**
 * 替换文件扩展名
 */
export const changeFileExtension = (fileName: string, newExt: string): string => {
  const baseName = fileName.replace(/\.[^.]+$/, '')
  return `${baseName}.${newExt}`
}
