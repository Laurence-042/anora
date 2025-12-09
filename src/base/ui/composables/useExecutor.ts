/**
 * useExecutor - 执行器操作组合式函数
 * 提供执行控制和状态监控
 */
import { computed, ref, onUnmounted } from 'vue'
import { useGraphStore } from '@/stores/graph'
import { ExecutorStatus } from '@/base/runtime/types'
import type { ExecutorEvent } from '@/base/runtime/executor'

/**
 * 执行器操作组合式函数
 */
export function useExecutor() {
  const store = useGraphStore()

  /** 执行状态 */
  const status = computed(() => store.executorStatus)

  /** 是否正在执行 */
  const isRunning = computed(() => store.isRunning)

  /** 当前迭代 */
  const currentIteration = computed(() => store.currentIteration)

  /** 正在执行的节点数 */
  const executingNodeCount = computed(() => store.executingNodeIds.size)

  /** 执行历史（最近的事件） */
  const eventHistory = ref<ExecutorEvent[]>([])
  const maxHistorySize = 100

  /**
   * 开始执行
   */
  async function start(): Promise<void> {
    if (isRunning.value) return
    eventHistory.value = []
    await store.startExecution()
  }

  /**
   * 停止执行
   */
  function stop(): void {
    store.stopExecution()
  }

  /**
   * 设置迭代延迟
   */
  function setDelay(ms: number): void {
    store.iterationDelay = Math.max(0, ms)
  }

  /**
   * 监听执行器事件
   */
  function onEvent(callback: (event: ExecutorEvent) => void): () => void {
    const originalHandler = store.handleExecutorEvent
    store.handleExecutorEvent = (event: ExecutorEvent) => {
      originalHandler(event)
      callback(event)

      // 记录到历史
      eventHistory.value.push(event)
      if (eventHistory.value.length > maxHistorySize) {
        eventHistory.value.shift()
      }
    }

    return () => {
      store.handleExecutorEvent = originalHandler
    }
  }

  /**
   * 检查节点是否正在执行
   */
  function isNodeExecuting(nodeId: string): boolean {
    return store.isNodeExecuting(nodeId)
  }

  /**
   * 获取状态文本
   */
  function getStatusText(): string {
    switch (status.value) {
      case ExecutorStatus.Idle:
        return '空闲'
      case ExecutorStatus.Running:
        return `执行中 (迭代 ${currentIteration.value})`
      case ExecutorStatus.Completed:
        return `完成 (${currentIteration.value} 次迭代)`
      case ExecutorStatus.Cancelled:
        return '已取消'
      case ExecutorStatus.Error:
        return '错误'
      default:
        return String(status.value)
    }
  }

  return {
    status,
    isRunning,
    currentIteration,
    executingNodeCount,
    eventHistory,
    start,
    stop,
    setDelay,
    onEvent,
    isNodeExecuting,
    getStatusText,
  }
}
