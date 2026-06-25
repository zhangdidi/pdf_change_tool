// ============================================================
// Docx 内容 → Canvas PNG 渲染器
// 支持：文本（粗体/斜体）、图片、表格
// ============================================================

import type { DocxBlock, ImageBlock, TableBlock } from './docxParser'

const FONT = '14px -apple-system, "Microsoft YaHei", "PingFang SC", sans-serif'
const FONT_BOLD = 'bold 14px -apple-system, "Microsoft YaHei", "PingFang SC", sans-serif'
const FONT_ITALIC = 'italic 14px -apple-system, "Microsoft YaHei", "PingFang SC", sans-serif'
const FONT_BI = 'bold italic 14px -apple-system, "Microsoft YaHei", "PingFang SC", sans-serif'
const PAD = 24
const LINE_H = 24
const SCALE = 2
const CONTENT_W = 700

/**
 * 将 Docx 内容块渲染为 PNG Blob
 */
export const renderDocxBlocks = async (blocks: DocxBlock[]): Promise<Blob> => {
  // 第一遍：计算总高度
  const mCanvas = document.createElement('canvas')
  mCanvas.width = CONTENT_W + PAD * 2
  const mCtx = mCanvas.getContext('2d')!

  let totalH = PAD
  for (const block of blocks) {
    totalH += measureBlock(mCtx, block)
  }
  totalH += PAD

  // 第二遍：实际渲染
  const canvas = document.createElement('canvas')
  canvas.width = (CONTENT_W + PAD * 2) * SCALE
  canvas.height = totalH * SCALE
  const ctx = canvas.getContext('2d')!
  ctx.scale(SCALE, SCALE)

  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, canvas.width / SCALE, canvas.height / SCALE)
  ctx.fillStyle = '#1f2937'

  let y = PAD
  for (const block of blocks) {
    y += await renderBlock(ctx, block, y)
  }

  return canvasToBlob(canvas)
}

// ============================================================
// 测量块高度
// ============================================================

const measureBlock = (ctx: CanvasRenderingContext2D, block: DocxBlock): number => {
  switch (block.type) {
    case 'paragraph': {
      const text = block.runs.map(r => r.text).join('')
      // 用正则字体测量
      ctx.font = block.runs.some(r => r.bold && r.italic) ? FONT_BI
        : block.runs.some(r => r.bold) ? FONT_BOLD
        : block.runs.some(r => r.italic) ? FONT_ITALIC
        : FONT
      const lines = wrapLines(ctx, text, CONTENT_W)
      return lines.length * LINE_H + 6  // +6 段落间距
    }
    case 'image': {
      const imgH = block.height
      const imgW = block.width
      const scaledH = Math.min(imgH, (CONTENT_W / imgW) * imgH)
      return scaledH + 12
    }
    case 'table': {
      let h = 0
      for (const row of block.rows) {
        let rowH = 0
        for (const cell of row) {
          const text = cell.map(r => r.text).join('')
          ctx.font = FONT
          const lines = wrapLines(ctx, text, Math.floor(CONTENT_W / Math.max(1, row.length)) - 10)
          rowH = Math.max(rowH, lines.length * 22 + 12)
        }
        h += rowH
      }
      return h + 4
    }
    default:
      return 0
  }
}

// ============================================================
// 渲染单个块
// ============================================================

const renderBlock = async (ctx: CanvasRenderingContext2D, block: DocxBlock, startY: number): Promise<number> => {
  switch (block.type) {
    case 'paragraph':
      return renderParagraph(ctx, block, startY)
    case 'image':
      return renderImage(ctx, block, startY)
    case 'table':
      return renderTable(ctx, block, startY)
    default:
      return 0
  }
}

