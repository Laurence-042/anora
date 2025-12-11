/**
 * Core mod - Chinese language pack
 */
export default {
  // Core 节点
  nodes: {
    'core.ForwardNode': '中继',
    'core.ParameterNode': '参数',
    'core.DistributeNode': '分发',
    'core.AggregateNode': '聚合',
    'core.CompareNode': '比较',
    'core.BranchNode': '分支',
    'core.LogicNode': '逻辑运算',
    'core.ArithmeticNode': '算术运算',
    'core.StringFormatNode': '字符串格式化',
    'core.ConsoleLogNode': '控制台输出',
    'core.NotifyNode': '通知',
    'core.ObjectAccessNode': '对象取值',
    'core.ObjectSetNode': '对象设值',
    'core.ArrayAccessNode': '数组取值',
    'core.ArrayPushNode': '数组追加',
    'core.ArrayLengthNode': '数组长度',
  },

  // 节点分类
  nodeCategories: {
    core: '核心',
    logic: '逻辑',
    math: '运算',
    string: '字符串',
    io: '输入输出',
    data: '数据结构',
  },

  // Mod 名称
  mods: {
    core: '核心模块',
  },
}
