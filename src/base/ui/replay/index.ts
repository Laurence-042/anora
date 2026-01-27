/**
 * Replay Module - 回放功能模块
 *
 * 提供 Demo 录制、回放执行和控制功能
 */

// Types
export * from './types'

// Core classes
export { DemoRecorder } from './DemoRecorder'
export { ReplayExecutor, ReplayState, ReplayEventType } from './ReplayExecutor'
export type { ReplayEvent, ReplayEventListener } from './ReplayExecutor'
export { ReplayController } from './ReplayController'
export type { Keyframe } from './ReplayController'

// Event handling
export { EventHandlerRegistry, registerReplayHandler } from './EventHandlerRegistry'
export { registerCoreEventHandlers, executeEditCommand, undoEditCommand } from './CoreEventHandlers'
