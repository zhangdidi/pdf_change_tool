<script setup lang="ts">
// ============================================================
// ConvertPanel 组件 — 统一的转换操作面板
// 包含：格式选择、质量调节、页码范围、转换/下载按钮
// ============================================================

import { computed } from 'vue'
import type { FileType } from '@/types/file'
import { FILE_TYPE_LABELS, CONVERSION_TARGETS } from '@/types/file'

const props = defineProps<{
  /** 当前文件类型 */
  fileType: FileType | null
  /** 当前选中的目标格式 */
  targetType: FileType
  /** 是否正在转换 */
  isConverting: boolean
  /** 当前文件状态 */
  fileStatus: string
  /** 图片质量 */
  imageQuality: number
  /** PDF 页码范围 */
  pdfPageRange: string
}>()

const emit = defineEmits<{
  changeTarget: [type: FileType]
  startConvert: []
  cancelConvert: []
  download: []
  updateQuality: [value: number]
  updatePageRange: [value: string]
}>()

/** 可选的目标格式列表 */
const availableTargets = computed<FileType[]>(() => {
  if (!props.fileType) return []
  return CONVERSION_TARGETS[props.fileType] || []
})

/** 是否图片相关转换（显示质量滑块） */
const showQuality = computed(() =>
  ['png', 'jpg', 'webp'].includes(props.targetType)
)

/** 是否 PDF 转图片（显示页码范围） */
const showPageRange = computed(() =>
  props.fileType === 'pdf' && ['png', 'jpg'].includes(props.targetType)
)

/** 质量百分比 */
const qualityPercent = computed(() => Math.round(props.imageQuality * 100))

/** 质量滑块变更 */
const onQualityInput = (e: Event): void => {
  const val = parseFloat((e.target as HTMLInputElement).value)
  emit('updateQuality', val)
}

/** 页码范围变更 */
const onPageRangeInput = (e: Event): void => {
  emit('updatePageRange', (e.target as HTMLInputElement).value)
}
</script>

<template>
  <div class="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 space-y-5">
    <!-- 目标格式选择 -->
    <div class="space-y-2">
      <label class="text-xs font-medium text-gray-500 dark:text-gray-400">转换为</label>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="t in availableTargets"
          :key="t"
          :disabled="isConverting"
          :class="[
            'px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            targetType === t
              ? 'bg-blue-500 text-white shadow-md shadow-blue-500/20'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          ]"
          @click="emit('changeTarget', t)"
        >
          {{ FILE_TYPE_LABELS[t] }}
          <span class="text-xs opacity-70 ml-0.5">.{{ t }}</span>
        </button>
      </div>
    </div>

    <!-- 图片质量（仅图片目标时显示） -->
    <div v-if="showQuality" class="space-y-1.5">
      <div class="flex items-center justify-between">
        <label class="text-xs text-gray-500 dark:text-gray-400">图片质量</label>
        <span class="text-xs font-mono text-gray-700 dark:text-gray-300">{{ qualityPercent }}%</span>
      </div>
      <input
        :value="imageQuality"
        type="range" min="0.1" max="1" step="0.05"
        :disabled="isConverting"
        class="w-full h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full appearance-none cursor-pointer accent-blue-500 disabled:opacity-40"
        @input="onQualityInput"
      />
      <div class="flex justify-between text-[10px] text-gray-400">
        <span>小文件</span><span>高质量</span>
      </div>
    </div>

    <!-- PDF 页码范围（仅 PDF→图片时显示） -->
    <div v-if="showPageRange" class="space-y-1.5">
      <label class="text-xs text-gray-500 dark:text-gray-400">PDF 页码范围</label>
      <input
        :value="pdfPageRange"
        type="text" placeholder="all（全部）或 1-3,5"
        :disabled="isConverting"
        class="w-full text-sm px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg
               bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200
               placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-400
               disabled:opacity-40 disabled:cursor-not-allowed"
        @input="onPageRangeInput"
      />
      <p class="text-[10px] text-gray-400">例：all / 1-3 / 1,3,5 / 1-3,7,9-11</p>
    </div>

    <!-- 操作按钮区 -->
    <div class="flex gap-3 pt-1">
      <!-- 下载（完成后） -->
      <button
        v-if="fileStatus === 'success'"
        class="flex-1 py-2.5 px-4 rounded-xl font-semibold text-sm transition-all duration-200
               bg-green-500 hover:bg-green-600 active:scale-[0.98]
               text-white shadow-md shadow-green-500/20"
        @click="emit('download')"
      >
        ⬇ 下载结果
      </button>

      <!-- 转换中 -->
      <button
        v-else-if="isConverting"
        disabled
        class="flex-1 py-2.5 px-4 rounded-xl font-semibold text-sm
               bg-blue-500 text-white shadow-md shadow-blue-500/20
               flex items-center justify-center gap-2 cursor-wait"
      >
        <span class="inline-block w-4 h-4 border-[3px] border-white border-t-transparent rounded-full animate-spin-custom" />
        转换中...
      </button>

      <!-- 开始转换 -->
      <button
        v-else
        class="flex-1 py-2.5 px-4 rounded-xl font-semibold text-sm transition-all duration-200
               bg-blue-500 hover:bg-blue-600 active:scale-[0.98]
               text-white shadow-md shadow-blue-500/20
               disabled:bg-gray-300 disabled:text-gray-500 disabled:shadow-none disabled:cursor-not-allowed
               dark:disabled:bg-gray-700"
        :disabled="!fileType"
        @click="emit('startConvert')"
      >
        🚀 开始转换
      </button>

      <!-- 取消 -->
      <button
        v-if="isConverting"
        class="px-4 py-2.5 rounded-xl font-medium text-sm transition-all duration-200
               bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800
               text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30"
        @click="emit('cancelConvert')"
      >
        取消
      </button>
    </div>
  </div>
</template>
