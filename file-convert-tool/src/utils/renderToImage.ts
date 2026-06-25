// ============================================================
// Canvas 直接渲染 → PNG — 零依赖
// 支持单元格样式：字体颜色、背景色、粗体、对齐
// ============================================================

const FONT_FAMILY = '-apple-system, "Microsoft YaHei", "PingFang SC", "Noto Sans SC", "Segoe UI", sans-serif'
const PADDING = 24
const SCALE = 2

/** 单元格样式 */
export interface CellStyle {
  /** 字体颜色 #RRGGBB */
  color: string
  /** 背景色 #RRGGBB，null 为默认 */
  bgColor: string | null
  /** 粗体 */
  bold: boolean
}

/** 带样式的单元格数据 */
export interface StyledCell {
  value: string
  style: CellStyle
}

// ============================================================
// 颜色工具
// ============================================================

/** ARGB → #RRGGBB（xlsx 格式：AARRGGBB） */
const argbToHex = (argb: string | undefined): string => {
  if (!argb || argb.length < 6) return ''
  // 去掉 Alpha 通道，取后 6 位
  const hex = argb.length >= 8 ? argb.slice(2) : argb
  return `#${hex}`
}

/** 解析 xlsx 主题/索引色为 hex */
const parseXlsxColor = (color: unknown): string => {
  if (!color) return ''
  if (typeof color === 'string') return argbToHex(color)
  if (typeof color === 'object' && color !== null) {
    const c = color as Record<string, unknown>
    if (c.rgb) return argbToHex(String(c.rgb))
    if (c.theme !== undefined) {
      // 主题色无法精确还原，返回空使用默认
      return ''
    }
    if (c.indexed !== undefined) {
      // 索引色：映射常见颜色
      const idx = Number(c.indexed)
      const map: Record<number, string> = {
        2: '#FF0000', 3: '#00FF00', 4: '#0000FF', 5: '#FFFF00',
        6: '#FF00FF', 7: '#00FFFF', 8: '#000000', 9: '#FFFFFF',
        10: '#FF0000', 11: '#00FF00', 12: '#0000FF', 13: '#FFFF00',
        14: '#FF00FF', 15: '#00FFFF', 16: '#800000', 17: '#008000',
        18: '#000080', 19: '#808000', 20: '#800080', 21: '#008080',
        22: '#C0C0C0', 23: '#808080',
      }
      return map[idx] || ''
    }
  }
  return ''
}

/** 默认单元格样式 */
const defaultStyle = (): CellStyle => ({ color: '#1f2937', bgColor: null, bold: false })

// ============================================================
// 测量 & 渲染表格
// ============================================================

/**
 * 将带样式的 Excel 数据渲染为 PNG Blob
 * @param rows - 每行单元格数组
 * @param sheetName - 工作表名
 */
export const styledExcelToPngBlob = async (
  rows: StyledCell[][],
  sheetName?: string
): Promise<Blob> => {
  if (rows.length === 0) throw new Error('无数据')

  const maxCols = Math.max(...rows.map(r => r.length))
  if (maxCols === 0) throw new Error('无列数据')

  // 测量列宽
  const mCanvas = document.createElement('canvas')
  const mCtx = mCanvas.getContext('2d')!
  const colWidths: number[] = new Array(maxCols).fill(0)
  for (const row of rows) {
    for (let c = 0; c < maxCols; c++) {
      const cell = row[c]
      if (!cell) continue
      const fs = cell.style.bold ? 'bold ' : ''
      mCtx.font = `14px ${fs}${FONT_FAMILY}`
      const w = mCtx.measureText(cell.value).width + 22
      if (w > colWidths[c]) colWidths[c] = w
    }
  }
  const adjColWidths = colWidths.map(w => Math.min(420, Math.max(60, w)))
  const tableWidth = adjColWidths.reduce((s, w) => s + w, 0)
  const canvasW = tableWidth + PADDING * 2

  // 计算总高度
  const rowH = 32, headerH = 36
  let totalH = PADDING + (sheetName ? 44 : 0)
  for (let r = 0; r < rows.length; r++) totalH += r === 0 ? headerH : rowH
  totalH += PADDING

  // 渲染
  const canvas = document.createElement('canvas')
  canvas.width = canvasW * SCALE
  canvas.height = totalH * SCALE
  const ctx = canvas.getContext('2d')!
  ctx.scale(SCALE, SCALE)

  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, canvasW, totalH)

  let y = PADDING

  if (sheetName) {
    ctx.font = `bold 18px ${FONT_FAMILY}`
    ctx.fillStyle = '#111827'
    ctx.fillText(`📊 ${sheetName}`, PADDING, y + 24)
    y += 44
    ctx.strokeStyle = '#e5e7eb'
    ctx.beginPath(); ctx.moveTo(PADDING, y); ctx.lineTo(canvasW - PADDING, y); ctx.stroke()
  }

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    const isHeader = r === 0
    const rh = isHeader ? headerH : rowH

    // 行背景（优先使用第一列的样式背景，否则用斑马纹）
    let rowBg = isHeader ? '#f3f4f6' : (r % 2 === 0 ? '#fafafa' : '#FFFFFF')
    if (!isHeader && row[0]?.style?.bgColor) {
      rowBg = row[0].style.bgColor
    }

    ctx.fillStyle = rowBg
    ctx.fillRect(PADDING, y, tableWidth, rh)
    ctx.strokeStyle = '#d1d5db'
    ctx.lineWidth = 0.5

    let x = PADDING
    for (let c = 0; c < maxCols; c++) {
      const cell = row[c]
      const cw = adjColWidths[c]
      ctx.strokeRect(x, y, cw, rh)

      if (cell && cell.value) {
        const s = cell.style || defaultStyle()

        // 单元格背景（覆盖行背景）
        if (s.bgColor) {
          ctx.fillStyle = s.bgColor
          ctx.fillRect(x + 0.5, y + 0.5, cw - 1, rh - 1)
        }

        // 字体
        const fs = (isHeader || s.bold) ? 'bold ' : ''
        const fz = isHeader ? 13 : 14
        ctx.font = `${fs}${fz}px ${FONT_FAMILY}`

        // 字体颜色
        ctx.fillStyle = s.color || '#1f2937'

        // 截断
        let text = cell.value
        while (ctx.measureText(text).width > cw - 16 && text.length > 0) text = text.slice(0, -1)
        if (text.length < cell.value.length) text = text.slice(0, -2) + '…'
        if (text) ctx.fillText(text, x + 8, y + (isHeader ? 24 : 22))
      }
      x += cw
    }
    y += rh
  }

  return canvasToBlob(canvas)
}

const canvasToBlob = (c: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => {
    c.toBlob(b => b && b.size > 0 ? resolve(b) : reject(new Error('PNG 导出失败')), 'image/png')
  })

// 复用段落渲染
export { parseXlsxColor, defaultStyle, argbToHex }
