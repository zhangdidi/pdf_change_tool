// ============================================================
// Office 文档转换模块
// Excel ↔ PDF / Word ↔ PDF / Word/Excel → 图片
// 所有错误带步骤标记，方便调试定位
// ============================================================

import * as XLSX from 'xlsx'
import { PDFDocument } from 'pdf-lib'
import { extractPdfText, pdfToImages } from './pdfConvert'
import { createZipBlob } from './zipWriter'
import { styledExcelToPngBlob, parseXlsxColor, defaultStyle } from './renderToImage'
import type { StyledCell } from './renderToImage'
import { parseDocxContent } from './docxParser'
import { renderDocxBlocks } from './docxRenderer'

type ProgressCallback = (progress: number) => void
type LogCallback = (msg: string) => void

// ============================================================
// Excel → PDF
// ============================================================

/** 读取 xlsx 单元格样式 */
const readCellStyle = (cell: XLSX.CellObject | undefined): ReturnType<typeof defaultStyle> => {
  const s = defaultStyle()
  if (!cell?.s) return s

  const style = cell.s as Record<string, unknown>
  const font = style.font as Record<string, unknown> | undefined
  const fill = style.fill as Record<string, unknown> | undefined

  if (font) {
    if (font.bold) s.bold = true
    if (font.color) {
      const c = parseXlsxColor(font.color)
      if (c) s.color = c
    }
  }
  if (fill?.fgColor) {
    const c = parseXlsxColor(fill.fgColor)
    if (c && c !== '#FFFFFF' && c !== '#000000') s.bgColor = c
  }

  return s
}

export const excelToPdf = async (
  file: File,
  onProgress?: ProgressCallback,
  onLog?: LogCallback
): Promise<Blob> => {
  if (!file || file.size === 0) throw new Error('Excel 文件为空')

  onLog?.('[excel→pdf] 读取文件…')
  onProgress?.(5)

  const arrayBuffer = await file.arrayBuffer()
  const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array', cellStyles: true })
  onLog?.(`[excel→pdf] 读取成功，${workbook.SheetNames.length} 个工作表`)
  onProgress?.(15)

  const sheetNames = workbook.SheetNames
  if (sheetNames.length === 0) throw new Error('Excel 文件中没有工作表')

  const pdfDoc = await PDFDocument.create()

  for (let s = 0; s < sheetNames.length; s++) {
    const sheetName = sheetNames[s]
    const sheet = workbook.Sheets[sheetName]

    // 获取数据范围
    const ref = sheet['!ref']
    if (!ref) { onLog?.(`[excel→pdf] "${sheetName}" 为空`); continue }

    const range = XLSX.utils.decode_range(ref)
    const rows: StyledCell[][] = []

    for (let r = range.s.r; r <= range.e.r; r++) {
      const row: StyledCell[] = []
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c })
        const cell = sheet[addr] as XLSX.CellObject | undefined
        const value = cell ? String(cell.w ?? cell.v ?? '') : ''
        const style = readCellStyle(cell)
        row.push({ value, style })
      }
      // 跳过全空行
      if (row.some(cell => cell.value !== '')) rows.push(row)
    }

    if (rows.length === 0) { onLog?.(`[excel→pdf] "${sheetName}" 为空`); continue }

    onLog?.(`[excel→pdf] 渲染工作表 "${sheetName}" (${rows.length} 行)…`)
    const pngBlob = await styledExcelToPngBlob(rows, sheetName)

    const pngBytes = new Uint8Array(await pngBlob.arrayBuffer()) as unknown as Uint8Array
    const img = await pdfDoc.embedPng(pngBytes)

    const pageWidth = 595
    const scale = pageWidth / img.width
    const pageHeight = img.height * scale

    const page = pdfDoc.addPage([pageWidth, pageHeight])
    page.drawImage(img, { x: 0, y: 0, width: pageWidth, height: pageHeight })

    const prog = 15 + Math.round(((s + 1) / sheetNames.length) * 80)
    onProgress?.(prog)
  }

  onProgress?.(95)
  onLog?.('[excel→pdf] 保存 PDF…')
  const pdfBytes = await pdfDoc.save()
  onProgress?.(100)
  onLog?.('[excel→pdf] 完成')
  return new Blob([pdfBytes as unknown as ArrayBuffer], { type: 'application/pdf' })
}

// ============================================================
// PDF → Excel
// ============================================================

