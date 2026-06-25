// ============================================================
// 转换器编排模块 — 按源/目标类型路由，统一错误/进度/日志
// ============================================================

import type { FileType, ConvertFileItem, ConvertOption, ConvertResult } from '@/types/file'
import { FILE_EXTENSIONS } from '@/types/file'
import { convertSingleImage, imagesToPdf } from './imageConvert'
import { pdfToImages } from './pdfConvert'
import { excelToPdf, pdfToExcel, wordToPdf, pdfToWord, officeToImages } from './officeConvert'

export type ProgressCallback = (progress: number) => void
export type LogCallback = (msg: string) => void

export const executeConvert = async (
  file: File,
  sourceType: FileType,
  options: ConvertOption,
  onProgress?: ProgressCallback,
  onLog?: LogCallback
): Promise<ConvertResult> => {
  const { targetType, imageQuality, pdfPageRange } = options
  const log = onLog || (() => {})

  try {
    log(`开始转换: ${sourceType.toUpperCase()} → ${targetType.toUpperCase()}`)
    const result = await route(file, sourceType, targetType, { imageQuality, pdfPageRange, onProgress: onProgress || (() => {}), onLog: log })
    log('转换完成')
    return result
  } catch (err) {
    const msg = err instanceof Error ? err.message : '未知错误'
    log(`❌ 失败: ${msg}`)
    return { success: false, fileName: file.name, error: msg }
  }
}

const route = async (
  file: File, src: FileType, tgt: FileType,
  ctx: { imageQuality: number; pdfPageRange: string; onProgress: ProgressCallback; onLog: LogCallback }
): Promise<ConvertResult> => {
  const { imageQuality, pdfPageRange, onProgress, onLog } = ctx
  const ext = FILE_EXTENSIONS[tgt]

  // 图片 ↔ 图片
  if (['png','jpg','webp'].includes(src) && ['png','jpg','webp'].includes(tgt)) {
    if (src === tgt) throw new Error('源格式和目标格式相同')
    const blob = await convertSingleImage(file, tgt as 'png'|'jpg'|'webp', { quality: imageQuality }, onProgress)
    return { success: true, blob, fileName: swapExt(file.name, ext) }
  }

  // 图片 → PDF
  if (['png','jpg','webp'].includes(src) && tgt === 'pdf') {
    const blob = await imagesToPdf([file], onProgress)
    return { success: true, blob, fileName: swapExt(file.name, 'pdf') }
  }

  // PDF → 图片
  if (src === 'pdf' && ['png','jpg'].includes(tgt)) {
    const blobs = await pdfToImages(file, tgt as 'png'|'jpg', pdfPageRange, imageQuality, onProgress)
    return { success: true, blobs, fileName: swapExt(file.name, ext) }
  }

  // Excel → PDF
  if (src === 'xlsx' && tgt === 'pdf') {
    const blob = await excelToPdf(file, onProgress, onLog)
    return { success: true, blob, fileName: swapExt(file.name, 'pdf') }
  }

  // PDF → Excel
  if (src === 'pdf' && tgt === 'xlsx') {
    const blob = await pdfToExcel(file, onProgress, onLog)
    return { success: true, blob, fileName: swapExt(file.name, 'xlsx') }
  }

  // Word → PDF
  if (src === 'docx' && tgt === 'pdf') {
    const blob = await wordToPdf(file, onProgress, onLog)
    return { success: true, blob, fileName: swapExt(file.name, 'pdf') }
  }

  // PDF → Word
  if (src === 'pdf' && tgt === 'docx') {
    const blob = await pdfToWord(file, onProgress, onLog)
    return { success: true, blob, fileName: swapExt(file.name, 'docx') }
  }

  // Word/Excel → 图片
  if (['docx','xlsx'].includes(src) && ['png','jpg'].includes(tgt)) {
    const blobs = await officeToImages(file, src as 'docx'|'xlsx', tgt as 'png'|'jpg', imageQuality, onProgress, onLog)
    return { success: true, blobs, fileName: swapExt(file.name, ext) }
  }

  throw new Error(`不支持的转换: ${src.toUpperCase()} → ${tgt.toUpperCase()}`)
}

const swapExt = (name: string, ext: string) => name.replace(/\.[^.]+$/, '') + '.' + ext

// 保留批量接口（兼容旧引用）
export const executeBatchConvert = async (
  items: ConvertFileItem[],
  options: ConvertOption,
  onItemProgress?: (id: string, p: number) => void,
  onItemComplete?: (id: string, r: ConvertResult) => void
): Promise<void> => {
  for (const item of items) {
    if (item.status === 'error') continue
    try {
      const r = await executeConvert(item.file, item.fileType, options, (p) => onItemProgress?.(item.id, p))
      onItemComplete?.(item.id, r)
    } catch (err) {
      onItemComplete?.(item.id, { success: false, fileName: item.fileName, error: err instanceof Error ? err.message : '未知错误' })
    }
  }
}
