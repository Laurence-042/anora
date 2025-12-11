# ANORA Demo Mode

演示模式支持，用于录制和回放图操作与节点状态。

## 快速开始

访问 `/demo` 路由即可使用演示模式页面，该页面提供完整的录制和回放功能。

```
http://localhost:5173/demo
```

## 功能概述

演示模式提供以下功能：

1. **录制功能**
   - 迭代执行后的节点状态
   - 节点的增删操作
   - 边的增删操作
   - 节点位置变化

2. **回放功能**
   - Carousel 风格的前进/后退控制
   - 自动播放模式
   - 跳转到特定步骤
   - 进度显示

3. **导入导出**
   - 导出录制结果为 JSON 文件
   - 导入已有的录制文件

4. **外部控制**
   - 通过 IPC 从 Godot 控制演示回放
   - 实时状态同步

## 架构设计

### 核心组件

```
src/base/runtime/demo/
├── types.ts           # 类型定义
├── DemoRecorder.ts    # 录制器
├── DemoPlayer.ts      # 播放器
└── index.ts           # 导出

src/base/ui/composables/
├── useDemo.ts         # Vue 组合式函数
└── useDemoIPC.ts      # IPC 控制

src/base/ui/editor/
└── DemoControls.vue   # 控制面板组件
```

### 操作类型

```typescript
enum DemoOperationType {
  ITERATION = 'iteration',      // 执行迭代
  NODE_ADDED = 'node_added',    // 添加节点
  NODE_REMOVED = 'node_removed', // 删除节点
  EDGE_ADDED = 'edge_added',    // 添加边
  EDGE_REMOVED = 'edge_removed', // 删除边
  NODE_MOVED = 'node_moved',    // 移动节点
}
```

### 录制格式

```typescript
interface DemoRecording {
  version: string
  operations: AnyDemoOperation[]
  metadata?: {
    title?: string
    description?: string
    createdAt?: string
  }
}
```

## 使用方法

演示模式页面 (`/demo`) 已集成所有功能，可直接使用。

### 页面功能

- **左侧面板**：演示控制（录制/回放/导入导出）
- **右侧画布**：图编辑器
- **快捷键**：
  - `Space` - 播放/暂停
  - `←` / `→` - 上一步/下一步  
  - `F5` - 执行图
  - `Delete` - 删除节点

### 录制流程

1. 点击 "Start Recording" 开始录制
2. 在画布上进行操作（添加节点、连线、执行等）
3. 点击 "Stop Recording" 停止录制
4. 点击 "Export" 导出录制文件

### 回放流程

1. 点击 "Load Recording" 导入录制文件
2. 使用播放控制或快捷键进行回放
3. 点击 "Clear" 清除录制并返回编辑模式

## Godot-wry 集成

### JavaScript 端

```typescript
import { setupDemoIPC } from '@/base/ui/composables'

// 设置 IPC 监听
const cleanup = setupDemoIPC({
  executeCommand: demo.executeCommand,
  getState: () => ({
    isPlaying: demo.isPlaying.value,
    currentStep: demo.currentStep.value,
    totalSteps: demo.totalSteps.value,
  }),
})

// 清理
onUnmounted(() => {
  cleanup()
})
```

### Godot 端

```gdscript
extends Control

@onready var webview = $WebView

func _ready():
    webview.connect("ipc_message", self, "_on_ipc_message")
    # 加载 ANORA 应用
    webview.load_url("http://localhost:5173")

func _on_ipc_message(message):
    var data = JSON.parse_string(message)
    if data.type == "demo_response":
        print("Demo at step: %d / %d" % [data.state.currentStep + 1, data.state.totalSteps])
        update_ui(data.state)

func _input(event):
    if event is InputEventKey and event.pressed:
        match event.keycode:
            KEY_SPACE:
                advance_demo()
            KEY_LEFT:
                retreat_demo()
            KEY_P:
                toggle_play()

func advance_demo():
    send_demo_command("next")

func retreat_demo():
    send_demo_command("previous")

func toggle_play():
    if is_playing:
        send_demo_command("pause")
    else:
        send_demo_command("play")

func goto_step(step: int):
    send_demo_command("goto", step)

func send_demo_command(command: String, payload = null):
    var message = {
        "action": "demo_control",
        "command": command
    }
    if payload != null:
        message["payload"] = payload
    webview.post_message(JSON.stringify(message))
```

## 控制命令

| Command | 说明 | Payload |
|---------|------|---------|
| `play` | 开始自动播放 | 无 |
| `pause` | 暂停播放 | 无 |
| `stop` | 停止并重置到开始 | 无 |
| `next` | 前进一步 | 无 |
| `previous` | 后退一步 | 无 |
| `goto` | 跳转到指定步骤 | `number` (步骤索引) |

## 录制文件格式

```json
{
  "version": "1.0.0",
  "metadata": {
    "title": "Demo Recording",
    "description": "Example demonstration",
    "createdAt": "2025-12-11T10:30:00.000Z"
  },
  "operations": [
    {
      "type": "node_added",
      "stepIndex": 0,
      "nodeId": "node-123",
      "nodeType": "core.ForwardNode",
      "position": { "x": 100, "y": 200 },
      "context": {}
    },
    {
      "type": "iteration",
      "stepIndex": 1,
      "activatedNodeIds": ["node-123"],
      "nodeStates": [
        {
          "nodeId": "node-123",
          "status": "success",
          "outPorts": {
            "output": { "dataType": "string", "data": "hello" }
          }
        }
      ]
    }
  ]
}
```

## 注意事项

1. **性能考虑**：录制会略微影响执行性能，建议仅在需要演示时启用
2. **状态一致性**：回放时需要确保图的初始状态与录制时一致
3. **向后兼容**：录制格式包含版本号，未来可能需要迁移逻辑
4. **简化实现**：当前回放 `previous` 通过从头重放实现，复杂场景可能需要更精细的逆操作

## 扩展建议

1. **录制优化**：添加增量状态记录，减少存储大小
2. **动画效果**：添加节点状态变化的动画过渡
3. **注释系统**：允许在特定步骤添加说明文字
4. **分支回放**：支持在演示中创建分支路径
5. **实时编辑**：允许在回放过程中暂停并修改图