export const pdfToExcel = async (
  file: File,
  onProgress?: ProgressCallback,
  onLog?: LogCallback
): Promise<Blob> => {
  if (!file || file.size === 0) throw new Error('PDF 文件为空')

  onLog?.('[pdf→excel] 正在提取文本…')
  const textPages = await extractPdfText(file, (p) => onProgress?.(5 + Math.round(p * 0.7)))
  onProgress?.(75)
  onLog?.(`[pdf→excel] 提取到 ${textPages.length} 页文本`)

  const workbook = XLSX.utils.book_new()
  for (const { pageNum, text } of textPages) {
    const lines = text.split(/\n|(?:\s{2,})/).filter(l => l.trim()).map(l => l.trim().split(/\s{2,}|\t/).map(c => c.trim()))
    if (lines.length === 0) continue
    const sheetName = textPages.length > 1 ? `Page ${pageNum}` : 'Sheet1'
    const worksheet = XLSX.utils.aoa_to_sheet(lines)
    const colWidths: Array<{ wch: number }> = []
    for (const line of lines) {
      for (let c = 0; c < line.length; c++) {
        if (!colWidths[c] || colWidths[c].wch < line[c].length + 2) colWidths[c] = { wch: Math.min(line[c].length + 2, 60) }
      }
    }
    worksheet['!cols'] = colWidths
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
  }

  onProgress?.(90)
  onLog?.('[pdf→excel] 正在生成 Excel…')
  const excelBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
  onProgress?.(100)
  return new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

// ============================================================
// Word → PDF  (Canvas 渲染，浏览器原生字体)
// ============================================================

export const wordToPdf = async (
  file: File,
  onProgress?: ProgressCallback,
  onLog?: LogCallback
): Promise<Blob> => {
  if (!file || file.size === 0) throw new Error('Word 文件为空')

  onLog?.('[docx→pdf] === 开始 ===')
  onProgress?.(10)

  // 完整解析 docx：文本、图片、表格、粗体/斜体
  const blocks = await parseDocxContent(file, onLog)
  if (blocks.length === 0) throw new Error('Word 文件中没有可提取的内容')

  onProgress?.(40)
  onLog?.(`[docx→pdf] 渲染 ${blocks.length} 个内容块…`)

  // 渲染为图片
  const pngBlob = await renderDocxBlocks(blocks)

  onProgress?.(70)
  onLog?.('[docx→pdf] 生成 PDF…')

  const pdfDoc = await PDFDocument.create()
  const pngBytes = new Uint8Array(await pngBlob.arrayBuffer()) as unknown as Uint8Array
  const img = await pdfDoc.embedPng(pngBytes)

  // A4 分页
  const A4_W = 595, A4_H = 842
  const scale = A4_W / img.width
  const fullH = img.height * scale

  let y = 0
  while (y < fullH) {
    const pageH = Math.min(A4_H, fullH - y)
    const page = pdfDoc.addPage([A4_W, pageH])
    page.drawImage(img, { x: 0, y: -(y), width: A4_W, height: fullH })
    y += A4_H
  }

  onProgress?.(95)
  const pdfBytes = await pdfDoc.save()
  onProgress?.(100)
  onLog?.('[docx→pdf] 完成')
  return new Blob([pdfBytes as unknown as ArrayBuffer], { type: 'application/pdf' })
}

// ============================================================
// PDF → Word  (逐页渲染为高清图片嵌入，文字+图片完整保留)
// ============================================================

/**
 * 将图片尺寸和描述打包进 docx（每页一张图片）
 */
const createDocxWithImages = async (
  pages: Array<{ blob: Blob; width: number; height: number }>,
  onLog?: LogCallback
): Promise<Blob> => {
  onLog?.('[pdf→docx] 生成 docx…')

  // 计算 EMU（1 inch = 914400 EMU, 1 px at 72 DPI ≈ 12700 EMU）
  // 图片在 Word 中宽度固定 6 英寸
  const WORD_WIDTH_EMU = 6 * 914400

  // [Content_Types].xml
  let contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n<Default Extension="xml" ContentType="application/xml"/>\n<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>`

  // word/_rels/document.xml.rels
  let docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`

  // word/document.xml body
  let bodyXml = ''

  const zipFiles: Array<{ name: string; data: string | Uint8Array }> = []

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]
    const imgIdx = i + 1
    const rId = `rIdImg${imgIdx}`
    const imgName = `image${imgIdx}.png`

    // 注册内容类型
    contentTypes += `\n<Override PartName="/word/media/${imgName}" ContentType="image/png"/>`

    // 注册关系
    docRels += `\n<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${imgName}"/>`

    // EMU 尺寸
    const imgW = page.width
    const imgH = page.height
    const emuW = WORD_WIDTH_EMU
    const emuH = Math.round((imgH / imgW) * WORD_WIDTH_EMU)

    // 段落 + 图片 drawing XML（简化但有效的结构）
    bodyXml += `
  <w:p>
    <w:r>
      <w:drawing>
        <wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
          <wp:extent cx="${emuW}" cy="${emuH}"/>
          <wp:docPr id="${imgIdx}" name="Page${imgIdx}"/>
          <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
            <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:nvPicPr>
                  <pic:cNvPr id="${imgIdx}" name="Page${imgIdx}"/>
                  <pic:cNvPicPr/>
                </pic:nvPicPr>
                <pic:blipFill>
                  <a:blip r:embed="${rId}"/>
                  <a:stretch><a:fillRect/></a:stretch>
                </pic:blipFill>
                <pic:spPr>
                  <a:xfrm><a:off x="0" y="0"/><a:ext cx="${emuW}" cy="${emuH}"/></a:xfrm>
                  <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                </pic:spPr>
              </pic:pic>
            </a:graphicData>
          </a:graphic>
        </wp:inline>
      </w:drawing>
    </w:r>
  </w:p>`

    // 图片数据
    const buf = await page.blob.arrayBuffer()
    zipFiles.push({ name: `word/media/${imgName}`, data: new Uint8Array(buf) })
  }

  contentTypes += '\n</Types>'
  docRels += '\n</Relationships>'

  // 完整 document.xml
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>${bodyXml}
  </w:body>
