/**
 * DemoPlayer - Plays back recorded demo operations with carousel-style controls
 */

import type { DemoRecording, AnyDemoOperation, DemoPlayerState, DemoControlCommand } from './types'

export type DemoPlayerCallback = (operation: AnyDemoOperation) => void | Promise<void>

export interface DemoPlayerOptions {
  /** Callback invoked when each operation is applied */
  onOperation?: DemoPlayerCallback
  /** Callback invoked when player state changes */
  onStateChange?: (state: DemoPlayerState) => void
  /** Callback invoked when current step changes */
  onStepChange?: (stepIndex: number, totalSteps: number) => void
  /** Auto-play delay between steps in milliseconds */
  autoPlayDelay?: number
}

export class DemoPlayer {
  private recording: DemoRecording | null = null
  private currentStepIndex = -1
  private state: DemoPlayerState = 'idle' as DemoPlayerState.IDLE
  private options: Required<DemoPlayerOptions>
  private autoPlayTimer: number | null = null

  constructor(options: DemoPlayerOptions = {}) {
    this.options = {
      onOperation: options.onOperation || (() => {}),
      onStateChange: options.onStateChange || (() => {}),
      onStepChange: options.onStepChange || (() => {}),
      autoPlayDelay: options.autoPlayDelay || 1000,
    }
  }

  /**
   * Load a recording for playback
   */
  loadRecording(recording: DemoRecording): void {
    this.recording = recording
    this.currentStepIndex = -1
    this.setState('idle' as DemoPlayerState.IDLE)
    this.emitStepChange()
  }

  /**
   * Get current state
   */
  getState(): DemoPlayerState {
    return this.state
  }

  /**
   * Get current step index
   */
  getCurrentStep(): number {
    return this.currentStepIndex
  }

  /**
   * Get total number of steps
   */
  getTotalSteps(): number {
    return this.recording?.operations.length || 0
  }

  /**
   * Execute a control command
   */
  async executeCommand(command: DemoControlCommand, payload?: unknown): Promise<void> {
    switch (command) {
      case 'play' as DemoControlCommand.PLAY:
        await this.play()
        break
      case 'pause' as DemoControlCommand.PAUSE:
        this.pause()
        break
      case 'stop' as DemoControlCommand.STOP:
        this.stop()
        break
      case 'next' as DemoControlCommand.NEXT:
        await this.next()
        break
      case 'previous' as DemoControlCommand.PREVIOUS:
        await this.previous()
        break
      case 'goto' as DemoControlCommand.GOTO:
        if (typeof payload === 'number') {
          await this.goto(payload)
        }
        break
    }
  }

  /**
   * Start auto-play from current position
   */
  async play(): Promise<void> {
    if (!this.recording || this.state === ('playing' as DemoPlayerState.PLAYING)) return

    this.setState('playing' as DemoPlayerState.PLAYING)

    // If at end, restart from beginning
    if (this.currentStepIndex >= this.getTotalSteps() - 1) {
      this.currentStepIndex = -1
    }

    await this.autoPlay()
  }

  /**
   * Pause auto-play
   */
  pause(): void {
    if (this.autoPlayTimer !== null) {
      clearTimeout(this.autoPlayTimer)
      this.autoPlayTimer = null
    }
    this.setState('paused' as DemoPlayerState.PAUSED)
  }

  /**
   * Stop and reset to beginning
   */
  stop(): void {
    if (this.autoPlayTimer !== null) {
      clearTimeout(this.autoPlayTimer)
      this.autoPlayTimer = null
    }
    this.currentStepIndex = -1
    this.setState('idle' as DemoPlayerState.IDLE)
    this.emitStepChange()
  }

  /**
   * Go to next step
   */
  async next(): Promise<void> {
    if (!this.recording) return

    const wasPlaying = this.state === ('playing' as DemoPlayerState.PLAYING)
    if (wasPlaying) {
      this.pause()
    }

    if (this.currentStepIndex < this.getTotalSteps() - 1) {
      await this.applyOperation(this.currentStepIndex + 1)
    }

    if (wasPlaying && this.currentStepIndex < this.getTotalSteps() - 1) {
      await this.play()
    }
  }

  /**
   * Go to previous step
   */
  async previous(): Promise<void> {
    if (!this.recording) return

    const wasPlaying = this.state === ('playing' as DemoPlayerState.PLAYING)
    if (wasPlaying) {
      this.pause()
    }

    if (this.currentStepIndex > 0) {
      // For simplicity, replay from start to target step
      await this.goto(this.currentStepIndex - 1)
    }

    if (wasPlaying && this.currentStepIndex > 0) {
      await this.play()
    }
  }

  /**
   * Go to specific step
   */
  async goto(stepIndex: number): Promise<void> {
    if (!this.recording) return

    const wasPlaying = this.state === ('playing' as DemoPlayerState.PLAYING)
    if (wasPlaying) {
      this.pause()
    }

    const targetIndex = Math.max(0, Math.min(stepIndex, this.getTotalSteps() - 1))

    // Simple approach: replay from start to target
    // More sophisticated approach would track reverse operations
    this.currentStepIndex = -1

    for (let i = 0; i <= targetIndex; i++) {
      await this.applyOperation(i)
    }

    if (wasPlaying) {
      await this.play()
    }
  }

  /**
   * Auto-play loop
   */
  private async autoPlay(): Promise<void> {
    if (
      this.state !== ('playing' as DemoPlayerState.PLAYING) ||
      !this.recording ||
      this.currentStepIndex >= this.getTotalSteps() - 1
    ) {
      if (this.currentStepIndex >= this.getTotalSteps() - 1) {
        this.setState('idle' as DemoPlayerState.IDLE)
      }
      return
    }

    await this.applyOperation(this.currentStepIndex + 1)

    this.autoPlayTimer = window.setTimeout(() => {
      this.autoPlay()
    }, this.options.autoPlayDelay)
  }

  /**
   * Apply a specific operation
   */
  private async applyOperation(stepIndex: number): Promise<void> {
    if (!this.recording || stepIndex < 0 || stepIndex >= this.getTotalSteps()) return

    const operation = this.recording.operations[stepIndex]
    if (!operation) return

    this.currentStepIndex = stepIndex

    try {
      await this.options.onOperation(operation)
    } catch (error) {
      console.error('Error applying operation:', error)
    }

    this.emitStepChange()
  }

  /**
   * Set player state and notify
   */
  private setState(state: DemoPlayerState): void {
    if (this.state !== state) {
      this.state = state
      this.options.onStateChange(state)
    }
  }

  /**
   * Emit step change event
   */
  private emitStepChange(): void {
    this.options.onStepChange(this.currentStepIndex, this.getTotalSteps())
  }
}
