// ============================================================
// 纯前端 ZIP 写入器 — 零依赖
// 用于生成 docx 文件（ZIP + XML）
// ============================================================

/**
 * 创建一个 ZIP 文件（STORED 模式，无压缩）
 * @param files - { name, data } 数组
 * @returns ZIP Blob
 */
export const createZipBlob = async (
  files: Array<{ name: string; data: string | Uint8Array }>
): Promise<Blob> => {
  const encoder = new TextEncoder()
  const parts: Uint8Array[] = []

  // 中央目录条目列表
  const centralDirParts: Uint8Array[] = []
  let centralDirOffset = 0

  for (const file of files) {
    const nameBytes = encoder.encode(file.name)
    const contentBytes = typeof file.data === 'string' ? encoder.encode(file.data) : file.data
    const crc = crc32(contentBytes)

    // 本地文件头
    const localHeader = new Uint8Array(30 + nameBytes.length)
    const lhView = new DataView(localHeader.buffer)
    let pos = 0
    lhView.setUint32(pos, 0x04034b50, true); pos += 4  // 签名
    lhView.setUint16(pos, 20, true); pos += 2            // 提取版本 2.0
    lhView.setUint16(pos, 0x0800, true); pos += 2        // 通用位标志 (UTF-8)
    lhView.setUint16(pos, 0, true); pos += 2             // 压缩方式 STORED
    lhView.setUint16(pos, 0, true); pos += 2             // 修改时间
    lhView.setUint16(pos, 0, true); pos += 2             // 修改日期
    lhView.setUint32(pos, crc, true); pos += 4           // CRC32
    lhView.setUint32(pos, contentBytes.length, true); pos += 4  // 压缩后大小
    lhView.setUint32(pos, contentBytes.length, true); pos += 4  // 原始大小
    lhView.setUint16(pos, nameBytes.length, true); pos += 2     // 文件名长度
    lhView.setUint16(pos, 0, true); pos += 2                    // 额外字段长度
    localHeader.set(nameBytes, pos)

    parts.push(localHeader)
    parts.push(contentBytes)

    // 记录中央目录信息
    const cdEntry = new Uint8Array(46 + nameBytes.length)
    const cdView = new DataView(cdEntry.buffer)
    pos = 0
    cdView.setUint32(pos, 0x02014b50, true); pos += 4   // 中央目录签名
    cdView.setUint16(pos, 20, true); pos += 2
    cdView.setUint16(pos, 20, true); pos += 2
    cdView.setUint16(pos, 0x0800, true); pos += 2
    cdView.setUint16(pos, 0, true); pos += 2
    cdView.setUint16(pos, 0, true); pos += 2
    cdView.setUint16(pos, 0, true); pos += 2
    cdView.setUint32(pos, crc, true); pos += 4
    cdView.setUint32(pos, contentBytes.length, true); pos += 4
    cdView.setUint32(pos, contentBytes.length, true); pos += 4
    cdView.setUint16(pos, nameBytes.length, true); pos += 2
    cdView.setUint16(pos, 0, true); pos += 2            // 额外字段
    cdView.setUint16(pos, 0, true); pos += 2            // 注释
    cdView.setUint16(pos, 0, true); pos += 2            // 起始盘
    cdView.setUint16(pos, 0, true); pos += 2            // 内部属性
    cdView.setUint32(pos, 0, true); pos += 4            // 外部属性
    cdView.setUint32(pos, centralDirOffset, true); pos += 4  // 本地头偏移
    cdEntry.set(nameBytes, pos)
    centralDirParts.push(cdEntry)

    centralDirOffset += 30 + nameBytes.length + contentBytes.length
  }

  // 合并：本地条目 + 中央目录 + 结束标记
  const cdBytes = concatArrays(centralDirParts)
  const cdSize = cdBytes.length

  const eocd = new Uint8Array(22)
  const eocdView = new DataView(eocd.buffer)
  eocdView.setUint32(0, 0x06054b50, true)   // 结束签名
  eocdView.setUint16(4, 0, true)             // 当前盘
  eocdView.setUint16(6, 0, true)             // 中央目录起始盘
  eocdView.setUint16(8, files.length, true)  // 当前盘条目数
  eocdView.setUint16(10, files.length, true) // 总条目数
  eocdView.setUint32(12, cdSize, true)       // 中央目录大小
  eocdView.setUint32(16, centralDirOffset, true)  // 中央目录偏移
  eocdView.setUint16(20, 0, true)            // 注释长度

  const result = concatArrays([...parts, cdBytes, eocd])
  return new Blob([result as unknown as ArrayBuffer], { type: 'application/zip' })
}

// --- CRC32 计算 ---

const crc32 = (data: Uint8Array): number => {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0)
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

// --- 工具 ---

const concatArrays = (arrays: Uint8Array[]): Uint8Array => {
  const totalLen = arrays.reduce((s, a) => s + a.length, 0)
  const result = new Uint8Array(totalLen)
  let offset = 0
  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.length
  }
  return result
}
