/**
 * 图状态管理 Store
 * 管理 AnoraGraph、执行状态、UI 状态等
 *
 * 架构职责：
 * - 作为 Runtime 层 (AnoraGraph) 和 UI 层 (Vue-Flow) 之间的适配层
 * - 持有 AnoraGraph 实例，暴露 Anora 语义的操作方法
 * - 内部管理 Vue-Flow 状态，对外暴露 vfNodes/vfEdges 供 UI 组件使用
 * - UI 组件只依赖此 Store，不直接依赖 Vue-Flow
 *
 * 响应式更新机制：
 * - currentGraph 使用 shallowRef，不追踪对象内部变化
 * - graphRevision 是独立的 ref<number>，每次图结构变化时递增
 * - AnoraGraph.onUpdate() 回调在图变化时自动触发 graphRevision++ 和 triggerRef()
 * - vfNodes/vfEdges computed 依赖 graphRevision 触发重新计算
 *
 * 注意：此 Store 不关心录制/回放，那些逻辑由 RecordingControls 组件自行管理
 */
import { defineStore } from 'pinia'
import { ref, computed, shallowRef, triggerRef, markRaw, type Component } from 'vue'
import { useVueFlow, type Node as VFNode, type Edge as VFEdge } from '@vue-flow/core'
import { AnoraGraph } from '@/base/runtime/graph'
import {
  ExecutorEventType,
  ExecutionMode,
  ExecutorState,
  type ExecutorEvent,
  type EdgeDataTransfer,
  type ExecuteOptions,
  type ExecutorEventListener,
} from '@/base/runtime/executor'
import { BaseNode } from '@/base/runtime/nodes'
import { SubGraphNode } from '@/base/runtime/nodes/SubGraphNode'
import {
  DEFAULT_EXECUTOR_CONTEXT,
  NodeExecutionStatus,
  type ExecutorContext,
} from '@/base/runtime/types'
import { NodeViewRegistry } from '@/base/ui/registry'

/**
 * Executor 接口 - 定义 graphStore 需要的 executor 方法
 * 这样可以接受 BasicExecutor 或任何兼容的执行器实例
 */
interface IExecutor {
  readonly executorState: ExecutorState
  on(listener: ExecutorEventListener): () => void
  execute(graph: AnoraGraph, context: ExecutorContext, options?: ExecuteOptions): Promise<unknown>
}

/**
 * 子图栈项
 */
export interface SubGraphStackItem {
  node: SubGraphNode
  label: string
}

/** Vue Flow 实例 ID（内部使用） */
const ANORA_FLOW_ID = 'anora-graph-flow'

