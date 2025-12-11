/**
 * 中文语言包
 */
export default {
  // 通用
  common: {
    confirm: '确认',
    cancel: '取消',
    save: '保存',
    delete: '删除',
    edit: '编辑',
    add: '添加',
    remove: '移除',
    clear: '清除',
    close: '关闭',
    loading: '加载中...',
    success: '成功',
    error: '错误',
    warning: '警告',
    info: '提示',
  },

  // 编辑器
  editor: {
    title: '图编辑器',
    layout: '布局',
    autoLayout: '自动布局',
    fitView: '适应视图',
    zoomIn: '放大',
    zoomOut: '缩小',
    nodes: '节点',
    selected: '选中',
    level: '层级',
  },

  // 执行器
  executor: {
    run: '执行',
    stop: '停止',
    pause: '暂停',
    resume: '继续',
    running: '执行中',
    idle: '空闲',
    completed: '已完成',
    cancelled: '已取消',
    error: '执行错误',
    iteration: '迭代',
    delay: '延迟 (ms)',
  },

  // 演示模式
  demo: {
    title: '演示模式',
    recording: '录制中',
    playback: '回放',
    startRecording: '开始录制',
    stopRecording: '停止录制',
    loadRecording: '加载录制',
    export: '导出',
    clear: '清除',
    clearConfirm: '确定清除当前录制？此操作不可撤销。',
    play: '播放',
    pause: '暂停',
    stop: '停止',
    next: '下一步',
    previous: '上一步',
    step: '步骤',
    recordingIndicator: '录制中',
    modeTip: '演示模式 - 使用控制面板或快捷键操作',
    // 快捷键
    shortcuts: '快捷键',
    shortcutPlayPause: '播放/暂停',
    shortcutPrev: '上一步',
    shortcutNext: '下一步',
    shortcutExecute: '执行图',
    shortcutDelete: '删除节点',
    // IPC
    ipcTitle: 'Godot IPC',
    ipcInfo: '外部可通过 post_message 发送控制命令',
  },

  // 节点面板
  nodePalette: {
    title: '节点',
    search: '搜索节点...',
    noResults: '没有找到匹配的节点',
    dragToAdd: '拖拽添加节点',
    categories: {
      all: '全部',
      data: '数据',
      logic: '逻辑',
      control: '控制',
      io: '输入输出',
      backend: '后端',
    },
  },

  // 节点类型
  nodes: {
    forward: '中继',
    parameter: '参数',
    arithmetic: '算术运算',
    compare: '比较',
    branch: '分支',
    distribute: '分配',
    aggregate: '聚集',
    consoleLog: '控制台输出',
    stringFormat: '字符串格式化',
    wryIpc: 'WRY IPC',
    subGraph: '子图',
  },

  // 端口
  ports: {
    input: '输入',
    output: '输出',
    exec: '执行',
    control: '控制',
  },

  // 面包屑
  breadcrumb: {
    root: '根图',
    back: '返回上一级',
  },

  // 错误消息
  errors: {
    nodeNotFound: '节点未找到',
    portNotFound: '端口未找到',
    incompatibleTypes: '类型不兼容',
    connectionFailed: '连接失败',
    executionFailed: '执行失败',
    invalidOperation: '无效操作',
  },
}
