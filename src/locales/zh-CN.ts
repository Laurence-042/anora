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
    startRecording: '开始录制',
    stopRecording: '停止录制',
    loadRecording: '加载录制',
    export: '导出',
    step: '步骤',
    // 快捷键
    shortcutPlayPause: '播放/暂停',
    shortcutPrev: '上一步',
    shortcutNext: '下一步',
    // IPC
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
    base: {
      subGraph: '子图',
      subGraphEntry: '子图入口',
      subGraphExit: '子图出口',
    },
    core: {
      forward: '中继',
      parameter: '参数',
      distribute: '分发',
      aggregate: '聚合',
      compare: '比较',
      branch: '分支',
      logic: '逻辑运算',
      arithmetic: '算术运算',
      stringFormat: '字符串格式化',
      consoleLog: '控制台输出',
      notify: '通知',
      objectAccess: '对象取值',
      objectSet: '对象设值',
      arrayAccess: '数组取值',
      arrayPush: '数组追加',
      arrayLength: '数组长度',
    },
    godotWry: {
      wryIpc: 'WRY IPC',
    },
  },

  // 节点分类
  nodeCategories: {
    base: '基础',
    core: '核心',
    logic: '逻辑',
    math: '运算',
    string: '字符串',
    io: '输入输出',
    data: '数据结构',
    backend: '后端',
    other: '其他',
  },

  // Mod 名称
  mods: {
    base: '基础模块',
    core: '核心模块',
    godotWry: 'Godot WRY',
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