export const useGraphStore = defineStore('graph', () => {
  // ==================== Vue Flow 内部状态 ====================
  // Vue Flow 作为内部实现细节，UI 组件不应直接访问
  const {
    getSelectedNodes,
    getSelectedEdges,
    addSelectedNodes,
    removeSelectedNodes,
    removeSelectedEdges,
    findNode,
    fitView: vfFitView,
    project: vfProject,
  } = useVueFlow(ANORA_FLOW_ID)

  // ==================== 节点视图 ====================
  // 视图组件注册委托给 NodeViewRegistry（静态注册表）
  // 这里只提供访问方法，实际注册通过 NodeViewRegistry 完成

  // ==================== 图状态 ====================

  /** 根子图节点（整个项目的最外层） */
  const rootSubGraph = shallowRef<SubGraphNode>(new SubGraphNode(undefined, 'Root'))

  /** 当前正在编辑的图 */
  const currentGraph = shallowRef<AnoraGraph>(new AnoraGraph())

  /** 图版本计数器（用于触发响应式更新） */
  const graphRevision = ref<number>(0)

  /** 节点位置映射（UI 层位置由 store 统一管理） */
  const nodePositions = ref<Map<string, { x: number; y: number }>>(new Map())

  /** 节点尺寸映射（由用户调整或从默认值读取） */
  const nodeSizes = ref<Map<string, { width: number; height: number }>>(new Map())

  /** 子图导航栈 */
  const subGraphStack = ref<SubGraphStackItem[]>([])

  /** 不兼容的边（类型不匹配）: fromPortId -> Set<toPortId> */
  const incompatibleEdges = ref<Map<string, Set<string>>>(new Map())

  /** 已展开的 ContainerPort ID 集合（用于判断子 Port 是否可见） */
  const expandedPorts = ref<Set<string>>(new Set())

  // ==================== 执行器状态 ====================
  // 注意：执行器实例由各个 View 自己维护（EditorView/ReplayView）
  // graphStore 只负责管理执行状态，不持有执行器引用

  /** 状态机状态（响应式副本） */
  const stateMachineState = ref<ExecutorState>(ExecutorState.Idle)

  /** 当前迭代次数 */
  const currentIteration = ref<number>(0)

  /** 当前正在执行的节点 ID 集合 */
  const executingNodeIds = ref<Set<string>>(new Set())

  /** 执行上下文 */
  const executorContext = ref<ExecutorContext>({ ...DEFAULT_EXECUTOR_CONTEXT })

  /** 迭代间延迟（毫秒，用于调试） */
  const iterationDelay = ref<number>(1000)

  /** 边上传递的数据（用于调试/演示显示） */
  const edgeDataTransfers = ref<Map<string, EdgeDataTransfer>>(new Map())

  /** 是否只读模式（禁用拖拽、连线等） */
  const readonly = ref<boolean>(false)

  // ==================== 视图访问方法 ====================

  /**
   * 根据节点 typeId 获取对应的 Vue-Flow 类型名
   * 委托给 NodeViewRegistry
   */
  function getViewType(nodeTypeId: string): string {
    return NodeViewRegistry.getViewType(nodeTypeId)
  }

  // ==================== 计算属性 ====================

  /** 所有节点 */
  const nodes = computed(() => currentGraph.value.getAllNodes())

  /** 选中的节点 ID 集合（从 Vue Flow 读取） */
  const selectedNodeIds = computed(() => new Set(getSelectedNodes.value.map((n) => n.id)))

  /** 选中的边 ID 集合（从 Vue Flow 读取） */
  const selectedEdges = computed(() => new Set(getSelectedEdges.value.map((e) => e.id)))

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

  // ==================== Vue-Flow 适配层 ====================

  /**
   * Vue-Flow 节点数据（供 AnoraGraphView 使用）
   */
  const vfNodes = computed<VFNode[]>(() => {
    // 依赖 graphRevision 来触发重新计算
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    graphRevision.value

    const result: VFNode[] = []
    const allNodes = currentGraph.value.getAllNodes()

    for (const node of allNodes) {
      const pos = nodePositions.value.get(node.id) ?? { x: 0, y: 0 }
      const size = nodeSizes.value.get(node.id)
      const vfNode: VFNode = {
        id: node.id,
        type: getViewType(node.typeId),
        position: pos,
        data: { node: markRaw(node), readonly: readonly.value, size },
        draggable: !readonly.value,
        selectable: !readonly.value,
      }
      // 如果有尺寸信息，直接设置到节点上（Vue Flow 需要这些属性来恢复尺寸）
      if (size) {
        vfNode.width = size.width
        vfNode.height = size.height
      }
      result.push(vfNode)
    }
    return result
  })

  /**
   * Vue-Flow 边数据（供 AnoraGraphView 使用）
   */
  const vfEdges = computed<VFEdge[]>(() => {
    // 依赖 graphRevision 以触发更新
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    graphRevision.value

    const result: VFEdge[] = []

    for (const node of currentGraph.value.getAllNodes()) {
      for (const port of node.getOutputPorts()) {
        const connectedPorts = currentGraph.value.getConnectedPorts(port)
        for (const targetPort of connectedPorts) {
          const edgeId = `${port.id}->${targetPort.id}`
          result.push({
            id: edgeId,
            source: node.id,
            target: currentGraph.value.getNodeByPort(targetPort)?.id ?? '',
            sourceHandle: port.id,
            targetHandle: targetPort.id,
            type: 'default',
          })
        }
      }
    }

    return result
  })

  /**
   * Vue-Flow 节点类型映射（供 AnoraGraphView 使用）
   * 从 NodeViewRegistry 读取
   */
  const vfNodeTypes = computed<Record<string, Component>>(() => {
    return NodeViewRegistry.getNodeTypes()
  })

  /**
   * Vue-Flow 实例 ID（供 AnoraGraphView 内部使用）
   */
  const vfFlowId = ANORA_FLOW_ID

  /**
   * 调整视图以适应所有节点
   */
  function fitView(options?: { padding?: number }): void {
    vfFitView({ padding: options?.padding ?? 0.2 })
  }

  /**
   * 将屏幕坐标转换为画布坐标
   */
  function screenToFlowCoordinate(point: { x: number; y: number }): { x: number; y: number } {
    return vfProject(point)
  }

  // ==================== 图操作 ====================

  /**
   * 设置图的 onUpdate 回调（自动递增 graphRevision）
   * 会先清除旧的监听器，避免重复监听
   */
  function setupGraphCallback(graph: AnoraGraph): void {
    // 清除旧监听器（避免切换图时累积监听器）
    graph.clearUpdateListeners()
    // 添加新监听器
    graph.onUpdate(() => {
      graphRevision.value++
      triggerRef(currentGraph)
    })
  }

  /**
   * 初始化根图
   */
  function initializeRootGraph(): void {
    rootSubGraph.value = new SubGraphNode(undefined, 'Root')
    const graph = new AnoraGraph()
    setupGraphCallback(graph)
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
    // graphRevision 由 onUpdate 回调自动递增
  }

  /**
   * 移除节点
   * 同时清理关联的 UI 数据（位置、尺寸）
   */
  function removeNode(nodeId: string): void {
    currentGraph.value.removeNode(nodeId)
    // 清理 UI 关联数据
    nodePositions.value.delete(nodeId)
    nodeSizes.value.delete(nodeId)
    // graphRevision 由 onUpdate 回调自动递增
  }

  /**
   * 添加边
   */
  function addEdge(fromPortId: string, toPortId: string): boolean {
    const result = currentGraph.value.addEdge(fromPortId, toPortId)
    // graphRevision 由 onUpdate 回调自动递增
    return result
  }

  /**
   * 移除边
   */
  function removeEdge(fromPortId: string, toPortId: string): void {
    currentGraph.value.removeEdge(fromPortId, toPortId)
    // graphRevision 由 onUpdate 回调自动递增
  }

  /**
   * 设置边的禁用状态
   */
  function setEdgeDisabled(fromPortId: string, toPortId: string, disabled: boolean): void {
    currentGraph.value.setEdgeDisabled(fromPortId, toPortId, disabled)
    // graphRevision 由 onUpdate 回调自动递增
  }

  /**
   * 切换边的禁用状态
   * @returns 新的禁用状态
   */
  function toggleEdgeDisabled(fromPortId: string, toPortId: string): boolean {
    return currentGraph.value.toggleEdgeDisabled(fromPortId, toPortId)
    // graphRevision 由 onUpdate 回调自动递增
  }

  /**
   * 检查边是否被禁用
   */
  function isEdgeDisabled(fromPortId: string, toPortId: string): boolean {
    return currentGraph.value.isEdgeDisabled(fromPortId, toPortId)
  }

  /**
   * 通知节点已变更（用于触发视图更新）
   * 当节点属性（如 label、context）被修改时调用
   */
  function notifyNodeChanged(_nodeId?: string): void {
    graphRevision.value++
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

    const graph = node.graph as AnoraGraph
    setupGraphCallback(graph)

    subGraphStack.value.push({
      node,
      label: node.label,
    })
    currentGraph.value = graph
    triggerRef(currentGraph)
  }

  /**
   * 返回上一级图
   */
  function exitSubGraph(): void {
    if (subGraphStack.value.length === 0) return

    subGraphStack.value.pop()

    let graph: AnoraGraph
    if (subGraphStack.value.length === 0) {
      graph = (rootSubGraph.value.graph ?? new AnoraGraph()) as AnoraGraph
    } else {
      const parent = subGraphStack.value[subGraphStack.value.length - 1]
      graph = (parent?.node.graph ?? new AnoraGraph()) as AnoraGraph
    }

    setupGraphCallback(graph)
    currentGraph.value = graph
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

    let graph: AnoraGraph
    if (subGraphStack.value.length === 0) {
      graph = (rootSubGraph.value.graph ?? new AnoraGraph()) as AnoraGraph
    } else {
      const current = subGraphStack.value[subGraphStack.value.length - 1]
      graph = (current?.node.graph ?? new AnoraGraph()) as AnoraGraph
    }

    setupGraphCallback(graph)
    currentGraph.value = graph
    triggerRef(currentGraph)
  }

  // ==================== 选择操作 ====================

  /**
   * 选中节点
   * @param nodeId 节点 ID
   * @param append 是否追加选中（默认清除现有选中）
   */
  function selectNode(nodeId: string, append: boolean = false): void {
    const node = findNode(nodeId)
    if (!node) return

    if (!append) {
      // 清除现有选中后添加
      removeSelectedNodes(getSelectedNodes.value)
    }
    addSelectedNodes([node])
  }

  /**
   * 取消选中节点
   */
  function deselectNode(nodeId: string): void {
    const node = findNode(nodeId)
    if (node) {
      removeSelectedNodes([node])
    }
  }

  /**
   * 清空选择
   */
  function clearSelection(): void {
    removeSelectedNodes(getSelectedNodes.value)
  }

  /**
   * 清空边的选择
   */
  function clearEdgeSelection(): void {
    removeSelectedEdges(getSelectedEdges.value)
  }

  /**
   * 检查节点是否被选中
   */
  function isNodeSelected(nodeId: string): boolean {
    return selectedNodeIds.value.has(nodeId)
  }

  /**
   * 通过 ID 列表选中节点
   */
  function selectNodesByIds(nodeIds: string[], append: boolean = false): void {
    if (!append) {
      removeSelectedNodes(getSelectedNodes.value)
    }
    const nodes = nodeIds.map((id) => findNode(id)).filter((n) => n !== undefined)
    addSelectedNodes(nodes)
  }

  // ==================== Port 展开状态操作 ====================

  /**
   * 切换 Port 展开状态
   */
  function togglePortExpand(portId: string): void {
    if (expandedPorts.value.has(portId)) {
      expandedPorts.value.delete(portId)
    } else {
      expandedPorts.value.add(portId)
    }
    graphRevision.value++
  }

  /**
   * 展开 Port
   */
  function expandPort(portId: string): void {
    expandedPorts.value.add(portId)
    graphRevision.value++
  }

  /**
   * 折叠 Port
   */
  function collapsePort(portId: string): void {
    expandedPorts.value.delete(portId)
    graphRevision.value++
  }

  /**
   * 检查 Port 是否展开
   */
  function isPortExpanded(portId: string): boolean {
    return expandedPorts.value.has(portId)
  }

  /**
   * 检查 Port 是否可见
   * Port 可见的条件：
   * 1. Port 不是 ContainerPort 的子 Port（顶层 Port 总是可见）
   * 2. 或者其所有祖先 ContainerPort 都已展开
   */
  function isPortVisible(portId: string): boolean {
    const node = currentGraph.value.getNodeByPortId(portId)
    if (!node) return true

    const port = node.getPortById(portId)
    if (!port) return true

    // 检查所有祖先 Port 是否都展开
    let currentPort = port.parentPort
    while (currentPort) {
      if (!expandedPorts.value.has(currentPort.id)) {
        return false // 有一个祖先未展开，则不可见
      }
      currentPort = currentPort.parentPort
    }

    return true
  }

  // ==================== 执行器操作 ====================

  /**
   * 执行器事件处理
   * 处理所有执行器发出的事件，更新 UI 状态
   */
  function handleExecutorEvent(event: ExecutorEvent): void {
    switch (event.type) {
      case ExecutorEventType.StateChange:
        // 状态变化时同步到 store
        stateMachineState.value = event.newState
        break

      case ExecutorEventType.Start:
        currentIteration.value = 0
        executingNodeIds.value.clear()
        edgeDataTransfers.value.clear()
        // 重置所有节点状态
        for (const node of currentGraph.value.getAllNodes()) {
          node.executionStatus = NodeExecutionStatus.IDLE
          node.lastError = undefined
        }
        break

      case ExecutorEventType.Iteration:
        currentIteration.value = event.iteration
        // 新迭代开始时清除上一迭代的节点激活状态和边数据
        executingNodeIds.value.clear()
        edgeDataTransfers.value.clear()
        // 注意：不重置节点的完成状态（SUCCESS/FAILED），保持跨迭代可见
        break

      case ExecutorEventType.NodeStart:
        // 创建新 Set 以触发响应式更新
        executingNodeIds.value = new Set([...executingNodeIds.value, event.nodeId])
        // 设置节点状态为执行中
        {
          const node = currentGraph.value.getNode(event.nodeId)
          if (node) {
            node.executionStatus = NodeExecutionStatus.EXECUTING
          }
        }
        break

      case ExecutorEventType.NodeComplete:
        // 从执行中节点集合移除
        executingNodeIds.value = new Set(
          [...executingNodeIds.value].filter((id) => id !== event.nodeId),
        )
        // 设置节点完成状态
        {
          const node = currentGraph.value.getNode(event.nodeId)
          if (node) {
            node.executionStatus = event.success
              ? NodeExecutionStatus.SUCCESS
              : NodeExecutionStatus.FAILED
            if (event.error) {
              node.lastError = event.error
            }
          }
        }
        break

      case ExecutorEventType.DataPropagate:
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

      case ExecutorEventType.Complete:
        executingNodeIds.value.clear()
        edgeDataTransfers.value.clear()
        triggerRef(currentGraph)
        break

      case ExecutorEventType.Cancelled:
        executingNodeIds.value.clear()
        edgeDataTransfers.value.clear()
        break

      case ExecutorEventType.Error:
        executingNodeIds.value.clear()
        edgeDataTransfers.value.clear()
        console.error('[Executor Error]', event.error)
        break
    }

    // 增加 graphRevision，触发节点视图更新执行状态
    graphRevision.value++
  }

  /**
   * 开始执行
   * @param executor 执行器实例（由调用方提供）
   * @param stepMode 是否使用步进模式
   */
  async function startExecution(executor: IExecutor, stepMode: boolean = false): Promise<void> {
    // 只有空闲状态才能开始执行
    if (stateMachineState.value !== ExecutorState.Idle) return

    // 注册事件监听（包含 StateChange 事件）
    const unsubscribe = executor.on(handleExecutorEvent)

    // 将迭代延迟传递给执行器上下文
    const context: ExecutorContext = {
      ...executorContext.value,
      iterationDelay: iterationDelay.value,
    }

    // 执行选项
    const options: ExecuteOptions = {
      mode: stepMode ? ExecutionMode.StepByStep : ExecutionMode.Continuous,
    }

    try {
      await executor.execute(currentGraph.value, context, options)
    } finally {
      unsubscribe()
    }
  }

  /**
   * 同步执行器状态到 store
   * @param executor 执行器实例
   */
  function syncExecutorState(executor: IExecutor): void {
    stateMachineState.value = executor.executorState
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
    // 从数组重建 Map<string, Set<string>>
    const newMap = new Map<string, Set<string>>()
    for (const [fromPortId, toPortId] of currentGraph.value.getIncompatibleEdges()) {
      let toSet = newMap.get(fromPortId)
      if (!toSet) {
        toSet = new Set()
        newMap.set(fromPortId, toSet)
      }
      toSet.add(toPortId)
    }
    incompatibleEdges.value = newMap
  }

  /**
   * 检查边是否不兼容
   */
  function isEdgeIncompatible(fromPortId: string, toPortId: string): boolean {
    return incompatibleEdges.value.get(fromPortId)?.has(toPortId) ?? false
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

  /**
   * 从序列化数据加载图（替代当前图）
   */
  function loadFromSerialized(data: import('@/base/runtime/types').SerializedGraph): void {
    const { graph, nodePositions: positions, nodeSizes: sizes } = AnoraGraph.fromSerialized(data)
    setupGraphCallback(graph)
    currentGraph.value = graph
    nodePositions.value = positions
    nodeSizes.value = sizes
    rootSubGraph.value.setGraph(graph)
    subGraphStack.value = []
    executingNodeIds.value = new Set()
    edgeDataTransfers.value = new Map()
    triggerRef(currentGraph)
  }

  /**
   * 更新节点位置
   */
  function updateNodePosition(nodeId: string, position: { x: number; y: number }): void {
    nodePositions.value.set(nodeId, position)
  }

  /**
   * 更新节点尺寸
   */
  function updateNodeSize(nodeId: string, size: { width: number; height: number }): void {
    nodeSizes.value.set(nodeId, size)
  }

  /**
   * 获取节点尺寸（如果未设置则返回 undefined）
   */
  function getNodeSize(nodeId: string): { width: number; height: number } | undefined {
    return nodeSizes.value.get(nodeId)
  }

  /**
   * 清除执行状态（用于回放结束或取消）
   */
  function clearExecutionState(): void {
    executingNodeIds.value = new Set()
    edgeDataTransfers.value = new Map()
  }

  // ==================== 初始化 ====================

  // 创建初始图
  initializeRootGraph()

  return {
    // 状态
    rootSubGraph,
    currentGraph,
    graphRevision,
    nodePositions,
    nodeSizes,
    subGraphStack,
    incompatibleEdges,
    expandedPorts,
    currentIteration,
    executingNodeIds,
    executorContext,
    iterationDelay,
    edgeDataTransfers,
    stateMachineState,
    readonly,

    // 计算属性
    nodes,
    breadcrumbPath,

    // Vue-Flow 适配层（供 UI 组件使用）
    vfNodes,
    vfEdges,
    vfNodeTypes,
    vfFlowId,
    fitView,
    screenToFlowCoordinate,

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
    loadFromSerialized,
    updateNodePosition,
    updateNodeSize,
    getNodeSize,
    clearExecutionState,

    // Port 展开状态操作
    togglePortExpand,
    expandPort,
    collapsePort,
    isPortExpanded,
    isPortVisible,

    // 执行器事件处理
    handleExecutorEvent,
    syncExecutorState,

    // 执行器操作（需要传入 executor 实例）
    startExecution,
    isNodeExecuting,

    // 边兼容性检查
    checkNodeEdgesCompatibility,
    isEdgeIncompatible,

    // 边禁用状态
    setEdgeDisabled,
    toggleEdgeDisabled,
    isEdgeDisabled,

    // 边数据传递
    getEdgeDataTransfer,
    hasEdgeDataTransfer,

    // 选择状态（来自 Vue Flow）
    selectedNodeIds,
    selectedEdges,

    // 选择操作
    selectNode,
    deselectNode,
    clearSelection,
    clearEdgeSelection,
    isNodeSelected,
    selectNodesByIds,
  }
})
