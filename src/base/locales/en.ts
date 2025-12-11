/**
 * Base module - English language pack
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
    shortcutPlayPause: 'Play/Pause',
    shortcutPrev: 'Previous Step',
    shortcutNext: 'Next Step',
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

  // Base nodes
  nodes: {
    'base.SubGraphNode': 'SubGraph',
    'base.SubGraphEntryNode': 'SubGraph Entry',
    'base.SubGraphExitNode': 'SubGraph Exit',
  },

  // Node categories
  nodeCategories: {
    base: 'Base',
    other: 'Other',
  },

  // Mod names
  mods: {
    base: 'Base Module',
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
