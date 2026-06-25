// ============================================================
// 第三方库类型声明补充
// 为缺少 @types 的库提供最小类型声明
// ============================================================

/** file-saver 库声明 */
declare module 'file-saver' {
  export function saveAs(data: Blob | string, filename?: string, options?: Record<string, unknown>): void
}

/** browser-image-compression 库声明 */
declare module 'browser-image-compression' {
  interface CompressOptions {
    maxSizeMB?: number
    maxWidthOrHeight?: number
    useWebWorker?: boolean
    fileType?: string
    initialQuality?: number
  }

  function imageCompression(file: File, options: CompressOptions): Promise<File>
  export default imageCompression
}
