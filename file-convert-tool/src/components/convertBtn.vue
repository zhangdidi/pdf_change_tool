<script setup lang="ts">
// ============================================================
// ConvertBtn 组件 - 单文件转换操作按钮
// 开始转换 / 取消转换 / 下载结果
// ============================================================

defineProps<{
  hasFile: boolean
  hasCompleted: boolean
  isConverting: boolean
}>()

const emit = defineEmits<{
  start: []
  cancel: []
  download: []
}>()
</script>

<template>
  <div class="w-full flex flex-wrap gap-3">
    <!-- 开始转换 -->
    <button
      :disabled="!hasFile || isConverting"
      class="flex-1 min-w-[160px] py-3 px-6 rounded-xl font-semibold text-sm
             transition-all duration-200
             bg-blue-500 hover:bg-blue-600 active:scale-[0.98]
             text-white shadow-lg shadow-blue-500/25
             disabled:bg-gray-300 disabled:text-gray-500 disabled:shadow-none
             disabled:cursor-not-allowed dark:disabled:bg-gray-700 dark:disabled:text-gray-500
             flex items-center justify-center gap-2"
      @click="emit('start')"
    >
      <template v-if="isConverting">
        <span class="inline-block w-4 h-4 border-[3px] border-white border-t-transparent rounded-full animate-spin-custom" />
        转换中...
      </template>
      <template v-else>
        🚀 开始转换
      </template>
    </button>

    <!-- 取消 -->
    <button
      v-if="isConverting"
      class="px-6 py-3 rounded-xl font-medium text-sm transition-all duration-200
             bg-red-50 dark:bg-red-950/20 border-2 border-red-200 dark:border-red-800
             text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30
             active:scale-[0.98]"
      @click="emit('cancel')"
    >
      取消转换
    </button>

    <!-- 下载结果 -->
    <button
      v-if="hasCompleted && !isConverting"
      class="px-6 py-3 rounded-xl font-medium text-sm transition-all duration-200
             bg-green-500 hover:bg-green-600 active:scale-[0.98]
             text-white shadow-lg shadow-green-500/25"
      @click="emit('download')"
    >
      ⬇ 下载结果
    </button>
  </div>
</template>
