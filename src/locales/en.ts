/**
 * English language pack
 */
export default {
  // Common
  common: {
    confirm: 'Confirm',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    edit: 'Edit',
    add: 'Add',
    remove: 'Remove',
    clear: 'Clear',
    close: 'Close',
    loading: 'Loading...',
    success: 'Success',
    error: 'Error',
    warning: 'Warning',
    info: 'Info',
  },

  // Editor
  editor: {
    title: 'Graph Editor',
    layout: 'Layout',
    autoLayout: 'Auto Layout',
    fitView: 'Fit View',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    nodes: 'Nodes',
    selected: 'Selected',
    level: 'Level',
  },

  // Executor
  executor: {
    run: 'Run',
    stop: 'Stop',
    pause: 'Pause',
    resume: 'Resume',
    running: 'Running',
    idle: 'Idle',
    completed: 'Completed',
    cancelled: 'Cancelled',
    error: 'Execution Error',
    iteration: 'Iteration',
    delay: 'Delay (ms)',
  },

  // Demo mode
  demo: {
    title: 'Demo Mode',
    recording: 'Recording',
    startRecording: 'Start Recording',
    stopRecording: 'Stop Recording',
    loadRecording: 'Load Recording',
    export: 'Export',
    step: 'Step',
    // Shortcuts
    shortcutPlayPause: 'Play/Pause',
    shortcutPrev: 'Previous Step',
    shortcutNext: 'Next Step',
    // IPC
    ipcInfo: 'External control via post_message',
  },

  // Node palette
  nodePalette: {
    title: 'Nodes',
    search: 'Search nodes...',
    noResults: 'No matching nodes found',
    dragToAdd: 'Drag to add node',
    categories: {
      all: 'All',
      data: 'Data',
      logic: 'Logic',
      control: 'Control',
      io: 'I/O',
      backend: 'Backend',
    },
  },

  // Node types
  nodes: {
    base: {
      subGraph: 'SubGraph',
      subGraphEntry: 'SubGraph Entry',
      subGraphExit: 'SubGraph Exit',
    },
    core: {
      forward: 'Forward',
      parameter: 'Parameter',
      distribute: 'Distribute',
      aggregate: 'Aggregate',
      compare: 'Compare',
      branch: 'Branch',
      logic: 'Logic',
      arithmetic: 'Arithmetic',
      stringFormat: 'String Format',
      consoleLog: 'Console Log',
      notify: 'Notify',
      objectAccess: 'Object Access',
      objectSet: 'Object Set',
      arrayAccess: 'Array Access',
      arrayPush: 'Array Push',
      arrayLength: 'Array Length',
    },
    godotWry: {
      wryIpc: 'WRY IPC',
    },
  },

  // Node categories
  nodeCategories: {
    base: 'Base',
    core: 'Core',
    logic: 'Logic',
    math: 'Math',
    string: 'String',
    io: 'I/O',
    data: 'Data',
    backend: 'Backend',
    other: 'Other',
  },

  // Mod names
  mods: {
    base: 'Base Module',
    core: 'Core Module',
    godotWry: 'Godot WRY',
  },

  // Ports
  ports: {
    input: 'Input',
    output: 'Output',
    exec: 'Exec',
    control: 'Control',
  },

  // Breadcrumb
  breadcrumb: {
    root: 'Root',
    back: 'Go Back',
  },

  // Error messages
  errors: {
    nodeNotFound: 'Node not found',
    portNotFound: 'Port not found',
    incompatibleTypes: 'Incompatible types',
    connectionFailed: 'Connection failed',
    executionFailed: 'Execution failed',
    invalidOperation: 'Invalid operation',
  },
}
