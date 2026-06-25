<script setup lang="ts">
// ============================================================
// ProgressBar 组件 - 转换进度条
// 带百分比显示和动画效果
// ============================================================

withDefaults(defineProps<{
  /** 当前进度 0-100 */
  progress: number
  /** 是否显示百分比文字 */
  showLabel?: boolean
}>(), {
  showLabel: true
})
</script>

<template>
  <div class="w-full flex items-center gap-2">
    <!-- 进度条轨道 -->
    <div class="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
      <!-- 进度条填充 -->
      <div
        class="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all duration-300 ease-out"
        :style="{ width: `${Math.min(100, Math.max(0, progress))}%` }"
      />
    </div>
    <!-- 百分比 -->
    <span
      v-if="showLabel"
      class="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 min-w-[36px] text-right"
    >
      {{ Math.round(progress) }}%
    </span>
  </div>
</template>