/** 渲染段落（含粗体/斜体混排） */
const renderParagraph = (ctx: CanvasRenderingContext2D, block: DocxBlock & { type: 'paragraph' }, startY: number): number => {
  // 先收集所有文本，计算换行
  const fullText = block.runs.map(r => r.text).join('')
  ctx.font = FONT
  const lines = wrapLines(ctx, fullText, CONTENT_W)

  let y = startY

  // Canvas 不支持逐 run 富文本，检测整体格式
  const hasBold = block.runs.some(r => r.bold)
  const hasItalic = block.runs.some(r => r.italic)

  for (const line of lines) {
    const x = block.alignCenter ? (CONTENT_W + PAD * 2 - ctx.measureText(line).width) / 2 : PAD
    ctx.font = hasBold && hasItalic ? FONT_BI : hasBold ? FONT_BOLD : hasItalic ? FONT_ITALIC : FONT
    ctx.fillStyle = '#1f2937'
    ctx.fillText(line, x, y + 18)
    y += LINE_H
  }

  return (y - startY) + 6 // 段落间距
}

/** 渲染图片 */
const renderImage = async (ctx: CanvasRenderingContext2D, block: ImageBlock, startY: number): Promise<number> => {
  const img = await loadImage(block.blob)
  const imgW = block.width
  const imgH = block.height
  const drawW = Math.min(CONTENT_W, imgW)
  const drawH = (drawW / imgW) * imgH
  const x = (CONTENT_W + PAD * 2 - drawW) / 2

  ctx.drawImage(img, x, startY, drawW, drawH)
  return drawH + 12
}

/** 渲染表格 */
const renderTable = (ctx: CanvasRenderingContext2D, block: TableBlock, startY: number): number => {
  const nCols = Math.max(...block.rows.map(r => r.length))
  if (nCols === 0) return 0
  const colW = CONTENT_W / nCols

  let y = startY
  for (let ri = 0; ri < block.rows.length; ri++) {
    const row = block.rows[ri]
    const isHeader = ri === 0

    // 计算行高
    let rowH = 22
    for (const cell of row) {
      const text = cell.map(r => r.text).join('')
      ctx.font = FONT
      const lines = wrapLines(ctx, text, colW - 10)
      rowH = Math.max(rowH, lines.length * 22 + 12)
    }

    // 绘制行背景和边框
    let x = PAD
    for (let ci = 0; ci < nCols; ci++) {
      ctx.fillStyle = isHeader ? '#f3f4f6' : (ri % 2 === 0 ? '#fafafa' : '#FFFFFF')
      ctx.fillRect(x, y, colW, rowH)
      ctx.strokeStyle = '#d1d5db'
      ctx.lineWidth = 0.5
      ctx.strokeRect(x, y, colW, rowH)

      // 单元格文本
      const cell = row[ci]
      if (cell) {
        const text = cell.map(r => r.text).join('')
        ctx.font = isHeader ? FONT_BOLD : FONT
        ctx.fillStyle = '#1f2937'
        const lines = wrapLines(ctx, text, colW - 10)
        let ty = y + 16
        for (const line of lines) {
          ctx.fillText(line, x + 5, ty)
          ty += 22
        }
      }
      x += colW
    }
    y += rowH
  }

  return (y - startY) + 4
}

// ============================================================
// 工具
// ============================================================

const wrapLines = (ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] => {
  if (!text) return ['']
  // 先按 \n 分段
  const parts = text.split('\n')
  const result: string[] = []
  for (const part of parts) {
    const wrapped = wrapSinglePara(ctx, part, maxW)
    result.push(...wrapped)
  }
  return result.length ? result : ['']
}

const wrapSinglePara = (ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] => {
  if (!text) return ['']
  const lines: string[] = []
  let cur = ''
  for (const ch of text) {
    const test = cur + ch
    if (ctx.measureText(test).width > maxW && cur.length > 0) {
      lines.push(cur)
      cur = ch
    } else { cur = test }
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : ['']
}

const loadImage = (blob: Blob): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(img.src); resolve(img) }
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = URL.createObjectURL(blob)
  })

const canvasToBlob = (c: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => {
    c.toBlob(b => b && b.size > 0 ? resolve(b) : reject(new Error('PNG 导出失败')), 'image/png')
  })
