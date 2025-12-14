# ANORA Demo Mode

演示模式支持，用于录制执行过程并回放展示。

## 快速开始

### 录制

1. 在编辑器 (`/`) 中创建图并添加节点
2. 点击工具栏的 ⏺ 按钮开始录制
3. 点击 ▶ 执行图
4. 执行完成后点击 ⏹ 停止录制
5. 点击 💾 导出录制文件

### 回放

1. 访问 `/demo` 路由
2. 点击 📂 加载录制文件
3. 使用播放控制进行回放

## 架构设计

### 核心组件

```
src/base/runtime/demo/
├── types.ts           # 类型定义 (DemoRecording, SerializedExecutorEvent)
├── DemoRecorder.ts    # 录制器 - 监听 Executor 事件
├── ReplayExecutor.ts  # 回放执行器 - emit 相同事件
└── index.ts           # 导出

src/base/ui/
├── components/
│   └── AnoraGraphView.vue  # 纯展示组件，录制/回放共用
├── editor/
│   ├── GraphEditor.vue     # 编辑器，包含录制功能
│   └── RecordingControls.vue # 录制控制按钮
└── ...

src/views/
└── ReplayView.vue     # 独立回放页面
```

### 事件类型

录制的是 Executor 发出的标准事件（序列化版本）：

```typescript
type SerializedExecutorEvent =
  | { type: 'start' }
  | { type: 'iteration'; iteration: number }
  | { type: 'node-start'; nodeId: string }
  | { type: 'node-complete'; nodeId: string; success: boolean; error?: string }
  | { type: 'data-propagate'; transfers: Array<{ fromPortId; toPortId; data }> }
  | { type: 'complete'; result: { status; iterations; duration } }
  | { type: 'cancelled' }
  | { type: 'error'; error: string }
```

### 录制格式 (v2.0.0)

```typescript
interface DemoRecording {
  version: '2.0.0'
  initialGraph: SerializedGraph // 完整的图序列化数据
  nodePositions: Record<string, { x: number; y: number }>
  events: TimestampedEvent[] // 带时间戳的事件序列
  metadata?: {
    title?: string
    description?: string
    createdAt?: string
    iterationDelay?: number
  }
}
```

## 设计原则

### 录制与回放共用事件接口

`ReplayExecutor` 发出与 `BasicExecutor` 相同的事件，因此：

- `AnoraGraphView` 组件代码在两种模式下完全相同
- 节点高亮、数据传输动画等 UI 逻辑无需重复实现

### 回放完全独立

- 回放页面 (`/demo`) 不依赖 `graph.ts` store
- 录制文件包含完整的图和位置信息
- 可在任何时候、任何环境回放

### 录制不影响编辑器

- `RecordingControls` 直接管理 `DemoRecorder`
- `graph.ts` store 不知道录制的存在
- 开始/停止录制不会影响图的状态

## 回放控制

| 控制     | 功能                       |
| -------- | -------------------------- |
| ▶/⏸    | 播放/暂停                  |
| ⏭       | 单步前进                   |
| ⏮       | 重新开始                   |
| 进度条   | 跳转到指定位置             |
| 速度选择 | 0.5x / 1x / 1.5x / 2x / 4x |

## 文件示例

```json
{
  "version": "2.0.0",
  "initialGraph": {
    "nodes": [...],
    "edges": [...]
  },
  "nodePositions": {
    "node-1": { "x": 100, "y": 200 },
    "node-2": { "x": 350, "y": 200 }
  },
  "events": [
    { "timestamp": 0, "event": { "type": "start" } },
    { "timestamp": 5, "event": { "type": "iteration", "iteration": 1 } },
    { "timestamp": 10, "event": { "type": "node-start", "nodeId": "node-1" } },
    { "timestamp": 50, "event": { "type": "node-complete", "nodeId": "node-1", "success": true } },
    { "timestamp": 55, "event": { "type": "data-propagate", "transfers": [...] } },
    { "timestamp": 100, "event": { "type": "complete", "result": { "status": "completed", "iterations": 1, "duration": 100 } } }
  ],
  "metadata": {
    "createdAt": "2024-12-14T10:00:00.000Z"
  }
}
```
