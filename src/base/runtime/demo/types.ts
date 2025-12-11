/**
 * Demo mode types for recording and replaying graph operations
 */

/**
 * Types of operations that can be recorded
 */
export enum DemoOperationType {
  /** Executor completed an iteration */
  ITERATION = 'iteration',
  /** Node was added to the graph */
  NODE_ADDED = 'node_added',
  /** Node was removed from the graph */
  NODE_REMOVED = 'node_removed',
  /** Edge was added to the graph */
  EDGE_ADDED = 'edge_added',
  /** Edge was removed from the graph */
  EDGE_REMOVED = 'edge_removed',
  /** Node position changed */
  NODE_MOVED = 'node_moved',
}

/**
 * Serialized node state after execution
 */
export interface SerializedNodeState {
  nodeId: string
  /** Port values after execution */
  outPorts: { [portName: string]: unknown }
  /** Execution status */
  status: 'success' | 'error' | 'not_executed'
  /** Error message if failed */
  error?: string
}

/**
 * Base operation interface
 */
export interface DemoOperation {
  type: DemoOperationType
  stepIndex: number
}

/**
 * Iteration operation - records node states after execution
 */
export interface IterationOperation extends DemoOperation {
  type: DemoOperationType.ITERATION
  /** States of all nodes after this iteration */
  nodeStates: SerializedNodeState[]
  /** Nodes that were activated in this iteration */
  activatedNodeIds: string[]
}

/**
 * Node addition operation
 */
export interface NodeAddedOperation extends DemoOperation {
  type: DemoOperationType.NODE_ADDED
  nodeId: string
  nodeType: string
  position: { x: number; y: number }
  context?: unknown
}

/**
 * Node removal operation
 */
export interface NodeRemovedOperation extends DemoOperation {
  type: DemoOperationType.NODE_REMOVED
  nodeId: string
}

/**
 * Edge addition operation
 */
export interface EdgeAddedOperation extends DemoOperation {
  type: DemoOperationType.EDGE_ADDED
  fromNodeId: string
  fromPortName: string
  toNodeId: string
  toPortName: string
}

/**
 * Edge removal operation
 */
export interface EdgeRemovedOperation extends DemoOperation {
  type: DemoOperationType.EDGE_REMOVED
  fromNodeId: string
  fromPortName: string
  toNodeId: string
  toPortName: string
}

/**
 * Node movement operation
 */
export interface NodeMovedOperation extends DemoOperation {
  type: DemoOperationType.NODE_MOVED
  nodeId: string
  position: { x: number; y: number }
}

/**
 * Union type of all operations
 */
export type AnyDemoOperation =
  | IterationOperation
  | NodeAddedOperation
  | NodeRemovedOperation
  | EdgeAddedOperation
  | EdgeRemovedOperation
  | NodeMovedOperation

/**
 * Complete demo recording
 */
export interface DemoRecording {
  version: string
  operations: AnyDemoOperation[]
  metadata?: {
    title?: string
    description?: string
    createdAt?: string
    [key: string]: unknown
  }
}

/**
 * Demo player state
 */
export enum DemoPlayerState {
  IDLE = 'idle',
  PLAYING = 'playing',
  PAUSED = 'paused',
}

/**
 * Demo player control commands
 */
export enum DemoControlCommand {
  PLAY = 'play',
  PAUSE = 'pause',
  STOP = 'stop',
  NEXT = 'next',
  PREVIOUS = 'previous',
  GOTO = 'goto',
}
