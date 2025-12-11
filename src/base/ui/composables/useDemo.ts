/**
 * Composable for managing demo mode
 */

import { ref, computed } from 'vue'
import {
  DemoRecorder,
  DemoPlayer,
  type DemoRecording,
  type AnyDemoOperation,
} from '@/base/runtime/demo'
import type { DemoPlayerState, DemoControlCommand } from '@/base/runtime/demo'

export interface UseDemoOptions {
  /** Callback when an operation should be applied to the graph */
  onApplyOperation?: (operation: AnyDemoOperation) => void | Promise<void>
  /** Auto-play delay in milliseconds */
  autoPlayDelay?: number
}

export function useDemo(options: UseDemoOptions = {}) {
  const recorder = new DemoRecorder()
  const player = new DemoPlayer({
    onOperation: options.onApplyOperation,
    onStateChange: (state) => {
      playerState.value = state
    },
    onStepChange: (step, total) => {
      currentStep.value = step
      totalSteps.value = total
    },
    autoPlayDelay: options.autoPlayDelay,
  })

  // Recording state
  const isRecording = ref(false)

  // Playback state
  const playerState = ref<DemoPlayerState>('idle' as DemoPlayerState.IDLE)
  const currentStep = ref(-1)
  const totalSteps = ref(0)
  const hasRecording = ref(false)

  // Computed states
  const isPlaying = computed(() => playerState.value === ('playing' as DemoPlayerState.PLAYING))
  const isPaused = computed(() => playerState.value === ('paused' as DemoPlayerState.PAUSED))
  const isIdle = computed(() => playerState.value === ('idle' as DemoPlayerState.IDLE))
  const canGoNext = computed(() => currentStep.value < totalSteps.value - 1)
  const canGoPrevious = computed(() => currentStep.value > 0)

  // Recording controls
  function startRecording() {
    recorder.startRecording()
    isRecording.value = true
  }

  function stopRecording() {
    recorder.stopRecording()
    isRecording.value = false
  }

  function exportRecording(metadata?: { title?: string; description?: string }): DemoRecording {
    return recorder.exportRecording(metadata)
  }

  function clearRecording() {
    recorder.clear()
    hasRecording.value = false
  }

  // Playback controls
  function loadRecording(recording: DemoRecording) {
    player.loadRecording(recording)
    hasRecording.value = true
  }

  async function play() {
    await player.play()
  }

  function pause() {
    player.pause()
  }

  function stop() {
    player.stop()
  }

  async function next() {
    await player.next()
  }

  async function previous() {
    await player.previous()
  }

  async function goto(stepIndex: number) {
    await player.goto(stepIndex)
  }

  async function executeCommand(command: DemoControlCommand, payload?: unknown) {
    await player.executeCommand(command, payload)
  }

  // Export recording to JSON file
  function downloadRecording(filename: string = 'demo-recording.json') {
    const recording = exportRecording()
    const blob = new Blob([JSON.stringify(recording, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  // Import recording from JSON file
  function uploadRecording(file: File): Promise<void> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const recording = JSON.parse(e.target?.result as string) as DemoRecording
          loadRecording(recording)
          resolve()
        } catch (error) {
          reject(error)
        }
      }
      reader.onerror = reject
      reader.readAsText(file)
    })
  }

  // Import recording from parsed data
  function importRecording(data: DemoRecording): void {
    loadRecording(data)
  }

  return {
    // Recorder
    recorder,
    isRecording,
    startRecording,
    stopRecording,
    exportRecording,
    clearRecording,
    downloadRecording,
    uploadRecording,

    // Player
    player,
    playerState,
    currentStep,
    totalSteps,
    hasRecording,
    isPlaying,
    isPaused,
    isIdle,
    canGoNext,
    canGoPrevious,
    loadRecording,
    importRecording,
    play,
    pause,
    stop,
    next,
    previous,
    goto,
    executeCommand,
  }
}
