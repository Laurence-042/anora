/**
 * DemoRecorder - Records graph operations and node states for demo playback
 */

import type {
  AnyDemoOperation,
  DemoRecording,
  IterationOperation,
  NodeAddedOperation,
  NodeRemovedOperation,
  EdgeAddedOperation,
  EdgeRemovedOperation,
  NodeMovedOperation,
  SerializedNodeState,
  DemoOperationType,
} from './types'
import type { BaseNode } from '../nodes/BaseNode'

export class DemoRecorder {
  private operations: AnyDemoOperation[] = []
  private stepCounter = 0
  private isRecording = false

  /**
   * Start recording
   */
  startRecording(): void {
    this.isRecording = true
    this.operations = []
    this.stepCounter = 0
  }

  /**
   * Stop recording
   */
  stopRecording(): void {
    this.isRecording = false
  }

  /**
   * Check if currently recording
   */
  isActive(): boolean {
    return this.isRecording
  }

  /**
   * Record an iteration with node states
   */
  recordIteration(nodes: BaseNode[], activatedNodeIds: string[]): void {
    if (!this.isRecording) return

    const nodeStates: SerializedNodeState[] = nodes.map((node) => ({
      nodeId: node.id,
      outPorts: this.serializeNodeOutPorts(node),
      status: 'success', // TODO: track actual execution status
    }))

    const operation: IterationOperation = {
      type: 'iteration' as DemoOperationType.ITERATION,
      stepIndex: this.stepCounter++,
      nodeStates,
      activatedNodeIds,
    }

    this.operations.push(operation)
  }

  /**
   * Record node addition
   */
  recordNodeAdded(
    nodeId: string,
    nodeType: string,
    position: { x: number; y: number },
    context?: unknown,
  ): void {
    if (!this.isRecording) return

    const operation: NodeAddedOperation = {
      type: 'node_added' as DemoOperationType.NODE_ADDED,
      stepIndex: this.stepCounter++,
      nodeId,
      nodeType,
      position,
      context,
    }

    this.operations.push(operation)
  }

  /**
   * Record node removal
   */
  recordNodeRemoved(nodeId: string): void {
    if (!this.isRecording) return

    const operation: NodeRemovedOperation = {
      type: 'node_removed' as DemoOperationType.NODE_REMOVED,
      stepIndex: this.stepCounter++,
      nodeId,
    }

    this.operations.push(operation)
  }

  /**
   * Record edge addition
   */
  recordEdgeAdded(
    fromNodeId: string,
    fromPortName: string,
    toNodeId: string,
    toPortName: string,
  ): void {
    if (!this.isRecording) return

    const operation: EdgeAddedOperation = {
      type: 'edge_added' as DemoOperationType.EDGE_ADDED,
      stepIndex: this.stepCounter++,
      fromNodeId,
      fromPortName,
      toNodeId,
      toPortName,
    }

    this.operations.push(operation)
  }

  /**
   * Record edge removal
   */
  recordEdgeRemoved(
    fromNodeId: string,
    fromPortName: string,
    toNodeId: string,
    toPortName: string,
  ): void {
    if (!this.isRecording) return

    const operation: EdgeRemovedOperation = {
      type: 'edge_removed' as DemoOperationType.EDGE_REMOVED,
      stepIndex: this.stepCounter++,
      fromNodeId,
      fromPortName,
      toNodeId,
      toPortName,
    }

    this.operations.push(operation)
  }

  /**
   * Record node movement
   */
  recordNodeMoved(nodeId: string, position: { x: number; y: number }): void {
    if (!this.isRecording) return

    const operation: NodeMovedOperation = {
      type: 'node_moved' as DemoOperationType.NODE_MOVED,
      stepIndex: this.stepCounter++,
      nodeId,
      position,
    }

    this.operations.push(operation)
  }

  /**
   * Export recording
   */
  exportRecording(metadata?: { title?: string; description?: string }): DemoRecording {
    return {
      version: '1.0.0',
      operations: [...this.operations],
      metadata: {
        ...metadata,
        createdAt: new Date().toISOString(),
      },
    }
  }

  /**
   * Clear all recorded operations
   */
  clear(): void {
    this.operations = []
    this.stepCounter = 0
  }

  /**
   * Get the number of recorded operations
   */
  getOperationCount(): number {
    return this.operations.length
  }

  /**
   * Serialize node's output ports
   */
  private serializeNodeOutPorts(node: BaseNode): { [portName: string]: unknown } {
    const result: { [portName: string]: unknown } = {}

    for (const [portName, port] of node.outPorts.entries()) {
      try {
        result[portName] = port.serialize()
      } catch {
        result[portName] = null
      }
    }

    return result
  }
}
