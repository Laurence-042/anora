/**
 * 图布局工具
 * 使用 elkjs 进行自动布局
 */
import ELK, { type ElkNode } from 'elkjs/lib/elk.bundled.js'
import type { AnoraGraph } from '@/base/runtime/graph'
import type { BaseNode } from '@/base/runtime/nodes'

const elk = new ELK()

/** 布局选项 */
export interface LayoutOptions {
  /** 布局方向 */
  direction?: 'RIGHT' | 'DOWN' | 'LEFT' | 'UP'
  /** 节点间距 */
  spacing?: number
  /** 是否对齐端口 */
  alignPorts?: boolean
}

/**
 * 使用 ELK 对图进行自动布局
 * @param graph Anora 图
 * @param nodePositions 当前节点位置映射
 * @param options 布局选项
 * @returns 更新后的节点位置映射
 */
export async function autoLayoutGraph(
  graph: AnoraGraph,
  nodePositions: Map<string, { x: number; y: number }>,
  options: LayoutOptions = {},
): Promise<Map<string, { x: number; y: number }>> {
  const { direction = 'RIGHT', spacing = 80, alignPorts = true } = options

  const nodes = graph.getAllNodes()
  if (nodes.length === 0) {
    return nodePositions
  }

  // 构建 ELK 图结构（包含端口信息）
  const elkNodes: ElkNode['children'] = nodes.map((node) => {
    const nodeHeight = calculateNodeHeight(node)
    const inputPorts = node.getInputPorts()
    const outputPorts = node.getOutputPorts()

    // 为每个端口创建 ELK 端口定义
    const ports = [
      ...inputPorts.map((port, index) => ({
        id: port.id,
        width: 10,
        height: 10,
        x: 0, // 输入端口在左侧
        y: 40 + index * 24, // 垂直排列，从顶部开始
      })),
      ...outputPorts.map((port, index) => ({
        id: port.id,
        width: 10,
        height: 10,
        x: 240, // 输出端口在右侧（节点宽度）
        y: 40 + index * 24, // 垂直排列，从顶部开始
      })),
    ]

    return {
      id: node.id,
      width: 240,
      height: nodeHeight,
      ports,
    }
  })

  const elkEdges = graph
    .getAllEdges()
    .map((edge) => {
      const sourceNodeId = graph.getNodeByPortId(edge.fromPortId)?.id
      const targetNodeId = graph.getNodeByPortId(edge.toPortId)?.id

      if (!sourceNodeId || !targetNodeId) {
        return null
      }

      return {
        id: `${edge.fromPortId}->${edge.toPortId}`,
        sources: [edge.fromPortId], // 直接使用端口 ID
        targets: [edge.toPortId], // 直接使用端口 ID
      }
    })
    .filter((edge): edge is NonNullable<typeof edge> => edge !== null)

  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered', // 分层布局，适合 DAG
      'elk.direction': direction, // 布局方向
      'elk.spacing.nodeNode': spacing.toString(), // 同层节点间距
      'elk.layered.spacing.nodeNodeBetweenLayers': (spacing * 2).toString(), // 层间距（增大以显示边）
      'elk.layered.spacing.edgeNodeBetweenLayers': '40', // 边与节点间的最小距离
      'elk.spacing.edgeEdge': '20', // 边与边之间的间距
      'elk.spacing.edgeNode': '30', // 边与节点之间的间距
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX', // 节点放置策略
      'elk.layered.thoroughness': '10', // 提高布局质量（默认7）
      ...(alignPorts
        ? {
            'elk.portConstraints': 'FIXED_SIDE', // 端口固定在侧边
            'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP', // 减少边交叉
            'elk.layered.crossingMinimization.semiInteractive': 'true', // 优化边交叉
          }
        : {}),
    },
    children: elkNodes,
    edges: elkEdges,
  }

  // 执行布局
  const layoutedGraph = await elk.layout(elkGraph)

  // 提取布局结果
  const newPositions = new Map<string, { x: number; y: number }>()

  if (layoutedGraph.children) {
    for (const node of layoutedGraph.children) {
      if (node.x !== undefined && node.y !== undefined) {
        newPositions.set(node.id, { x: node.x, y: node.y })
      }
    }
  }

  return newPositions
}

/**
 * 根据节点的端口数量计算节点高度
 */
function calculateNodeHeight(node: BaseNode): number {
  const baseHeight = 80 // 基础高度（标题 + 内边距）
  const portHeight = 24 // 每个端口的高度

  const inPorts = node.getInputPorts().length
  const outPorts = node.getOutputPorts().length
  const maxPorts = Math.max(inPorts, outPorts)

  return baseHeight + maxPorts * portHeight
}
