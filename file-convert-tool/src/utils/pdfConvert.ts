// ============================================================
// PDF 转换模块
// PDF 转图片（PNG/JPG）、PDF 文本提取
// 使用 pdfjs-dist 渲染，纯前端执行
// ============================================================

import * as pdfjsLib from 'pdfjs-dist'

// PDF.js Worker — 使用 Vite 内置的模块解析，从 node_modules 直接加载
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

/** 进度回调 */
type ProgressCallback = (progress: number) => void

// ============================================================
// 内部工具函数
// ============================================================

/**
 * 解析页码范围字符串为数字数组
 * 支持格式：
 *   - "all" 或 "" → 全部页面
 *   - "1-3" → [1, 2, 3]
 *   - "1,3,5" → [1, 3, 5]
 *   - "1-3,7,9-11" → [1,2,3,7,9,10,11]
 *
 * @param rangeStr - 页码范围字符串
 * @param totalPages - PDF 总页数
 * @returns 有效页码数组（从1开始）
 */
const parsePageRange = (rangeStr: string, totalPages: number): number[] => {
  // 空字符串或 "all" 表示全部页面
  if (!rangeStr || rangeStr.trim() === '' || rangeStr.trim().toLowerCase() === 'all') {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const pages = new Set<number>()

  try {
    const parts = rangeStr.split(',')

    for (const part of parts) {
      const trimmed = part.trim()
      if (!trimmed) continue

      if (trimmed.includes('-')) {
        // 范围：如 "1-5"
        const [startStr, endStr] = trimmed.split('-')
        const start = Math.max(1, parseInt(startStr, 10) || 1)
        const end = Math.min(totalPages, parseInt(endStr, 10) || totalPages)
        for (let i = start; i <= end; i++) {
          pages.add(i)
        }
      } else {
        // 单页：如 "3"
        const page = parseInt(trimmed, 10)
        if (!isNaN(page) && page >= 1 && page <= totalPages) {
          pages.add(page)
        }
      }
    }
  } catch {
    // 解析失败，返回全部页面
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  // 如果解析结果为空，返回全部页面
  if (pages.size === 0) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  return Array.from(pages).sort((a, b) => a - b)
}

/**
 * 将 PDF 单页渲染到 Canvas
 *
 * @param page - pdfjs 页面对象
 * @param scale - 渲染缩放（默认2倍高清）
 * @returns 渲染后的 Canvas 元素
 */
const renderPageToCanvas = async (
  page: pdfjsLib.PDFPageProxy,
  scale: number = 2
): Promise<HTMLCanvasElement> => {
  const viewport = page.getViewport({ scale })

  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas 2D 上下文创建失败')
  }

  await page.render({
    canvasContext: ctx,
    viewport,
    canvas
  }).promise

  return canvas
}

/**
 * 将 Canvas 导出为指定格式图片 Blob
 */
const canvasToImageBlob = (
  canvas: HTMLCanvasElement,
  format: 'png' | 'jpg',
  quality: number
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png'
    canvas.toBlob(
      (blob) => {
        if (blob && blob.size > 0) {
          resolve(blob)
        } else {
          reject(new Error('页面渲染失败：导出的图片为空'))
        }
      },
      mimeType,
      quality
    )
  })
}

// ============================================================
// 对外导出函数
// ============================================================

/**
 * PDF 转图片（逐页渲染为 PNG/JPG）
 * 支持选择页码范围和输出质量
 *
 * @param file - PDF 文件
 * @param targetFormat - 输出图片格式 png | jpg
 * @param pageRange - 页码范围 "all" | "1-3" | "1,3,5"
 * @param quality - 图片质量 (0-1)，仅 JPG 有效
 * @param onProgress - 进度回调
 * @returns 每页渲染结果的 Blob 数组
 */
export const pdfToImages = async (
  file: File,
  targetFormat: 'png' | 'jpg',
  pageRange: string,
  quality: number = 0.92,
  onProgress?: ProgressCallback
): Promise<Blob[]> => {
  if (!file || file.size === 0) {
    throw new Error('PDF 文件为空')
  }

  // MIME类型二次校验
  if (file.type && file.type !== 'application/pdf') {
    throw new Error(`不是有效的 PDF 文件：${file.type}`)
  }

  try {
    onProgress?.(0)

    // 步骤1：读取文件二进制数据
    const arrayBuffer = await file.arrayBuffer()
    onProgress?.(5)

    // 步骤2：加载 PDF 文档
    const pdf = await pdfjsLib.getDocument({
      data: arrayBuffer,
      // 密码保护检测（不设password则自动检测）
    }).promise
    onProgress?.(10)

    const totalPages = pdf.numPages

    // 步骤3：解析页码范围
    const pagesToRender = parsePageRange(pageRange, totalPages)

    if (pagesToRender.length === 0) {
      throw new Error('指定的页码范围无效')
    }

    // 步骤4：逐页渲染
    const blobs: Blob[] = []

    for (let i = 0; i < pagesToRender.length; i++) {
      const pageNum = pagesToRender[i]

      // 获取页面
      const page = await pdf.getPage(pageNum)

      // 渲染到Canvas（2倍缩放保证清晰度）
      const canvas = await renderPageToCanvas(page, 2)

      // 导出为图片Blob
      const blob = await canvasToImageBlob(canvas, targetFormat, quality)
      blobs.push(blob)

      // 更新进度 10-95
      const progress = 10 + Math.round(((i + 1) / pagesToRender.length) * 85)
      onProgress?.(progress)
    }

    onProgress?.(100)
    return blobs
  } catch (err) {
    throw new Error(
      `PDF 转换图片失败：${err instanceof Error ? err.message : '未知错误'}`
    )
  }
}

/**
 * 从 PDF 提取纯文本内容（用于 PDF 转 Word/Excel 预处理）
 * 按页提取，保留页码信息
 *
 * @param file - PDF 文件
 * @param onProgress - 进度回调
 * @returns 每页文本内容数组
 */
export const extractPdfText = async (
  file: File,
  onProgress?: ProgressCallback
): Promise<Array<{ pageNum: number; text: string }>> => {
  if (!file || file.size === 0) {
    throw new Error('PDF 文件为空')
  }

  try {
    onProgress?.(5)

    const arrayBuffer = await file.arrayBuffer()
    onProgress?.(10)

    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    const totalPages = pdf.numPages

    const results: Array<{ pageNum: number; text: string }> = []

    for (let i = 1; i <= totalPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()

      // 合并文本项，用空格连接
      const text = content.items
        .map((item: Record<string, unknown>) => {
          // pdfjs TextItem 有 str 属性和 hasEOL
          const str = (item as { str?: string }).str || ''
          const hasEOL = (item as { hasEOL?: boolean }).hasEOL || false
          return str + (hasEOL ? '\n' : '')
        })
        .join(' ')

      results.push({ pageNum: i, text })

      const progress = 10 + Math.round((i / totalPages) * 85)
      onProgress?.(progress)
    }

    onProgress?.(100)
    return results
  } catch (err) {
    throw new Error(
      `PDF 文本提取失败：${err instanceof Error ? err.message : '未知错误'}`
    )
  }
}

/**
 * 获取 PDF 页数（用于预览）
 *
 * @param file - PDF 文件
 * @returns 总页数
 */
export const getPdfPageCount = async (file: File): Promise<number> => {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  return pdf.numPages
}
