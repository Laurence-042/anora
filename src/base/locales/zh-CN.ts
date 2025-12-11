/**
 * Base module - Chinese language pack
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
    startRecording: '开始录制',
    stopRecording: '停止录制',
    loadRecording: '加载录制',
    export: '导出',
    step: '步骤',
    shortcutPlayPause: '播放/暂停',
    shortcutPrev: '上一步',
    shortcutNext: '下一步',
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

  // Base 节点 - i18n key: nodes.{mod}.{NodeName}
  nodes: {
    base: {
      SubGraphNode: '子图',
      SubGraphEntryNode: '子图入口',
      SubGraphExitNode: '子图出口',
    },
  },

  // 节点分类
  nodeCategories: {
    base: '基础',
    other: '其他',
  },

  // Mod 名称
  mods: {
    base: '基础模块',
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
