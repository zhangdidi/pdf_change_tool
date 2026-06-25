<script setup lang="ts">
// ============================================================
// Toast 组件 - 消息提示
// 支持 success / error / info / warning 四种类型
// 自动消失 + 手动关闭
// ============================================================

import type { ToastMessage } from '@/types/file'

defineProps<{
  /** 消息列表 */
  messages: ToastMessage[]
}>()

const emit = defineEmits<{
  /** 移除某条消息 */
  remove: [id: string]
}>()

/**
 * 获取类型对应样式
 */
const getToastClass = (type: ToastMessage['type']): string => {
  switch (type) {
    case 'success': return 'bg-green-500 text-white'
    case 'error': return 'bg-red-500 text-white'
    case 'warning': return 'bg-yellow-500 text-white'
    case 'info': return 'bg-blue-500 text-white'
    default: return 'bg-gray-700 text-white'
  }
}

/**
 * 获取类型对应图标
 */
const getToastIcon = (type: ToastMessage['type']): string => {
  switch (type) {
    case 'success': return '✅'
    case 'error': return '❌'
    case 'warning': return '⚠️'
    case 'info': return 'ℹ️'
    default: return '📢'
  }
}
</script>

<template>
  <!-- 固定在右上角的Toast容器 -->
  <div class="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
    <transition-group name="toast-slide">
      <div
        v-for="msg in messages"
        :key="msg.id"
        :class="[
          getToastClass(msg.type),
          'px-4 py-2.5 rounded-xl shadow-lg',
          'flex items-center gap-2.5',
          'text-sm font-medium',
          'cursor-pointer'
        ]"
        @click="emit('remove', msg.id)"
      >
        <span class="flex-shrink-0">{{ getToastIcon(msg.type) }}</span>
        <span class="flex-1 break-words">{{ msg.message }}</span>
        <button
          class="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity ml-1"
          @click.stop="emit('remove', msg.id)"
        >
          ✕
        </button>
      </div>
    </transition-group>
  </div>
</template>

<style scoped>
.toast-slide-enter-active {
  transition: all 0.3s ease-out;
}
.toast-slide-leave-active {
  transition: all 0.2s ease-in;
}
.toast-slide-enter-from {
  transform: translateX(100%);
  opacity: 0;
}
.toast-slide-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
