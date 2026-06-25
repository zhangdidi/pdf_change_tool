// ============================================================
// 文件下载模块
// 单文件下载、多文件ZIP打包下载
// 使用 file-saver + 原生 ZIP 实现

import { saveAs } from 'file-saver'
import type { ConvertFileItem } from '@/types/file'
import { FILE_EXTENSIONS } from '@/types/file'
import { createZipBlob } from './zipWriter'

/**
 * 下载单个 Blob 文件
 *
 * @param blob - 文件 Blob 数据
 * @param fileName - 文件名（含扩展名）
 */
export const downloadBlob = (blob: Blob, fileName: string): void => {
  try {
    saveAs(blob, fileName)
  } catch (err) {
    throw new Error(
      `文件下载失败：${err instanceof Error ? err.message : '浏览器不支持下载功能'}`
    )
  }
}

/**
 * 多个文件打包为 ZIP 并下载
 *
 * @param files - 文件列表 {blob, name}
 * @param zipFileName - ZIP 文件名（不含扩展名）
 */
export const downloadZip = async (
  files: Array<{ blob: Blob; name: string }>,
  zipFileName: string = 'converted'
): Promise<void> => {
  if (files.length === 0) {
    throw new Error('没有可下载的文件')
  }

  try {
    // 处理文件名去重
    const nameCount = new Map<string, number>()
    const entries: Array<{ name: string; data: Uint8Array }> = []

    for (const { blob, name } of files) {
      let uniqueName = name
      const count = nameCount.get(name) || 0
      if (count > 0) {
        const dotIndex = name.lastIndexOf('.')
        uniqueName = dotIndex > 0
          ? `${name.slice(0, dotIndex)}_(${count})${name.slice(dotIndex)}`
          : `${name}_(${count})`
      }
      nameCount.set(name, count + 1)

      const buf = await blob.arrayBuffer()
      entries.push({ name: uniqueName, data: new Uint8Array(buf) })
    }

    // 使用原生 ZIP 写入器
    const zipBlob = await createZipBlob(entries)
    saveAs(zipBlob, `${zipFileName}.zip`)
  } catch (err) {
    throw new Error(
      `ZIP 打包下载失败：${err instanceof Error ? err.message : '未知错误'}`
    )
  }
}

/**
 * 从转换完成的文件任务列表下载
 * 单文件直接下载，多文件自动打包 ZIP
 *
 * @param items - 转换完成的任务列表
 */
export const downloadConvertResults = async (items: ConvertFileItem[]): Promise<void> => {
  // 收集所有成功的文件
  const files: Array<{ blob: Blob; name: string }> = []

  for (const item of items) {
    if (item.status !== 'success') continue

    const ext = FILE_EXTENSIONS[item.targetType]

    if (item.resultBlob) {
      // 单个结果文件
      const baseName = item.fileName.replace(/\.[^.]+$/, '')
      files.push({
        blob: item.resultBlob,
        name: `${baseName}_converted.${ext}`
      })
    } else if (item.resultBlobs && item.resultBlobs.length > 0) {
      // 多个结果文件（PDF转多图）
      const baseName = item.fileName.replace(/\.[^.]+$/, '')
      item.resultBlobs.forEach((blob, index) => {
        const pageNum = index + 1
        files.push({
          blob,
          name: `${baseName}_page${pageNum}.${ext}`
        })
      })
    }
  }

  if (files.length === 0) {
    throw new Error('没有成功转换的文件')
  }

  if (files.length === 1) {
    // 单文件直接下载
    downloadBlob(files[0].blob, files[0].name)
  } else {
    // 多文件打包ZIP
    await downloadZip(files, 'converted_files')
  }
}

/**
 * 下载转换任务中的单个结果
 */
export const downloadSingleResult = (item: ConvertFileItem): void => {
  if (item.status !== 'success') {
    throw new Error('文件尚未转换完成')
  }

  const ext = FILE_EXTENSIONS[item.targetType]
  const baseName = item.fileName.replace(/\.[^.]+$/, '')

  if (item.resultBlob) {
    downloadBlob(item.resultBlob, `${baseName}_converted.${ext}`)
  } else if (item.resultBlobs && item.resultBlobs.length > 0) {
    // 多文件打包下载
    const files = item.resultBlobs.map((blob, i) => ({
      blob,
      name: `${baseName}_page${i + 1}.${ext}`
    }))
    downloadZip(files, `${baseName}_converted`)
  } else {
    throw new Error('转换结果为空')
  }
}
