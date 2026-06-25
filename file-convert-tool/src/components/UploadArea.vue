<script setup lang="ts">
// ============================================================
// UploadArea 组件 - 单文件上传区域
// 支持点击上传 + 拖拽上传，格式/大小实时校验
// 新上传的文件自动替换旧文件
// ============================================================

import { ref, computed } from 'vue'
import { validateFile } from '@/utils/fileCheck'
import { FILE_TYPE_LABELS, ACCEPT_MIME_TYPES, ACCEPT_EXTENSIONS } from '@/types/file'

/** 组件事件 — 单文件上传 */
const emit = defineEmits<{
  /** 文件校验通过后触发，只传一个文件 */
  fileSelected: [file: File]
}>()

/** 文件 input 模板引用 */
const fileInputRef = ref<HTMLInputElement | null>(null)

/** 拖拽悬停状态 */
const isDragover = ref(false)
/** 最近一次错误信息 */
const lastError = ref('')
/** 错误显示定时器 */
let errorTimer: ReturnType<typeof setTimeout> | null = null

/** 支持的文件格式提示 */
const supportedFormats = computed(() =>
  Object.values(FILE_TYPE_LABELS).join('、')
)

/**
 * 处理单个文件
 */
const handleFile = (file: File): void => {
  const result = validateFile(file)
  if (!result.valid) {
    showError(result.error || '文件校验失败')
    return
  }
  lastError.value = ''
  emit('fileSelected', file)
}

/**
 * 3 秒自动消失的错误提示
 */
const showError = (msg: string): void => {
  lastError.value = msg
  if (errorTimer) clearTimeout(errorTimer)
  errorTimer = setTimeout(() => {
    lastError.value = ''
    errorTimer = null
  }, 3000)
}

// ============================================================
// 拖拽事件
// ============================================================

const onDragenter = (e: DragEvent): void => {
  e.preventDefault(); e.stopPropagation()
  isDragover.value = true
}
const onDragleave = (e: DragEvent): void => {
  e.preventDefault(); e.stopPropagation()
  if ((e.currentTarget as HTMLElement)?.contains(e.relatedTarget as Node)) return
  isDragover.value = false
}
const onDragover = (e: DragEvent): void => {
  e.preventDefault(); e.stopPropagation()
}
const onDrop = (e: DragEvent): void => {
  e.preventDefault(); e.stopPropagation()
  isDragover.value = false
  const files = e.dataTransfer?.files
  if (files && files.length > 0) {
    handleFile(files[0])
  }
}

/** 点击选择文件 */
const onFileChange = (e: Event): void => {
  const input = e.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    handleFile(input.files[0])
    input.value = ''
  }
}
</script>

<template>
  <div class="w-full">
    <div
      :class="[
        'relative border-2 border-dashed rounded-2xl p-10 md:p-14',
        'transition-all duration-300 cursor-pointer',
        'flex flex-col items-center justify-center gap-4 select-none',
        isDragover
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 scale-[1.01]'
          : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-750'
      ]"
      @click="fileInputRef?.click()"
      @dragenter="onDragenter"
      @dragleave="onDragleave"
      @dragover="onDragover"
      @drop="onDrop"
    >
      <div
        class="text-5xl md:text-6xl transition-transform duration-300"
        :class="{ 'scale-110': isDragover }"
      >
        {{ isDragover ? '📂' : '📁' }}
      </div>

      <div class="text-center">
        <p class="text-lg md:text-xl font-semibold text-gray-700 dark:text-gray-200 mb-1">
          {{ isDragover ? '松开以上传文件' : '点击上传或拖拽文件到此处' }}
        </p>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          支持格式：{{ supportedFormats }}
        </p>
        <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">
          单文件最大 50MB
        </p>
      </div>

      <!-- 隐藏的 file input（单文件，不用 multiple） -->
      <input
        ref="fileInputRef"
        type="file"
        :accept="`${ACCEPT_MIME_TYPES},${ACCEPT_EXTENSIONS}`"
        class="hidden"
        @change="onFileChange"
      />
    </div>

    <!-- 错误提示 -->
    <transition name="fade">
      <div
        v-if="lastError"
        class="mt-3 px-4 py-2.5 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg flex items-center gap-2 text-sm text-red-700 dark:text-red-300"
      >
        <span class="text-base flex-shrink-0">⚠️</span>
        <span>{{ lastError }}</span>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
