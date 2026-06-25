<script setup lang="ts">
// ============================================================
// Index 页面 — 文件转换工具
// 日志通过右下角浮动按钮 → 弹窗查看
// ============================================================

import { ref, reactive, computed, nextTick } from 'vue'
import type { ConvertFileItem, ConvertOption, FileType, ToastMessage } from '@/types/file'
import { CONVERSION_TARGETS } from '@/types/file'
import { validateFile, createFileId } from '@/utils/fileCheck'
import { executeConvert } from '@/utils/converter'
import { downloadSingleResult } from '@/utils/download'
import UploadArea from '@/components/UploadArea.vue'
import FileList from '@/components/fileList.vue'
import ConvertPanel from '@/components/ConvertPanel.vue'
import Toast from '@/components/Toast.vue'

// ============================================================
// 状态
// ============================================================

const currentItem = ref<ConvertFileItem | null>(null)
const isConverting = ref(false)
let cancelFlag = false
const toasts = ref<ToastMessage[]>([])
const showLogModal = ref(false)

const debugLogs = ref<Array<{ time: string; msg: string; isError: boolean }>>([])

const convertOptions = reactive<ConvertOption>({
  imageQuality: 0.85,
  pdfPageRange: 'all',
  targetType: 'pdf'
})

// ============================================================
// 计算属性
// ============================================================

const currentFileType = computed<FileType | null>(() => currentItem.value?.fileType ?? null)
const currentTargetType = computed<FileType>(() => currentItem.value?.targetType ?? 'pdf')
const currentStatus = computed(() => currentItem.value?.status ?? 'idle')

/** 日志中有错误的数量 */
const logErrorCount = computed(() => debugLogs.value.filter(l => l.isError).length)

// ============================================================
// 调试日志
// ============================================================

