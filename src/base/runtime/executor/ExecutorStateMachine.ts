/**
 * ExecutorStateMachine - 执行器状态机
 *
 * 管理执行器的状态转换，避免状态地狱
 *
 * 状态：
 * - Idle: 空闲，可以开始执行
 * - Running: 正在连续执行
 * - Paused: 已暂停（可单步、可恢复、可取消）
 *
 * 状态转换图：
 * ```
 *                    ┌─────────────────────┐
 *                    │                     │
 *                    ▼                     │
 *   ┌──────┐  start(continuous)  ┌─────────┴──┐
 *   │ Idle │ ──────────────────► │  Running   │
 *   └──┬───┘                     └─────┬──────┘
 *      │                               │
 *      │ start(step)            pause()│
 *      │                               │
 *      │         ┌─────────────────────┘
 *      │         │
 *      │         ▼
 *      │    ┌─────────┐
 *      └───►│ Paused  │◄────┐
 *           └────┬────┘     │
 *                │          │
 *                │ step()   │ step完成
 *                │          │
 *                ▼          │
 *           ┌─────────┐     │
 *           │Stepping │─────┘
 *           └─────────┘
 *
 * 任何状态 → cancel()/complete()/error() → Idle
 * ```
 */

/**
 * 执行器状态
 */
export enum ExecutorState {
  /** 空闲 */
  Idle = 'idle',
  /** 连续执行中 */
  Running = 'running',
  /** 已暂停 */
  Paused = 'paused',
  /** 单步执行中（正在执行一次迭代） */
  Stepping = 'stepping',
}

/**
 * 状态转换动作
 */
export type ExecutorAction =
  | { type: 'START'; stepMode: boolean }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'STEP' }
  | { type: 'STEP_COMPLETE' }
  | { type: 'CANCEL' }
  | { type: 'COMPLETE' }
  | { type: 'ERROR' }

/**
 * 状态转换结果
 */
export interface TransitionResult {
  /** 是否允许转换 */
  allowed: boolean
  /** 新状态（如果允许） */
  newState?: ExecutorState
  /** 拒绝原因（如果不允许） */
  reason?: string
}

/**
 * 状态变化监听器
 */
export type StateChangeListener = (oldState: ExecutorState, newState: ExecutorState) => void

/**
 * 执行器状态机
 */
export class ExecutorStateMachine {
  private _state: ExecutorState = ExecutorState.Idle
  private listeners: Set<StateChangeListener> = new Set()

  /**
   * 获取当前状态
   */
  get state(): ExecutorState {
    return this._state
  }

  /**
   * 是否空闲
   */
  get isIdle(): boolean {
    return this._state === ExecutorState.Idle
  }

  /**
   * 是否正在运行（Running 或 Stepping）
   */
  get isRunning(): boolean {
    return this._state === ExecutorState.Running || this._state === ExecutorState.Stepping
  }

  /**
   * 是否已暂停
   */
  get isPaused(): boolean {
    return this._state === ExecutorState.Paused
  }

  /**
   * 是否正在单步执行
   */
  get isStepping(): boolean {
    return this._state === ExecutorState.Stepping
  }

  /**
   * 是否可以执行（Running 或 Stepping 状态）
   */
  get canExecute(): boolean {
    return this._state === ExecutorState.Running || this._state === ExecutorState.Stepping
  }

  /**
   * 添加状态变化监听器
   */
  onStateChange(listener: StateChangeListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * 尝试执行状态转换
   */
  transition(action: ExecutorAction): TransitionResult {
    const result = this.getTransitionResult(action)

    if (result.allowed && result.newState !== undefined) {
      const oldState = this._state
      this._state = result.newState
      this.notifyStateChange(oldState, result.newState)
    }

    return result
  }

  /**
   * 计算状态转换结果（不实际执行）
   */
  private getTransitionResult(action: ExecutorAction): TransitionResult {
    switch (this._state) {
      case ExecutorState.Idle:
        return this.transitionFromIdle(action)
      case ExecutorState.Running:
        return this.transitionFromRunning(action)
      case ExecutorState.Paused:
        return this.transitionFromPaused(action)
      case ExecutorState.Stepping:
        return this.transitionFromStepping(action)
      default:
        return { allowed: false, reason: `Unknown state: ${this._state}` }
    }
  }

  private transitionFromIdle(action: ExecutorAction): TransitionResult {
    switch (action.type) {
      case 'START':
        return {
          allowed: true,
          newState: action.stepMode ? ExecutorState.Paused : ExecutorState.Running,
        }
      default:
        return { allowed: false, reason: `Cannot ${action.type} from Idle state` }
    }
  }

  private transitionFromRunning(action: ExecutorAction): TransitionResult {
    switch (action.type) {
      case 'PAUSE':
        return { allowed: true, newState: ExecutorState.Paused }
      case 'CANCEL':
      case 'COMPLETE':
      case 'ERROR':
        return { allowed: true, newState: ExecutorState.Idle }
      default:
        return { allowed: false, reason: `Cannot ${action.type} from Running state` }
    }
  }

  private transitionFromPaused(action: ExecutorAction): TransitionResult {
    switch (action.type) {
      case 'RESUME':
        return { allowed: true, newState: ExecutorState.Running }
      case 'STEP':
        return { allowed: true, newState: ExecutorState.Stepping }
      case 'CANCEL':
      case 'COMPLETE':
      case 'ERROR':
        return { allowed: true, newState: ExecutorState.Idle }
      default:
        return { allowed: false, reason: `Cannot ${action.type} from Paused state` }
    }
  }

  private transitionFromStepping(action: ExecutorAction): TransitionResult {
    switch (action.type) {
      case 'STEP_COMPLETE':
        return { allowed: true, newState: ExecutorState.Paused }
      case 'CANCEL':
      case 'COMPLETE':
      case 'ERROR':
        return { allowed: true, newState: ExecutorState.Idle }
      default:
        return { allowed: false, reason: `Cannot ${action.type} from Stepping state` }
    }
  }

  private notifyStateChange(oldState: ExecutorState, newState: ExecutorState): void {
    for (const listener of this.listeners) {
      try {
        listener(oldState, newState)
      } catch (e) {
        console.error('State change listener error:', e)
      }
    }
  }

  /**
   * 重置到空闲状态
   */
  reset(): void {
    const oldState = this._state
    this._state = ExecutorState.Idle
    if (oldState !== ExecutorState.Idle) {
      this.notifyStateChange(oldState, ExecutorState.Idle)
    }
  }
}
