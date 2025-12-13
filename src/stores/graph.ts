/**
 * 图状态管理 Store
 * 管理 AnoraGraph、执行状态、UI 状态等
 */
import { defineStore } from 'pinia'
import { ref, computed, shallowRef, triggerRef } from 'vue'
import { AnoraGraph } from '@/base/runtime/graph'
import { BasicExecutor, type ExecutorEvent, type EdgeDataTransfer } from '@/base/runtime/executor'
import { BaseNode } from '@/base/runtime/nodes'
import { SubGraphNode } from '@/base/runtime/nodes/SubGraphNode'
import { ExecutorStatus, DEFAULT_EXECUTOR_CONTEXT } from '@/base/runtime/types'
import type { ExecutorContext } from '@/base/runtime/types'
import { DemoRecorder, ReplayExecutor, ReplayState } from '@/base/runtime/demo'
import type { DemoRecording } from '@/base/runtime/demo'

/**
 * 子图栈项
 */
export interface SubGraphStackItem {
  node: SubGraphNode
  label: string
}

export const useGraphStore = defineStore('graph', () => {
  // ==================== 图状态 ====================

  /** 根子图节点（整个项目的最外层） */
  const rootSubGraph = shallowRef<SubGraphNode>(new SubGraphNode(undefined, 'Root'))

  /** 当前正在编辑的图 */
  const currentGraph = shallowRef<AnoraGraph>(new AnoraGraph())

  /** 子图导航栈 */
  const subGraphStack = ref<SubGraphStackItem[]>([])

  /** 当前选中的节点 ID 列表 */
  const selectedNodeIds = ref<Set<string>>(new Set())

  /** 当前选中的边（出 Port ID -> 入 Port ID） */
  const selectedEdges = ref<Set<string>>(new Set())

  /** 不兼容的边（类型不匹配） */
  const incompatibleEdges = ref<Set<string>>(new Set())

  // ==================== 执行器状态 ====================

  /** 执行器实例 */
  const executor = shallowRef<BasicExecutor>(new BasicExecutor())

  /** 执行器状态 */
  const executorStatus = ref<ExecutorStatus>(ExecutorStatus.Idle)

  /** 当前迭代次数 */
  const currentIteration = ref<number>(0)

  /** 当前正在执行的节点 ID 集合 */
  const executingNodeIds = ref<Set<string>>(new Set())

  /** 执行上下文 */
  const executorContext = ref<ExecutorContext>({ ...DEFAULT_EXECUTOR_CONTEXT })

  /** 迭代间延迟（毫秒，用于调试） */
  const iterationDelay = ref<number>(0)

  /** 边上传递的数据（用于调试/演示显示） */
  const edgeDataTransfers = ref<Map<string, EdgeDataTransfer>>(new Map())

  // ==================== 录制/回放状态 ====================

  /** 录制器实例 */
  const demoRecorder = shallowRef<DemoRecorder>(new DemoRecorder())

  /** 回放执行器实例 */
  const replayExecutor = shallowRef<ReplayExecutor>(new ReplayExecutor())

  /** 是否正在录制 */
  const isRecording = ref(false)

  /** 录制的事件数量 */
  const recordedEventCount = ref(0)

  /** 回放状态 */
  const replayState = ref<ReplayState>(ReplayState.Idle)

  /** 是否处于回放模式 */
  const isReplayMode = ref(false)

  /** 回放进度 */
  const replayProgress = ref({ current: 0, total: 0 })

  /** 节点位置（用于录制和回放） */
  const nodePositions = ref<Map<string, { x: number; y: number }>>(new Map())

  // ==================== 计算属性 ====================

  /** 所有节点 */
  const nodes = computed(() => currentGraph.value.getAllNodes())

  /** 是否正在执行 */
  const isRunning = computed(() => executorStatus.value === ExecutorStatus.Running)

  /** 是否正在回放 */
  const isReplaying = computed(() => replayState.value === ReplayState.Playing)

  /** 当前面包屑路径 */
  const breadcrumbPath = computed(() => {
    const path: Array<{ label: string; node: SubGraphNode | null }> = [
      { label: 'Root', node: null },
    ]
    for (const item of subGraphStack.value) {
      path.push({ label: item.label, node: item.node as SubGraphNode })
    }
    return path
  })

  // ==================== 图操作 ====================

  /**
   * 初始化根图
   */
  function initializeRootGraph(): void {
    rootSubGraph.value = new SubGraphNode(undefined, 'Root')
    const graph = new AnoraGraph()
    rootSubGraph.value.setGraph(graph)
    currentGraph.value = graph
    subGraphStack.value = []
    triggerRef(currentGraph)
  }

  /**
   * 添加节点到当前图
   */
  function addNode(node: BaseNode): void {
    currentGraph.value.addNode(node)
    triggerRef(currentGraph)
  }

  /**
   * 移除节点
   */
  function removeNode(nodeId: string): void {
    currentGraph.value.removeNode(nodeId)
    selectedNodeIds.value.delete(nodeId)
    triggerRef(currentGraph)
  }

  /**
   * 添加边
   */
  function addEdge(fromPortId: string, toPortId: string): boolean {
    const result = currentGraph.value.addEdge(fromPortId, toPortId)
    if (result) {
      triggerRef(currentGraph)
    }
    return result
  }

  /**
   * 移除边
   */
  function removeEdge(fromPortId: string, toPortId: string): void {
    currentGraph.value.removeEdge(fromPortId, toPortId)
    selectedEdges.value.delete(`${fromPortId}->${toPortId}`)
    triggerRef(currentGraph)
  }

  /**
   * 通知节点已变更（用于触发视图更新）
   * 当节点属性（如 label、context）被修改时调用
   */
  function notifyNodeChanged(_nodeId?: string): void {
    triggerRef(currentGraph)
  }

  /**
   * 进入子图
   */
  function enterSubGraph(node: SubGraphNode): void {
    if (!node.graph) {
      console.warn('SubGraphNode has no graph')
      return
    }

    subGraphStack.value.push({
      node,
      label: node.label,
    })
    currentGraph.value = node.graph as AnoraGraph
    selectedNodeIds.value.clear()
    selectedEdges.value.clear()
    triggerRef(currentGraph)
  }

  /**
   * 返回上一级图
   */
  function exitSubGraph(): void {
    if (subGraphStack.value.length === 0) return

    subGraphStack.value.pop()

    if (subGraphStack.value.length === 0) {
      currentGraph.value = (rootSubGraph.value.graph ?? new AnoraGraph()) as AnoraGraph
    } else {
      const parent = subGraphStack.value[subGraphStack.value.length - 1]
      if (parent && parent.node.graph) {
        currentGraph.value = parent.node.graph as AnoraGraph
      }
    }

    selectedNodeIds.value.clear()
    selectedEdges.value.clear()
    triggerRef(currentGraph)
  }

  /**
   * 导航到指定层级
   */
  function navigateToLevel(index: number): void {
    if (index < 0) return

    while (subGraphStack.value.length > index) {
      subGraphStack.value.pop()
    }

    if (subGraphStack.value.length === 0) {
      currentGraph.value = (rootSubGraph.value.graph ?? new AnoraGraph()) as AnoraGraph
    } else {
      const current = subGraphStack.value[subGraphStack.value.length - 1]
      if (current && current.node.graph) {
        currentGraph.value = current.node.graph as AnoraGraph
      }
    }

    selectedNodeIds.value.clear()
    selectedEdges.value.clear()
    triggerRef(currentGraph)
  }

  // ==================== 选择操作 ====================

  /**
   * 选中节点
   */
  function selectNode(nodeId: string, append: boolean = false): void {
    if (!append) {
      selectedNodeIds.value.clear()
    }
    selectedNodeIds.value.add(nodeId)
  }

  /**
   * 取消选中节点
   */
  function deselectNode(nodeId: string): void {
    selectedNodeIds.value.delete(nodeId)
  }

  /**
   * 清空选择
   */
  function clearSelection(): void {
    selectedNodeIds.value.clear()
    selectedEdges.value.clear()
  }

  /**
   * 检查节点是否被选中
   */
  function isNodeSelected(nodeId: string): boolean {
    return selectedNodeIds.value.has(nodeId)
  }

  // ==================== 执行器操作 ====================

  /**
   * 执行器事件处理
   */
  function handleExecutorEvent(event: ExecutorEvent): void {
    switch (event.type) {
      case 'start':
        executorStatus.value = ExecutorStatus.Running
        currentIteration.value = 0
        executingNodeIds.value.clear()
        edgeDataTransfers.value.clear()
        break

      case 'iteration':
        currentIteration.value = event.iteration
        // 新迭代开始时清除上一迭代的边数据
        edgeDataTransfers.value.clear()
        break

      case 'node-start':
        // 创建新 Set 以触发响应式更新
        executingNodeIds.value = new Set([...executingNodeIds.value, event.node.id])
        break

      case 'node-complete':
        // 创建新 Set 以触发响应式更新
        {
          const newSet = new Set(executingNodeIds.value)
          newSet.delete(event.node.id)
          executingNodeIds.value = newSet
        }
        break

      case 'data-propagate':
        // 记录边上传递的数据（创建新 Map 以触发响应式更新）
        {
          const newMap = new Map(edgeDataTransfers.value)
          for (const transfer of event.transfers) {
            const edgeKey = `${transfer.fromPortId}->${transfer.toPortId}`
            newMap.set(edgeKey, transfer)
          }
          edgeDataTransfers.value = newMap
        }
        break

      case 'complete':
        executorStatus.value = event.result.status
        executingNodeIds.value.clear()
        triggerRef(currentGraph) // 刷新以显示执行后的 Port 值
        break

      case 'cancelled':
        executorStatus.value = ExecutorStatus.Cancelled
        executingNodeIds.value.clear()
        edgeDataTransfers.value.clear()
        break

      case 'error':
        executorStatus.value = ExecutorStatus.Error
        executingNodeIds.value.clear()
        console.error('[Executor Error]', event.error.message, event.error.stack)
        break
    }
  }

  /**
   * 开始执行
   */
  async function startExecution(): Promise<void> {
    if (isRunning.value) return

    // 注册事件监听
    const unsubscribe = executor.value.on(handleExecutorEvent)

    // 将迭代延迟传递给执行器上下文
    const context: ExecutorContext = {
      ...executorContext.value,
      iterationDelay: iterationDelay.value,
    }

    try {
      await executor.value.execute(currentGraph.value, context)
    } finally {
      unsubscribe()
    }
  }

  /**
   * 停止执行
   */
  function stopExecution(): void {
    executor.value.cancel()
  }

  /**
   * 检查节点是否正在执行
   */
  function isNodeExecuting(nodeId: string): boolean {
    return executingNodeIds.value.has(nodeId)
  }

  /**
   * 检查节点相关边的兼容性
   * 当节点 Port 类型变更时调用
   * 只更新 incompatibleEdges 状态，不触发全图刷新
   */
  function checkNodeEdgesCompatibility(nodeId: string): void {
    const incompatible = currentGraph.value.checkNodeEdgesCompatibility(nodeId)

    if (incompatible.length > 0) {
      console.warn(
        `[Graph] Found ${incompatible.length} incompatible edge(s) for node ${nodeId}:`,
        incompatible,
      )
    }

    // 只更新 incompatibleEdges，不触发 currentGraph 刷新
    // 这样只会影响边的样式计算，不会导致全图重新渲染
    incompatibleEdges.value = currentGraph.value.getIncompatibleEdges()
  }

  /**
   * 检查边是否不兼容
   */
  function isEdgeIncompatible(fromPortId: string, toPortId: string): boolean {
    return incompatibleEdges.value.has(`${fromPortId}->${toPortId}`)
  }

  /**
   * 获取边上传递的数据
   */
  function getEdgeDataTransfer(fromPortId: string, toPortId: string): EdgeDataTransfer | undefined {
    return edgeDataTransfers.value.get(`${fromPortId}->${toPortId}`)
  }

  /**
   * 检查边是否有数据传递（用于高亮）
   */
  function hasEdgeDataTransfer(fromPortId: string, toPortId: string): boolean {
    return edgeDataTransfers.value.has(`${fromPortId}->${toPortId}`)
  }

  // ==================== 录制操作 ====================

  /**
   * 初始化录制器
   * 绑定执行器和图，设置状态同步回调
   */
  function initializeRecorder(): void {
    const recorder = demoRecorder.value

    // 绑定执行器和图
    recorder.bindExecutor(executor.value)
    recorder.bindGraph(currentGraph.value)

    // 设置状态同步回调
    recorder.onRecordingChange = (recording, count) => {
      isRecording.value = recording
      recordedEventCount.value = count
    }
  }

  /**
   * 更新节点位置（供外部调用）
   */
  function updateNodePosition(nodeId: string, position: { x: number; y: number }): void {
    nodePositions.value.set(nodeId, { ...position })
  }

  /**
   * 开始录制
   */
  function startRecording(): void {
    if (isRecording.value || isReplayMode.value) return

    // 确保录制器绑定了最新的执行器和图
    initializeRecorder()

    // 录制器自行管理事件订阅
    demoRecorder.value.startRecording(nodePositions.value)
  }

  /**
   * 停止录制
   */
  function stopRecording(): void {
    if (!isRecording.value) return

    // 录制器自行管理事件取消订阅
    demoRecorder.value.stopRecording()
  }

  /**
   * 导出录制
   */
  function exportRecording(metadata?: { title?: string; description?: string }): DemoRecording {
    return demoRecorder.value.exportRecording({
      ...metadata,
      iterationDelay: iterationDelay.value,
    })
  }

  /**
   * 清空录制
   */
  function clearRecording(): void {
    demoRecorder.value.clear()
    recordedEventCount.value = 0
  }

  // ==================== 回放操作 ====================

  /**
   * 加载录制并进入回放模式
   */
  function loadRecording(recording: DemoRecording): void {
    if (isRecording.value || isRunning.value) return

    // 反序列化初始图
    const graph = new AnoraGraph()
    graph.deserialize(recording.initialGraph)

    // 替换当前图
    currentGraph.value = graph
    rootSubGraph.value.setGraph(graph)
    subGraphStack.value = []
    triggerRef(currentGraph)

    // 恢复节点位置
    nodePositions.value.clear()
    for (const [nodeId, pos] of Object.entries(recording.nodePositions)) {
      nodePositions.value.set(nodeId, { ...pos })
    }

    // 设置回放执行器
    replayExecutor.value.onStateChange = (state) => {
      replayState.value = state
    }
    replayExecutor.value.onProgressChange = (current, total) => {
      replayProgress.value = { current, total }
    }

    // 加载录制到回放执行器
    replayExecutor.value.loadRecording(recording, currentGraph.value)

    // 注册事件监听（使用与正常执行相同的处理逻辑）
    replayExecutor.value.on(handleExecutorEvent)

    isReplayMode.value = true
    replayState.value = ReplayState.Idle
  }

  /**
   * 退出回放模式
   */
  function exitReplayMode(): void {
    if (!isReplayMode.value) return

    replayExecutor.value.stop()
    isReplayMode.value = false
    replayState.value = ReplayState.Idle
    replayProgress.value = { current: 0, total: 0 }

    // 重置图
    initializeRootGraph()
  }

  /**
   * 回放：播放/暂停切换
   */
  function toggleReplay(): void {
    if (!isReplayMode.value) return

    if (replayState.value === ReplayState.Playing) {
      replayExecutor.value.pause()
    } else {
      replayExecutor.value.play()
    }
  }

  /**
   * 回放：单步前进
   */
  function replayStepForward(): void {
    if (!isReplayMode.value) return
    replayExecutor.value.stepForward()
  }

  /**
   * 回放：跳转到指定位置
   */
  async function replaySeekTo(index: number): Promise<void> {
    if (!isReplayMode.value) return
    await replayExecutor.value.seekTo(index)
  }

  /**
   * 回放：重置到开始
   */
  function replayReset(): void {
    if (!isReplayMode.value) return
    replayExecutor.value.stop()

    // 重新加载初始图状态
    // 需要重新反序列化
  }

  /**
   * 设置回放速度
   */
  function setReplaySpeed(speed: number): void {
    replayExecutor.value.playbackSpeed = speed
  }

  // ==================== 初始化 ====================

  // 创建初始图
  initializeRootGraph()

  return {
    // 状态
    rootSubGraph,
    currentGraph,
    subGraphStack,
    selectedNodeIds,
    selectedEdges,
    incompatibleEdges,
    executor,
    executorStatus,
    currentIteration,
    executingNodeIds,
    executorContext,
    iterationDelay,
    edgeDataTransfers,

    // 录制/回放状态
    isRecording,
    recordedEventCount,
    isReplayMode,
    replayState,
    replayProgress,
    nodePositions,

    // 计算属性
    nodes,
    isRunning,
    isReplaying,
    breadcrumbPath,

    // 图操作
    initializeRootGraph,
    addNode,
    removeNode,
    addEdge,
    removeEdge,
    notifyNodeChanged,
    enterSubGraph,
    exitSubGraph,
    navigateToLevel,

    // 选择操作
    selectNode,
    deselectNode,
    clearSelection,
    isNodeSelected,

    // 执行器操作
    startExecution,
    stopExecution,
    isNodeExecuting,
    handleExecutorEvent,

    // 边兼容性检查
    checkNodeEdgesCompatibility,
    isEdgeIncompatible,

    // 边数据传递
    getEdgeDataTransfer,
    hasEdgeDataTransfer,

    // 录制操作
    updateNodePosition,
    startRecording,
    stopRecording,
    exportRecording,
    clearRecording,

    // 回放操作
    loadRecording,
    exitReplayMode,
    toggleReplay,
    replayStepForward,
    replaySeekTo,
    replayReset,
    setReplaySpeed,
  }
})