const addLog = (msg: string, isError = false): void => {
  const now = new Date()
  const time = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`
  debugLogs.value.push({ time, msg, isError })
  // 弹窗打开时自动滚动
  if (showLogModal.value) {
    nextTick(() => scrollLogBottom())
  }
}

const scrollLogBottom = (): void => {
  const el = document.getElementById('log-modal-body')
  if (el) el.scrollTop = el.scrollHeight
}

const openLogModal = (): void => {
  showLogModal.value = true
  nextTick(() => scrollLogBottom())
}

// ============================================================
// Toast
// ============================================================

const showToast = (type: ToastMessage['type'], msg: string, dur = 4000): void => {
  const id = createFileId()
  toasts.value.push({ id, type, message: msg, duration: dur })
  if (dur > 0) setTimeout(() => toasts.value = toasts.value.filter(t => t.id !== id), dur)
}

// ============================================================
// 文件操作
// ============================================================

const handleFileSelected = (file: File): void => {
  debugLogs.value = []
  addLog(`📁 上传: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`)

  const result = validateFile(file)
  if (!result.valid || !result.fileType) {
    addLog(`❌ 校验失败: ${result.error}`, true)
    return
  }

  const targets = CONVERSION_TARGETS[result.fileType]
  const defaultTarget = targets[0]
  if (!defaultTarget) { addLog('❌ 无可用目标格式', true); return }

  currentItem.value = {
    id: createFileId(), file,
    fileName: file.name, fileSize: file.size,
    fileType: result.fileType, targetType: defaultTarget,
    status: 'idle', progress: 0, errorMsg: ''
  }
  addLog(`✅ 类型: ${result.fileType.toUpperCase()} → ${defaultTarget.toUpperCase()}`)
  showToast('info', `已加载: ${file.name}`)
}

const handleRemoveFile = (): void => {
  currentItem.value = null
  debugLogs.value = []
}

const handleChangeTarget = (targetType: FileType): void => {
  if (currentItem.value) {
    currentItem.value.targetType = targetType
    addLog(`🎯 目标: ${targetType.toUpperCase()}`)
  }
}

// ============================================================
// 转换流程
// ============================================================

const handleStartConvert = async (): Promise<void> => {
  const item = currentItem.value
  if (!item || item.status !== 'idle') { showToast('warning', '没有待转换的文件'); return }

  cancelFlag = false
  isConverting.value = true
  item.status = 'loading'
  item.progress = 0
  item.errorMsg = ''

  addLog('🚀 === 开始转换 ===')

  try {
    const result = await executeConvert(
      item.file, item.fileType,
      {
        targetType: item.targetType,
        imageQuality: convertOptions.imageQuality,
        pdfPageRange: convertOptions.pdfPageRange
      },
      (p: number) => { item.progress = p },
      (msg: string) => addLog(msg, msg.startsWith('❌'))
    )

    if (cancelFlag) {
      item.status = 'idle'; item.progress = 0
      addLog('⚠️ 用户取消')
      showToast('info', '转换已取消')
    } else if (result.success) {
      item.status = 'success'; item.progress = 100
      item.resultBlob = result.blob
      item.resultBlobs = result.blobs
      addLog('✅ === 转换成功 ===')
      showToast('success', '转换完成！')
    } else {
      item.status = 'error'
      item.errorMsg = result.error || '转换失败'
      addLog(`❌ ${item.errorMsg}`, true)
      showToast('error', item.errorMsg)
    }
  } catch (err) {
    item.status = 'error'
    item.errorMsg = err instanceof Error ? err.message : '未知错误'
    addLog(`❌ [异常] ${item.errorMsg}`, true)
    showToast('error', item.errorMsg)
  }

  isConverting.value = false
  cancelFlag = false
}

const handleCancelConvert = (): void => { cancelFlag = true; showToast('info', '正在取消...') }
const handleDownload = (): void => {
  const item = currentItem.value
  if (!item || item.status !== 'success') return
  try { downloadSingleResult(item); showToast('success', `已下载: ${item.fileName}`) }
  catch (err) { showToast('error', err instanceof Error ? err.message : '下载失败') }
}
const handleUpdateQuality = (v: number): void => { convertOptions.imageQuality = v }
const handleUpdatePageRange = (v: string): void => { convertOptions.pdfPageRange = v }
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <Toast :messages="toasts" @remove="(id) => toasts = toasts.filter(t => t.id !== id)" />

    <div class="max-w-xl mx-auto px-4 py-8 md:py-14 space-y-6">
      <header class="text-center space-y-1.5">
        <h1 class="text-2xl md:text-3xl font-bold text-gray-800 dark:text-gray-100">📁 文件格式转换</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400">纯前端离线 · 无数据上传 · 免费使用</p>
      </header>

      <div class="flex flex-wrap justify-center gap-1.5">
        <span class="text-[11px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">PDF ⇄ 图片</span>
        <span class="text-[11px] px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">图片互转</span>
        <span class="text-[11px] px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">PDF ⇄ Office</span>
        <span class="text-[11px] px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">Office → 图片</span>
      </div>

      <UploadArea @file-selected="handleFileSelected" />

      <FileList :item="currentItem" :is-converting="isConverting" @remove="handleRemoveFile" @download="handleDownload" />

      <ConvertPanel
        v-if="currentItem"
        :file-type="currentFileType"
        :target-type="currentTargetType"
        :is-converting="isConverting"
        :file-status="currentStatus"
        :image-quality="convertOptions.imageQuality"
        :pdf-page-range="convertOptions.pdfPageRange"
        @change-target="handleChangeTarget"
        @start-convert="handleStartConvert"
        @cancel-convert="handleCancelConvert"
        @download="handleDownload"
        @update-quality="handleUpdateQuality"
        @update-page-range="handleUpdatePageRange"
      />

      <!-- 错误卡片 -->
      <div
        v-if="currentItem?.status === 'error' && currentItem?.errorMsg"
        class="w-full bg-red-50 dark:bg-red-950/25 border border-red-200 dark:border-red-800 rounded-2xl p-4"
      >
        <div class="flex items-start gap-3">
          <span class="text-xl flex-shrink-0">❌</span>
          <div class="space-y-1.5 min-w-0">
            <p class="text-sm font-semibold text-red-700 dark:text-red-300">转换失败</p>
            <p class="text-sm text-red-600 dark:text-red-400 break-all">{{ currentItem.errorMsg }}</p>
            <button class="text-xs text-blue-600 dark:text-blue-400 hover:underline" @click="openLogModal">
              📋 查看详细日志 →
            </button>
          </div>
        </div>
      </div>

      <footer class="text-center text-xs text-gray-400 dark:text-gray-500 pb-6">
        <p>🔒 所有文件转换均在浏览器本地完成 | PDF · Word · Excel · PNG · JPG · WebP | 最大 50MB</p>
      </footer>
    </div>

    <!-- ==================== 日志浮动按钮 ==================== -->
    <button
      v-if="debugLogs.length > 0"
      class="fixed bottom-5 right-5 z-40 px-4 py-2.5 rounded-full font-medium text-sm
             bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700
             shadow-lg hover:shadow-xl transition-all duration-200
             text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-750
             flex items-center gap-2"
      @click="openLogModal"
    >
      <span>📋</span>
      <span>日志</span>
      <span v-if="debugLogs.length" class="text-xs px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700">{{ debugLogs.length }}</span>
      <span v-if="logErrorCount > 0" class="w-2 h-2 rounded-full bg-red-500" />
    </button>

    <!-- ==================== 日志弹窗 ==================== -->
    <Teleport to="body">
      <div
        v-if="showLogModal"
        class="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
        @click.self="showLogModal = false"
      >
        <!-- 遮罩 -->
        <div class="absolute inset-0 bg-black/40" />

        <!-- 弹窗 -->
        <div class="relative w-full sm:max-w-lg sm:rounded-2xl bg-white dark:bg-gray-800 shadow-2xl
                    max-h-[85vh] sm:max-h-[70vh] flex flex-col
                    rounded-t-2xl sm:rounded-2xl">
          <!-- 头部 -->
          <div class="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <span class="text-sm font-semibold text-gray-700 dark:text-gray-300">
              🔍 调试日志
              <span class="ml-1 text-xs text-gray-400 font-normal">({{ debugLogs.length }} 条)</span>
              <span v-if="logErrorCount > 0" class="ml-1 text-xs text-red-500">{{ logErrorCount }} 个错误</span>
            </span>
            <div class="flex items-center gap-2">
              <button
                class="text-xs text-gray-400 hover:text-red-500 transition-colors"
                @click="debugLogs = []"
              >清空</button>
              <button
                class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors text-lg leading-none"
                @click="showLogModal = false"
              >✕</button>
            </div>
          </div>

          <!-- 日志内容 -->
          <div
            id="log-modal-body"
            class="flex-1 overflow-y-auto p-4 space-y-1 font-mono text-xs"
          >
            <div v-if="debugLogs.length === 0" class="text-gray-400 text-center py-8">暂无日志</div>
            <div
              v-for="(log, i) in debugLogs"
              :key="i"
              :class="[
                'flex gap-2',
                log.isError ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'
              ]"
            >
              <span class="text-gray-400 flex-shrink-0 select-none w-14">{{ log.time }}</span>
              <span class="break-all">{{ log.msg }}</span>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
