// ============================================================
// Docx 完整解析器
// 提取：文本（含粗体/斜体）、图片、表格、段落属性
// 保留原始排版结构
// ============================================================

import { extractFileFromZip } from './zipReader'

/** 内联文本块 */
export interface TextRun {
  text: string
  bold: boolean
  italic: boolean
}

/** 图片块 */
export interface ImageBlock {
  type: 'image'
  /** 图片 Blob（PNG/JPEG） */
  blob: Blob
  /** 宽度 (px) */
  width: number
  /** 高度 (px) */
  height: number
  /** 图片名 */
  name: string
}

/** 表格单元格 */
export type TableCell = TextRun[]

/** 表格行 */
export type TableRow = TableCell[]

/** 表格块 */
export interface TableBlock {
  type: 'table'
  rows: TableRow[]
}

/** 段落块 */
export interface ParagraphBlock {
  type: 'paragraph'
  runs: TextRun[]
  /** 段落居中对齐 */
  alignCenter: boolean
}

/** 文档内容块 */
export type DocxBlock = ParagraphBlock | ImageBlock | TableBlock

// ============================================================
// 主解析函数
// ============================================================

/**
 * 完整解析 docx 文件，返回结构化内容块数组
 */
export const parseDocxContent = async (file: File, onLog?: (msg: string) => void): Promise<DocxBlock[]> => {
  // 1. 读取 document.xml
  onLog?.('[docx] 读取 document.xml…')
  const docXml = await extractFileFromZip(file, 'word/document.xml')
  onLog?.(`[docx] document.xml 读取成功 (${docXml.length} 字符)`)

  // 2. 读取关系文件（图片映射）
  onLog?.('[docx] 读取图片映射…')
  let relsXml = ''
  try {
    relsXml = await extractFileFromZip(file, 'word/_rels/document.xml.rels')
    onLog?.('[docx] 关系文件读取成功')
  } catch {
    onLog?.('[docx] 无关系文件（可能没有图片）')
  }

  // 3. 解析图片映射：rId → 文件名
  const imageMap = parseRelationships(relsXml)

  // 4. 提取所有图片
  const images = await extractImages(file, imageMap, onLog)

  // 5. 解析 document.xml → 内容块
  const blocks = parseDocumentXml(docXml, images, onLog)

  return blocks
}

// ============================================================
// 关系文件解析
// ============================================================

const parseRelationships = (xml: string): Map<string, string> => {
  const map = new Map<string, string>()
  const re = /<Relationship[^>]*Id="([^"]*)"[^>]*Target="([^"]*)"[^>]*\/?>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    const target = m[2]
    // 只记录图片关系
    if (target.startsWith('media/')) {
      map.set(m[1], target)
    }
  }
  return map
}

// ============================================================
// 图片提取
// ============================================================

