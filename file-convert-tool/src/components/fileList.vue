<script setup lang="ts">
// ============================================================
// FileCard 组件 — 当前文件信息卡片
// 显示：类型图标、文件名、大小、进度、状态、下载、删除
// 格式选择器已移至 ConvertPanel
// ============================================================

import type { ConvertFileItem } from '@/types/file'
import { FILE_TYPE_ICONS } from '@/types/file'
import { formatFileSize } from '@/utils/fileCheck'
import ProgressBar from './ProgressBar.vue'

defineProps<{
  item: ConvertFileItem | null
  isConverting: boolean
}>()

const emit = defineEmits<{
  remove: []
  download: []
}>()

const statusText = (item: ConvertFileItem): string => {
  switch (item.status) {
    case 'idle': return '等待转换'
    case 'loading': return `转换中 ${item.progress}%`
    case 'success': return '转换完成 ✅'
    case 'error': return '转换失败'
    default: return ''
  }
}

const cardStyle = (item: ConvertFileItem): string => {
  switch (item.status) {
    case 'error': return 'border-red-300 dark:border-red-700 bg-red-50/60 dark:bg-red-950/25'
    case 'success': return 'border-green-300 dark:border-green-700 bg-green-50/60 dark:bg-green-950/25'
    default: return 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
  }
}
</script>

<template>
  <div v-if="item" class="w-full">
    <div :class="['flex items-center gap-3 p-3.5 rounded-xl border', cardStyle(item)]">
      <!-- 图标 -->
      <span class="text-2xl flex-shrink-0 select-none">{{ FILE_TYPE_ICONS[item.fileType] }}</span>

      <!-- 信息 -->
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{{ item.fileName }}</span>
          <span class="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 font-mono flex-shrink-0">
            {{ formatFileSize(item.fileSize) }}
          </span>
        </div>

        <div v-if="item.status === 'loading'" class="mt-1.5">
          <ProgressBar :progress="item.progress" />
        </div>

        <div class="flex items-center gap-2 mt-0.5">
          <span :class="[
            'text-xs',
            item.status === 'error' ? 'text-red-500' :
            item.status === 'success' ? 'text-green-600' :
            item.status === 'loading' ? 'text-blue-500' : 'text-gray-400'
          ]">{{ statusText(item) }}</span>
          <span v-if="item.status === 'error' && item.errorMsg"
                class="text-xs text-red-400 truncate max-w-[200px]"
                :title="item.errorMsg">· {{ item.errorMsg }}</span>
        </div>
      </div>

      <!-- 操作 -->
      <div class="flex items-center gap-1.5 flex-shrink-0">
        <button v-if="item.status === 'success'"
                class="px-3 py-1.5 text-xs font-medium text-white bg-green-500 hover:bg-green-600 rounded-lg shadow-sm transition-colors"
                @click="emit('download')">⬇ 下载</button>
        <button v-if="item.status !== 'loading'"
                class="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                @click="emit('remove')">✕</button>
      </div>
    </div>
  </div>
</template>