</w:document>`

  zipFiles.push(
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>\n</Relationships>` },
    { name: 'word/_rels/document.xml.rels', data: docRels },
    { name: 'word/document.xml', data: documentXml }
  )

  return createZipBlob(zipFiles)
}

export const pdfToWord = async (
  file: File,
  onProgress?: ProgressCallback,
  onLog?: LogCallback
): Promise<Blob> => {
  if (!file || file.size === 0) throw new Error('PDF 文件为空')

  onLog?.('[pdf→docx] 渲染 PDF 页面为图片…')

  // 逐页渲染为 PNG（scale=2 保证清晰度）
  const pngBlobs = await pdfToImages(file, 'png', 'all', 1.0, (p) => onProgress?.(p * 0.8))
  onLog?.(`[pdf→docx] 渲染完成，共 ${pngBlobs.length} 页`)
  onProgress?.(80)

  // 获取每张图片尺寸
  const pages: Array<{ blob: Blob; width: number; height: number }> = []
  for (const blob of pngBlobs) {
    const dims = await getImageSize(blob)
    pages.push({ blob, width: dims.width, height: dims.height })
  }

  onProgress?.(85)
  const docxBlob = await createDocxWithImages(pages, onLog)
  onProgress?.(100)
  onLog?.('[pdf→docx] 完成')
  return new Blob([docxBlob], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
}

/** 获取 Blob 图片的尺寸 */
const getImageSize = (blob: Blob): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(img.src) }
    img.onerror = () => reject(new Error('无法读取图片尺寸'))
    img.src = URL.createObjectURL(blob)
  })
}

// ============================================================
// Word/Excel → 图片
// ============================================================

export const officeToImages = async (
  file: File,
  fileType: 'docx' | 'xlsx',
  targetFormat: 'png' | 'jpg',
  quality = 0.92,
  onProgress?: ProgressCallback,
  onLog?: LogCallback
): Promise<Blob[]> => {
  if (!file || file.size === 0) throw new Error('文件为空')

  const halfP = (p: number) => onProgress?.(Math.round(p * 0.5))

  let pdfBlob: Blob
  if (fileType === 'xlsx') {
    pdfBlob = await excelToPdf(file, halfP, onLog)
  } else {
    pdfBlob = await wordToPdf(file, halfP, onLog)
  }
  onProgress?.(50)

  const pdfFile = new File([pdfBlob], 'temp.pdf', { type: 'application/pdf' })
  const images = await pdfToImages(pdfFile, targetFormat, 'all', quality, (p) => onProgress?.(50 + Math.round(p * 0.5)))
  onProgress?.(100)
  return images
}

// (文本换行已移除，改用 HTML 渲染)
