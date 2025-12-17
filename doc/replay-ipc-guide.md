# ANORA 回放模式 IPC 控制指南

本文档详细说明如何通过 IPC 消息从外部程序控制 ANORA 的回放（Replay）模式。

## 目录

- [什么是 ANORA](#什么是-anora)
- [什么是回放模式](#什么是回放模式)
- [为什么需要 IPC 控制](#为什么需要-ipc-控制)
- [快速开始](#快速开始)
- [消息格式](#消息格式)
- [命令列表](#命令列表)
  - [播放控制](#播放控制)
  - [时间跳转](#时间跳转)
  - [关键帧导航](#关键帧导航)
  - [定时播放](#定时播放)
  - [导入录制](#导入录制)
- [响应消息](#响应消息)
- [集成示例](#集成示例)
  - [Godot-WRY 集成](#godot-wry-集成)
  - [iframe 嵌入](#iframe-嵌入)
- [错误处理](#错误处理)

---

## 什么是 ANORA

**ANORA**（Anora's Not Only Recording API）是一个基于 Web 技术（Vue 3 + TypeScript）的**可视化/图形化编程**前端系统。

**核心特性：**

- **节点式编程**：用户通过拖放节点、连接端口（Port）来构建逻辑
- **实时执行**：图（Graph）可以被执行器（Executor）实时运行
- **模块化扩展**：通过 Mod 系统扩展节点类型和功能
- **跨平台集成**：可嵌入浏览器、Electron、Godot（通过 godot-wry）等环境

**应用场景：**

- 教育工具（可视化算法演示）
- 游戏内脚本系统（ProxyOS 游戏的编程子系统）
- API 测试与自动化
- 数据流处理原型设计

---

## 什么是回放模式

**回放模式**（Replay Mode）是 ANORA 的**演示和教学**功能，用于录制并回放图的执行过程。

### 工作原理

1. **录制阶段**：
   - 用户在编辑器中执行图时，可以启动录制
   - 系统记录所有执行事件（节点激活、数据传播、状态变化等）
   - 每个事件带有精确的时间戳
   - 录制结果保存为 JSON 格式文件

2. **回放阶段**：
   - 加载录制文件到回放视图
   - 回放执行器（ReplayExecutor）按时间轴重放事件
   - UI 实时显示节点激活、数据流动等视觉效果
   - 用户可以暂停、跳转、调速观看

### 典型用途

- **教程制作**：录制编程步骤，供学习者反复观看
- **游戏演示**：在 ProxyOS 游戏中展示任务解法
- **文档生成**：自动生成带截图的执行流程说明
- **调试分析**：回放问题场景，逐帧分析执行逻辑

### 回放视图特性

- 时间轴进度条（可拖动）
- 关键帧标记（便于快速导航）
- 播放速度控制（0.5x ~ 4x）
- 播放/暂停/单步控制
- **无顶部工具栏**（专为嵌入外部系统设计）

---

## 为什么需要 IPC 控制

回放模式通常需要集成到外部系统中使用，例如：

| 使用场景           | IPC 控制的作用                                |
| ------------------ | --------------------------------------------- |
| **游戏内教程系统** | Godot 控制播放进度，根据玩家操作同步暂停/继续 |
| **在线教育平台**   | 网页平台控制多个回放实例同步播放              |
| **自动化测试**     | 脚本控制回放并截图，生成测试报告              |
| **多语言文档生成** | 自动跳转到关键帧，生成不同语言版本的截图      |
| **交互式演示**     | 用户点击步骤列表，回放跳转到对应时间点        |

**IPC 控制的优势：**

- 外部程序完全掌控播放逻辑（无需用户手动点击 UI）
- 支持自动化工作流（脚本化控制）
- 多实例同步（一次命令控制多个回放窗口）
- 嵌入式集成（回放视图无工具栏，完全由外部控制）

---

## 快速开始

### 1. 嵌入回放视图

通过 iframe 或 WebView 加载回放页面：

```html
<!-- Web 环境 -->
<iframe id="anora" src="http://localhost:5173/demo" width="100%" height="600px"></iframe>
```

```gdscript
# Godot-WRY 环境
$WebView.load_url("http://localhost:5173/demo")
```

### 2. 发送第一个命令

```javascript
// JavaScript (iframe)
const iframe = document.getElementById('anora')
iframe.contentWindow.postMessage({ type: 'replay.play' }, 'http://localhost:5173')
```

```gdscript
# GDScript (Godot)
var msg = JSON.stringify({"type": "replay.play"})
$WebView.post_message(msg)
```

### 3. 监听响应

```javascript
// JavaScript
window.addEventListener('message', (event) => {
  if (event.data.type === 'replay.state') {
    console.log('状态:', event.data.payload.state)
  }
})
```

```gdscript
# GDScript
func _on_ipc_message(message: String):
    var data = JSON.parse_string(message)
    if data.type == "replay.state":
        print("状态: ", data.payload.state)
```

---

## 概述

ANORA 回放模式支持通过 IPC（Inter-Process Communication）消息进行外部控制。这允许外部系统（如 Godot、Electron、iframe 父页面等）完全控制回放行为，而无需用户手动操作 UI。

**架构：**

```
外部程序 → postMessage → ANORA (useReplayIPC) → ReplayExecutor → UI 更新
外部程序 ← postMessage ← ANORA (响应消息) ← ReplayExecutor
```

**通信协议：**

- **发送命令**：使用 `window.postMessage()` 发送 JSON 格式消息
- **接收响应**：监听 `window.addEventListener('message', ...)` 接收响应
- **消息类型**：所有回放控制命令以 `replay.` 前缀标识

---

## 录制格式说明

回放模式使用 JSON 格式的录制文件：

```typescript
interface DemoRecording {
  version: '2.0.0' // 录制格式版本
  metadata: {
    createdAt: string // 创建时间（ISO 8601）
    duration: number // 总时长（毫秒）
    totalEvents: number // 事件总数
  }
  initialGraph: SerializedGraph // 初始图状态（节点、连接、端口数据）
  events: TimestampedEvent[] // 带时间戳的事件序列
}

interface TimestampedEvent {
  timestamp: number // 相对时间（毫秒，从 0 开始）
  event: SerializedExecutorEvent // 执行器事件（节点激活、数据传播等）
}
```

**示例录制文件片段：**

```json
{
  "version": "2.0.0",
  "metadata": {
    "createdAt": "2024-01-15T10:30:00.000Z",
    "duration": 5230,
    "totalEvents": 127
  },
  "initialGraph": {
    "nodes": [...],
    "edges": [...]
  },
  "events": [
    { "timestamp": 0, "event": { "type": "executor:started" } },
    { "timestamp": 15, "event": { "type": "node:activated", "nodeId": "node-1" } },
    { "timestamp": 23, "event": { "type": "port:dataWritten", "portId": "port-5", "value": 42 } },
    ...
  ]
}
```

---

## 消息格式

### 命令消息（外部程序 → ANORA）

```typescript
interface IPCMessage {
  type: string // 命令类型，如 'replay.play'
  payload?: unknown // 命令参数（可选）
}
```

### 响应消息（ANORA → 外部程序）

```typescript
interface IPCResponse {
  type: string // 响应类型，如 'replay.state'
  payload: unknown // 响应数据
}
```

---

## 命令列表

### 播放控制

#### `replay.play` - 开始播放

启动或恢复回放。

**请求：**

```json
{ "type": "replay.play" }
```

**响应：**

```json
{
  "type": "replay.state",
  "payload": { "state": "Running" }
}
```

---

#### `replay.pause` - 暂停播放

暂停当前回放。

**请求：**

```json
{ "type": "replay.pause" }
```

**响应：**

```json
{
  "type": "replay.state",
  "payload": { "state": "Paused" }
}
```

---

#### `replay.toggle` - 切换播放/暂停

根据当前状态自动切换播放或暂停。

**请求：**

```json
{ "type": "replay.toggle" }
```

**响应：**

```json
{
  "type": "replay.state",
  "payload": { "state": "Running" | "Paused" }
}
```

---

### 时间跳转

#### `replay.seek` - 跳转到指定位置

支持按时间（毫秒）或事件索引跳转。

**按时间跳转：**

```json
{
  "type": "replay.seek",
  "payload": { "timeMs": 5000 } // 跳转到 5 秒处
}
```

**按索引跳转：**

```json
{
  "type": "replay.seek",
  "payload": { "eventIndex": 42 } // 跳转到第 42 个事件
}
```

**响应：**

```json
{
  "type": "replay.seeked",
  "payload": {
    "timeMs": 5000,
    "eventIndex": 42
  }
}
```

---

### 关键帧导航

#### `replay.seekToKeyframe` - 跳转到关键帧

跳转到指定关键帧，或跳转到当前位置前/后的关键帧。

**跳转到指定关键帧：**

```json
{
  "type": "replay.seekToKeyframe",
  "payload": { "keyframeIndex": 3 } // 跳转到第 3 个关键帧
}
```

**跳转到前一个关键帧：**

```json
{
  "type": "replay.seekToKeyframe",
  "payload": { "direction": "before" }
}
```

**跳转到后一个关键帧：**

```json
{
  "type": "replay.seekToKeyframe",
  "payload": { "direction": "after" }
}
```

**响应：**

```json
{
  "type": "replay.keyframe",
  "payload": {
    "keyframeIndex": 3,
    "timeMs": 7500,
    "eventIndex": 67
  }
}
```

**关键帧说明：**

- 关键帧按固定时间间隔（默认 13ms）聚合事件
- 用于快速导航和进度条标记显示
- 通过 `getKeyframes()` 回调获取关键帧列表

---

### 定时播放

#### `replay.playFor` - 播放指定时长后自动暂停

从当前位置播放指定毫秒数后自动暂停。用于分段演示。

**请求：**

```json
{
  "type": "replay.playFor",
  "payload": { "durationMs": 3000 } // 播放 3 秒后暂停
}
```

**响应（播放开始）：**

```json
{
  "type": "replay.state",
  "payload": { "state": "Running" }
}
```

**响应（自动暂停）：**

```json
{
  "type": "replay.playForComplete",
  "payload": {
    "requestedDurationMs": 3000,
    "actualDurationMs": 3012,
    "finalTimeMs": 8512
  }
}
```

**使用场景：**

- 分段教学演示
- 自动化测试截图
- 定时触发其他操作

---

### 导入录制

#### `replay.importRecording` - 加载录制文件内容

从外部系统传入录制文件的 JSON 文本，加载到回放器中。

**请求：**

```json
{
  "type": "replay.importRecording",
  "payload": {
    "recordingText": "{\"version\":\"2.0.0\",\"metadata\":{...},\"initialGraph\":{...},\"events\":[...]}"
  }
}
```

**响应（成功）：**

```json
{
  "type": "replay.recordingLoaded",
  "payload": {
    "version": "2.0.0",
    "duration": 15000,
    "totalEvents": 234
  }
}
```

**响应（失败）：**

```json
{
  "type": "replay.error",
  "payload": {
    "command": "replay.importRecording",
    "error": "Invalid JSON format"
  }
}
```

---

## 响应消息

ANORA 会主动发送以下类型的响应消息：

| 响应类型                 | 触发时机         | Payload 内容                                             |
| ------------------------ | ---------------- | -------------------------------------------------------- |
| `replay.state`           | 播放状态改变     | `{ state: ExecutorState }`                               |
| `replay.seeked`          | 跳转完成         | `{ timeMs, eventIndex }`                                 |
| `replay.keyframe`        | 关键帧跳转完成   | `{ keyframeIndex, timeMs, eventIndex }`                  |
| `replay.playForComplete` | 定时播放完成     | `{ requestedDurationMs, actualDurationMs, finalTimeMs }` |
| `replay.recordingLoaded` | 录制文件加载成功 | `{ version, duration, totalEvents }`                     |
| `replay.error`           | 命令执行失败     | `{ command, error }`                                     |

**ExecutorState 枚举值：**

- `Idle` - 空闲（未加载录制）
- `Running` - 播放中
- `Paused` - 已暂停
- `Stepping` - 单步执行（暂不支持 IPC 控制）

---

## 集成示例

### Godot-WRY 集成

在 Godot 中通过 `godot-wry` 插件控制 ANORA 回放：

```gdscript
extends Node

@onready var webview = $WebView

func _ready():
    # 监听 ANORA 响应
    webview.connect("ipc_message", self, "_on_ipc_message")

    # 加载 ANORA 回放页面
    webview.load_url("http://localhost:5173/demo")

func play_demo():
    # 发送播放命令
    var msg = JSON.stringify({"type": "replay.play"})
    webview.post_message(msg)

func pause_demo():
    var msg = JSON.stringify({"type": "replay.pause"})
    webview.post_message(msg)

func seek_to_time(time_ms: int):
    var msg = JSON.stringify({
        "type": "replay.seek",
        "payload": {"timeMs": time_ms}
    })
    webview.post_message(msg)

func load_recording(recording_json: String):
    var msg = JSON.stringify({
        "type": "replay.importRecording",
        "payload": {"recordingText": recording_json}
    })
    webview.post_message(msg)

func _on_ipc_message(message: String):
    var data = JSON.parse_string(message)
    match data.type:
        "replay.state":
            print("Replay state changed: ", data.payload.state)
        "replay.seeked":
            print("Seeked to: ", data.payload.timeMs, "ms")
        "replay.error":
            print("Error: ", data.payload.error)
```

**使用示例：**

```gdscript
# 游戏脚本中调用
func show_tutorial():
    # 加载教程录制
    var recording = load("res://tutorials/intro.json").get_as_text()
    $ReplayController.load_recording(recording)

    # 等待加载完成
    await get_tree().create_timer(0.5).timeout

    # 开始播放
    $ReplayController.play_demo()

    # 播放 5 秒后暂停
    await get_tree().create_timer(5.0).timeout
    $ReplayController.pause_demo()
```

---

### iframe 嵌入

在 Web 页面中通过 iframe 嵌入 ANORA 回放：

```html
<!DOCTYPE html>
<html>
  <head>
    <title>ANORA Demo Viewer</title>
  </head>
  <body>
    <iframe id="anora" src="http://localhost:5173/demo" width="100%" height="600px"></iframe>

    <div>
      <button onclick="sendCommand('replay.play')">Play</button>
      <button onclick="sendCommand('replay.pause')">Pause</button>
      <button onclick="sendCommand('replay.toggle')">Toggle</button>
      <button onclick="seekToTime(5000)">Seek to 5s</button>
      <button onclick="loadRecording()">Load Recording</button>
    </div>

    <script>
      const iframe = document.getElementById('anora')

      // 监听 ANORA 响应
      window.addEventListener('message', (event) => {
        // 验证来源（生产环境必须）
        if (event.origin !== 'http://localhost:5173') return

        const msg = event.data
        console.log('Received from ANORA:', msg.type, msg.payload)

        // 处理响应
        if (msg.type === 'replay.state') {
          console.log('State:', msg.payload.state)
        } else if (msg.type === 'replay.error') {
          alert('Error: ' + msg.payload.error)
        }
      })

      // 发送命令到 ANORA
      function sendCommand(type, payload = null) {
        const msg = { type, payload }
        iframe.contentWindow.postMessage(msg, 'http://localhost:5173')
      }

      function seekToTime(timeMs) {
        sendCommand('replay.seek', { timeMs })
      }

      async function loadRecording() {
        // 从服务器加载录制文件
        const response = await fetch('/api/recordings/demo.json')
        const recordingText = await response.text()

        sendCommand('replay.importRecording', { recordingText })
      }
    </script>
  </body>
</html>
```

---

## 错误处理

### 常见错误

| 错误消息                 | 原因                                  | 解决方案                             |
| ------------------------ | ------------------------------------- | ------------------------------------ |
| `Executor not available` | Executor 未初始化或已销毁             | 确保页面加载完成后再发送命令         |
| `Invalid JSON format`    | `replay.importRecording` 参数格式错误 | 验证 JSON 格式，确保完整的录制文件   |
| `Invalid seek target`    | `replay.seek` 参数缺失或类型错误      | 提供 `timeMs` 或 `eventIndex` 之一   |
| `Keyframe not found`     | 指定的关键帧索引超出范围              | 先调用 `getKeyframes()` 获取有效范围 |
| `No keyframes available` | 录制文件未加载或无事件                | 先加载有效的录制文件                 |

### 错误响应格式

```json
{
  "type": "replay.error",
  "payload": {
    "command": "replay.seek",
    "error": "Invalid seek target: must provide timeMs or eventIndex"
  }
}
```

### 健壮性建议

1. **验证消息来源**：

   ```javascript
   window.addEventListener('message', (event) => {
     if (event.origin !== 'https://your-anora-domain.com') return
     // 处理消息
   })
   ```

2. **超时处理**：

   ```javascript
   function sendCommandWithTimeout(type, payload, timeoutMs = 5000) {
     return new Promise((resolve, reject) => {
       const handler = (event) => {
         if (event.data.type === `${type}.response`) {
           clearTimeout(timer)
           window.removeEventListener('message', handler)
           resolve(event.data.payload)
         }
       }

       const timer = setTimeout(() => {
         window.removeEventListener('message', handler)
         reject(new Error('IPC command timeout'))
       }, timeoutMs)

       window.addEventListener('message', handler)
       sendCommand(type, payload)
     })
   }
   ```

3. **状态同步**：

   ```javascript
   let currentState = 'Idle'

   window.addEventListener('message', (event) => {
     if (event.data.type === 'replay.state') {
       currentState = event.data.payload.state
       updateUI(currentState)
     }
   })
   ```

---

## 高级用例

### 自动化演示脚本

结合多个命令实现自动化演示流程：

```javascript
async function runAutomatedDemo() {
  // 1. 加载录制
  await loadRecording('demo-1.json')
  await sleep(500)

  // 2. 播放前 3 秒
  sendCommand('replay.playFor', { durationMs: 3000 })
  await waitForMessage('replay.playForComplete')

  // 3. 暂停并高亮某个节点（需要自定义实现）
  sendCommand('replay.pause')
  highlightNode('node-123')
  await sleep(2000)

  // 4. 跳转到关键帧
  sendCommand('replay.seekToKeyframe', { keyframeIndex: 5 })
  await waitForMessage('replay.keyframe')

  // 5. 继续播放直到结束
  sendCommand('replay.play')
}

function waitForMessage(type) {
  return new Promise((resolve) => {
    const handler = (event) => {
      if (event.data.type === type) {
        window.removeEventListener('message', handler)
        resolve(event.data.payload)
      }
    }
    window.addEventListener('message', handler)
  })
}
```

### 多实例同步播放

在多个 iframe 中同步播放相同录制：

```javascript
const iframes = [
  document.getElementById('anora-1'),
  document.getElementById('anora-2'),
  document.getElementById('anora-3'),
]

function broadcastCommand(type, payload) {
  iframes.forEach((iframe) => {
    iframe.contentWindow.postMessage({ type, payload }, '*')
  })
}

// 同步播放
broadcastCommand('replay.play')

// 同步跳转
broadcastCommand('replay.seek', { timeMs: 5000 })
```

---

## 相关文档

- [ANORA 项目文档](./story-working.md)
- [Demo 录制格式说明](./demo-mode.md)
- [Godot-WRY 集成指南](https://github.com/your-repo/godot-wry-guide)

---

## 更新日志

- **2024-01** - 初始版本，支持 7 种基础命令
- **待定** - 计划支持自定义事件订阅、批量命令执行