const extractImages = async (
  file: File,
  imageMap: Map<string, string>,
  onLog?: (msg: string) => void
): Promise<Map<string, ImageBlock>> => {
  const result = new Map<string, ImageBlock>()

  for (const [rId, mediaPath] of imageMap) {
    try {
      // 从 ZIP 中提取图片
      const fullPath = `word/${mediaPath}`
      onLog?.(`[docx] 提取图片: ${mediaPath}`)
      const imgData = await extractFileFromZipRaw(file, fullPath)

      // 判断图片类型
      const ext = mediaPath.split('.').pop()?.toLowerCase() || 'png'
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png'
      const blob = new Blob([imgData], { type: mime })

      // 获取尺寸
      const dims = await getBlobSize(blob)
      result.set(rId, { type: 'image', blob, width: dims.width, height: dims.height, name: mediaPath.split('/').pop() || 'image' })
    } catch (e) {
      onLog?.(`[docx] 图片提取失败 ${mediaPath}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  onLog?.(`[docx] 提取到 ${result.size} 张图片`)
  return result
}

// ============================================================
// document.xml 解析 → 结构化内容
// ============================================================

const parseDocumentXml = (
  xml: string,
  images: Map<string, ImageBlock>,
  onLog?: (msg: string) => void
): DocxBlock[] => {
  const blocks: DocxBlock[] = []

  // 去掉命名空间声明部分，保留 <w:body> 内容
  const bodyMatch = xml.match(/<w:body[^>]*>([\s\S]*)<\/w:body>/)
  if (!bodyMatch) { onLog?.('[docx] 未找到 <w:body>'); return blocks }
  const bodyXml = bodyMatch[1]

  // 分割为顶层块：<w:p> 段落、<w:tbl> 表格
  const blockRegex = /<(w:p|w:tbl)[\s>]([\s\S]*?)<\/\1>/g
  let bm: RegExpExecArray | null

  while ((bm = blockRegex.exec(bodyXml)) !== null) {
    const tag = bm[1]
    const inner = bm[2]

    if (tag === 'w:p') {
      // ---- 段落 ----
      // 检查是否包含图片
      const imgMatch = inner.match(/<wp:inline[\s\S]*?<a:blip[^>]*r:embed="([^"]*)"/)
        || inner.match(/<wp:anchor[\s\S]*?<a:blip[^>]*r:embed="([^"]*)"/)

      if (imgMatch) {
        const rId = imgMatch[1]
        const img = images.get(rId)
        if (img) {
          blocks.push(img)
          continue
        }
      }

      // 普通文本段落
      const alignCenter = /<w:jc[^>]*w:val="center"/.test(inner)
      const runs = parseTextRuns(inner)
      if (runs.length > 0) {
        blocks.push({ type: 'paragraph', runs, alignCenter })
      }
    } else if (tag === 'w:tbl') {
      // ---- 表格 ----
      const rows: TableRow[] = []
      const rowRegex = /<w:tr[\s>]([\s\S]*?)<\/w:tr>/g
      let rm: RegExpExecArray | null
      while ((rm = rowRegex.exec(inner)) !== null) {
        const cells: TableCell[] = []
        const cellRegex = /<w:tc[\s>]([\s\S]*?)<\/w:tc>/g
        let cm: RegExpExecArray | null
        while ((cm = cellRegex.exec(rm[1])) !== null) {
          cells.push(parseTextRuns(cm[1]))
        }
        if (cells.length > 0) rows.push(cells)
      }
      if (rows.length > 0) {
        blocks.push({ type: 'table', rows })
      }
    }
  }

  onLog?.(`[docx] 解析到 ${blocks.length} 个内容块 (段落/图片/表格)`)
  return blocks
}

// ============================================================
// 文本块解析（含粗体/斜体）
// ============================================================

const parseTextRuns = (xml: string): TextRun[] => {
  const runs: TextRun[] = []
  const rRegex = /<w:r[\s>]([\s\S]*?)<\/w:r>/g
  let m: RegExpExecArray | null
  while ((m = rRegex.exec(xml)) !== null) {
    const rInner = m[1]
    const bold = /<w:b\s*\/?>/.test(rInner) || /<w:b[^>]*w:val="1"/.test(rInner) || /<w:bCs\s*\/?>/.test(rInner)
    const italic = /<w:i\s*\/?>/.test(rInner) || /<w:i[^>]*w:val="1"/.test(rInner)
    const tMatch = rInner.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/)
    if (tMatch) {
      const text = decodeXmlEntities(tMatch[1])
      if (text) runs.push({ text, bold, italic })
    }
  }
  return runs
}

// ============================================================
// 工具函数
// ============================================================

const decodeXmlEntities = (str: string): string =>
  str.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10))).replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))

/** 从 ZIP 提取二进制文件 */
const extractFileFromZipRaw = async (file: Blob, path: string): Promise<ArrayBuffer> => {
  // 读取整个文件为 ArrayBuffer 然后手动定位
  const buf = await file.arrayBuffer()
  const data = new Uint8Array(buf)

  let offset = 0
  while (offset < data.length - 30) {
    const sig = (data[offset]) | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24)
    if (sig !== 0x04034b50) throw new Error(`找不到文件: ${path}`)

    const compression = data[offset + 8] | (data[offset + 9] << 8)
    const compSize = data[offset + 18] | (data[offset + 19] << 8) | (data[offset + 20] << 16) | (data[offset + 21] << 24)
    const nameLen = data[offset + 26] | (data[offset + 27] << 8)
    const extraLen = data[offset + 28] | (data[offset + 29] << 8)

    const name = new TextDecoder().decode(data.slice(offset + 30, offset + 30 + nameLen))

    if (name === path) {
      const dataStart = offset + 30 + nameLen + extraLen
      const entryData = data.slice(dataStart, dataStart + compSize)

      if (compression === 0) {
        return entryData.buffer.slice(entryData.byteOffset, entryData.byteOffset + entryData.byteLength)
      } else if (compression === 8) {
        // Deflate 解压
        const ds = new DecompressionStream('deflate-raw')
        const writer = ds.writable.getWriter()
        writer.write(entryData)
        writer.close()
        return new Response(ds.readable).arrayBuffer()
      } else {
        throw new Error(`不支持的压缩方式: ${compression}`)
      }
    }

    offset = offset + 30 + nameLen + extraLen + compSize
  }

  throw new Error(`找不到文件: ${path}`)
}

const getBlobSize = (blob: Blob): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(img.src) }
    img.onerror = () => reject(new Error('无法读取图片尺寸'))
    img.src = URL.createObjectURL(blob)
  })
