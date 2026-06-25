// ============================================================
// 纯前端 ZIP 读取器 — 零依赖
// 用于读取 docx/xlsx 等 ZIP 格式文件
// 浏览器原生 DecompressionStream 处理 deflate 解压
// ============================================================

/**
 * ZIP 本地文件条目
 */
interface ZipEntry {
  name: string
  offset: number        // 数据在文件中的偏移
  compressedSize: number
  uncompressedSize: number
  compression: number   // 0=STORED, 8=DEFLATED
}

/**
 * 从 ZIP 文件中提取指定文件名的内容
 * @param file - ZIP 文件 (Blob/File)
 * @param targetName - 要提取的文件路径，如 "word/document.xml"
 * @returns 文件内容字符串
 */
export const extractFileFromZip = async (file: Blob, targetName: string): Promise<string> => {
  const buf = await file.arrayBuffer()
  const data = new Uint8Array(buf)

  // 1. 扫描所有本地文件条目，找到目标
  const entry = findZipEntry(data, targetName)
  if (!entry) {
    // 列出 ZIP 中的所有文件帮助调试
    const allNames = listZipEntries(data).join(', ')
    throw new Error(`在 ZIP 中找不到 "${targetName}"。包含文件: ${allNames}`)
  }

  // 2. 提取条目数据
  const entryData = data.slice(
    entry.offset,
    entry.offset + entry.compressedSize
  )

  // 3. 解压（如需要）
  if (entry.compression === 0) {
    // STORED — 直接转文本
    return new TextDecoder('utf-8').decode(entryData)
  } else if (entry.compression === 8) {
    // DEFLATED — 使用浏览器原生 DecompressionStream
    try {
      const ds = new DecompressionStream('deflate-raw')
      const writer = ds.writable.getWriter()
      writer.write(entryData)
      writer.close()
      const decompressed = await new Response(ds.readable).arrayBuffer()
      return new TextDecoder('utf-8').decode(decompressed)
    } catch (e) {
      // 兜底：尝试用 Blob 方式
      throw new Error(`ZIP deflate 解压失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  } else {
    throw new Error(`不支持的 ZIP 压缩方式: ${entry.compression}`)
  }
}

/**
 * 列出 ZIP 中所有文件名
 */
const listZipEntries = (data: Uint8Array): string[] => {
  const names: string[] = []
  let offset = 0
  while (offset < data.length - 30) {
    const sig = readU32(data, offset)
    if (sig !== 0x04034b50) break
    const nameLen = readU16(data, offset + 26)
    const extraLen = readU16(data, offset + 28)
    const name = readString(data, offset + 30, nameLen)
    names.push(name)
    const compSize = readU32(data, offset + 18)
    offset = offset + 30 + nameLen + extraLen + compSize
  }
  return names
}

/**
 * 在 ZIP 数据中查找特定文件条目
 */
const findZipEntry = (data: Uint8Array, targetName: string): ZipEntry | null => {
  let offset = 0

  while (offset < data.length - 30) {
    const sig = readU32(data, offset)
    if (sig !== 0x04034b50) return null  // 找不到更多条目

    const compression = readU16(data, offset + 8)
    const compSize = readU32(data, offset + 18)
    const uncompSize = readU32(data, offset + 22)
    const nameLen = readU16(data, offset + 26)
    const extraLen = readU16(data, offset + 28)

    const name = readString(data, offset + 30, nameLen)

    if (name === targetName) {
      const dataOffset = offset + 30 + nameLen + extraLen
      return { name, offset: dataOffset, compressedSize: compSize, uncompressedSize: uncompSize, compression }
    }

    // 跳到下一个条目
    offset = offset + 30 + nameLen + extraLen + compSize
  }

  return null
}

// --- Little-endian 读取工具 ---

const readU16 = (data: Uint8Array, offset: number): number =>
  data[offset] | (data[offset + 1] << 8)

const readU32 = (data: Uint8Array, offset: number): number =>
  data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24)

const readString = (data: Uint8Array, offset: number, length: number): string => {
  const slice = data.slice(offset, offset + length)
  return new TextDecoder('utf-8').decode(slice)
}
