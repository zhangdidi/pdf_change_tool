// ============================================================
// 图片转换模块
// 支持 PNG ↔ JPG ↔ WebP 互转、多图合并PDF
// 使用 Canvas API 纯前端转换，无后端依赖
// ============================================================

import type { FileType } from '@/types/file'

/** 图片转换配置 */
export interface ImageConvertOptions {
  /** 输出质量 0-1 */
  quality: number
  /** 最大宽度（像素），超出等比缩放 */
  maxWidth?: number
  /** 最大高度（像素），超出等比缩放 */
  maxHeight?: number
}

/** 进度回调 */
type ProgressCallback = (progress: number) => void

// ============================================================
// 内部工具函数
// ============================================================

/**
 * 将 File 加载为 HTMLImageElement
 */
const loadImageFromFile = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('图片加载失败，文件可能已损坏或格式异常'))
      img.src = reader.result as string
    }
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}

/**
 * 根据目标格式获取 MIME 类型
 */
const getTargetMimeType = (format: FileType): string => {
  const mimeMap: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    webp: 'image/webp'
  }
  return mimeMap[format] || 'image/png'
}

/**
 * 在 Canvas 上绘制图片并返回 Canvas 对象
 * JPG 格式自动填充白色背景（JPG不支持透明）
 */
const drawImageToCanvas = (
  img: HTMLImageElement,
  targetFormat: FileType,
  maxWidth?: number,
  maxHeight?: number
): HTMLCanvasElement => {
  let drawWidth = img.naturalWidth
  let drawHeight = img.naturalHeight

  // 等比缩放逻辑
  if (maxWidth && drawWidth > maxWidth) {
    const ratio = maxWidth / drawWidth
    drawWidth = maxWidth
    drawHeight = Math.round(drawHeight * ratio)
  }
  if (maxHeight && drawHeight > maxHeight) {
    const ratio = maxHeight / drawHeight
    drawHeight = maxHeight
    drawWidth = Math.round(drawWidth * ratio)
  }

  const canvas = document.createElement('canvas')
  canvas.width = drawWidth
  canvas.height = drawHeight

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D 上下文创建失败')

  // JPG 不支持透明通道，用白色填充背景
  if (targetFormat === 'jpg') {
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, drawWidth, drawHeight)
  }

  ctx.drawImage(img, 0, 0, drawWidth, drawHeight)
  return canvas
}

/**
 * 将 Canvas 导出为指定格式的 Blob
 */
const canvasToBlob = (
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob && blob.size > 0) {
          resolve(blob)
        } else {
          reject(new Error('图片导出失败：生成的图片为空'))
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
 * 单张图片格式转换（PNG ↔ JPG ↔ WebP）
 * 支持质量调节和尺寸限制
 *
 * @param file - 源图片文件
 * @param targetFormat - 目标格式
 * @param options - 转换选项（质量、尺寸限制）
 * @param onProgress - 进度回调
 * @returns 转换后的图片 Blob
 */
export const convertSingleImage = async (
  file: File,
  targetFormat: 'png' | 'jpg' | 'webp',
  options: ImageConvertOptions,
  onProgress?: ProgressCallback
): Promise<Blob> => {
  const { quality, maxWidth, maxHeight } = options

  try {
    onProgress?.(10)

    // 步骤1：加载图片到内存
    const img = await loadImageFromFile(file)
    onProgress?.(40)

    // 步骤2：在Canvas上绘制（含缩放和背景处理）
    const canvas = drawImageToCanvas(img, targetFormat, maxWidth, maxHeight)
    onProgress?.(70)

    // 步骤3：导出为目标格式
    const mimeType = getTargetMimeType(targetFormat)
    const blob = await canvasToBlob(canvas, mimeType, quality)
    onProgress?.(100)

    return blob
  } catch (err) {
    throw new Error(
      `图片转换失败 (${targetFormat.toUpperCase()})：${err instanceof Error ? err.message : '未知错误'}`
    )
  }
}

/**
 * 批量图片转换
 *
 * @param files - 源图片文件数组
 * @param targetFormat - 目标格式
 * @param options - 转换选项
 * @param onProgress - 进度回调
 * @returns 转换后的 Blob 数组
 */
export const convertBatchImages = async (
  files: File[],
  targetFormat: 'png' | 'jpg' | 'webp',
  options: ImageConvertOptions,
  onProgress?: ProgressCallback
): Promise<Blob[]> => {
  const results: Blob[] = []

  for (let i = 0; i < files.length; i++) {
    const fileProgress = (p: number) => {
      // 每张图片在总进度中占比
      const totalProgress = Math.round(((i + p / 100) / files.length) * 100)
      onProgress?.(totalProgress)
    }

    const blob = await convertSingleImage(files[i], targetFormat, options, fileProgress)
    results.push(blob)
  }

  onProgress?.(100)
  return results
}

/**
 * 多张图片合并为单个 PDF 文件
 * 使用 pdf-lib 将每张图片嵌入为一页
 *
 * @param files - 图片文件数组
 * @param onProgress - 进度回调
 * @returns 合并后的 PDF Blob
 */
export const imagesToPdf = async (
  files: File[],
  onProgress?: ProgressCallback
): Promise<Blob> => {
  if (files.length === 0) {
    throw new Error('请至少选择一张图片')
  }

  try {
    onProgress?.(5)

    // 动态导入 pdf-lib（按需加载，减小首屏体积）
    const { PDFDocument } = await import('pdf-lib')

    const pdfDoc = await PDFDocument.create()
    onProgress?.(10)

    for (let i = 0; i < files.length; i++) {
      const file = files[i]

      // 读取图片二进制数据（pdf-lib 兼容 TS6 类型）
      const imgBytes = new Uint8Array(await file.arrayBuffer()) as unknown as Uint8Array

      // 根据源格式选择嵌入方式
      let pdfImage: Awaited<ReturnType<typeof pdfDoc.embedPng>>
      const fileType = file.type

      if (fileType === 'image/png') {
        pdfImage = await pdfDoc.embedPng(imgBytes)
      } else if (fileType === 'image/jpeg') {
        pdfImage = await pdfDoc.embedJpg(imgBytes)
      } else {
        // WebP 等其他格式先转为 PNG 再嵌入
        const pngBlob = await convertSingleImage(file, 'png', { quality: 1 })
        const pngArrayBuf = new Uint8Array(await pngBlob.arrayBuffer()) as unknown as Uint8Array
        pdfImage = await pdfDoc.embedPng(pngArrayBuf)
      }

      // 根据图片实际尺寸确定页面大小
      const pageWidth = Math.max(pdfImage.width + 40, 400)
      const pageHeight = Math.max(pdfImage.height + 40, 300)

      const page = pdfDoc.addPage([pageWidth, pageHeight])

      // 居中绘制图片
      page.drawImage(pdfImage, {
        x: (pageWidth - pdfImage.width) / 2,
        y: (pageHeight - pdfImage.height) / 2,
        width: pdfImage.width,
        height: pdfImage.height
      })

      // 更新进度 10-95
      const progress = 10 + Math.round(((i + 1) / files.length) * 85)
      onProgress?.(progress)
    }

    onProgress?.(95)

    // 保存PDF
    const pdfBytes = await pdfDoc.save()
    onProgress?.(100)

    return new Blob([pdfBytes as unknown as ArrayBuffer], { type: 'application/pdf' })
  } catch (err) {
    throw new Error(
      `图片合并PDF失败：${err instanceof Error ? err.message : '未知错误'}`
    )
  }
}

/**
 * 从图片 Blob 获取尺寸信息
 */
export const getImageDimensions = (
  file: File
): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(img.src)
    }
    img.onerror = () => reject(new Error('无法读取图片尺寸'))
    img.src = URL.createObjectURL(file)
  })
}
