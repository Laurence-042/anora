# ANORA 回放模式 IPC 控制指南

本文档说明如何通过 IPC 消息从外部程序控制 ANORA 的回放（Replay）模式。

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

- **节点式编程**：通过拖放节点、连接端口构建逻辑
- **实时执行**：图可被执行器实时运行
- **模块化扩展**：通过 Mod 系统扩展节点类型和功能
- **跨平台集成**：可嵌入浏览器、Electron、Godot（godot-wry）等环境

**应用场景：**

- 教育工具（可视化算法演示）
- 游戏内脚本系统（ProxyOS 游戏的编程子系统）
- API 测试与自动化
- 数据流处理原型设计

---

## 什么是回放模式

**回放模式**（Replay Mode）用于录制并回放图的执行过程。

### 工作原理

1. **录制阶段**：
   - 用户执行图时启动录制
   - 记录所有执行事件（节点激活、数据传播、状态变化等）
   - 每个事件带时间戳
   - 保存为 JSON 格式

2. **回放阶段**：
   - 加载录制文件到回放视图
   - ReplayExecutor 按时间轴重放事件
   - UI 实时显示节点激活、数据流动
   - 支持暂停、跳转、调速

### 典型用例

- **教程制作**：录制编程步骤供学习者观看
- **游戏演示**：在 ProxyOS 中展示任务解法
- **文档生成**：自动生成执行流程截图
- **调试分析**：回放问题场景，逐帧分析

---

## 为什么需要 IPC 控制

回放模式常需集成到外部系统：

| 使用场景           | IPC 控制的作用                                |
| ------------------ | --------------------------------------------- |
| **游戏内教程系统** | Godot 控制播放进度，根据玩家操作同步暂停/继续 |
| **在线教育平台**   | 网页平台控制多个回放实例同步播放              |
| **自动化测试**     | 脚本控制回放并截图，生成测试报告              |
| **多语言文档生成** | 自动跳转到关键帧，生成不同语言版本截图        |
| **交互式演示**     | 用户点击步骤列表，回放跳转到对应时间点        |

**IPC 控制优势：**

- 外部程序完全掌控播放逻辑（无需手动操作 UI）
- 支持自动化工作流
- 多实例同步
- 嵌入式集成（无工具栏，完全外部控制）

---

## 快速开始

### 1. 嵌入回放视图

```html
<!-- Web 环境 -->
<iframe id="anora" src="http://localhost:5173/demo" width="100%" height="600px"></iframe>
```

```gdscript
# Godot-WRY 环境
$WebView.load_url("http://localhost:5173/demo")
```

### 2. 发送命令

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
    console.log('状态:', event.data.data.state)
  }
})
```

```gdscript
# GDScript
func _on_ipc_message(message: String):
    var data = JSON.parse_string(message)
    if data.type == "replay.state":
        print("状态: ", data.data.state)
```

---

## 通信架构

```
外部程序 → postMessage → ANORA (useReplayIPC) → ReplayExecutor → UI 更新
外部程序 ← postMessage ← ANORA (响应消息) ← ReplayExecutor
```

**通信协议：**

- **发送命令**：`window.postMessage()` 发送 JSON 消息
- **接收响应**：`window.addEventListener('message', ...)` 监听响应
- **消息类型**：回放控制命令以 `replay.` 前缀标识
- **传输层兼容**：
  - 标准浏览器：`window.postMessage`
  - Godot-WRY：`document.dispatchEvent` (自定义事件)

---

## IPC Ready 机制

当 ANORA 的 IPC 系统完成初始化并准备好接收外部命令时，会向所有通道广播 `ipc:ready` 消息。外部程序应监听此消息，确保在 ANORA 准备就绪后再发送命令。

### Ready 消息格式

```json
{
  "type": "ipc:ready",
  "data": {
    "timestamp": 1706000000000
  }
}
```

### 监听 Ready 消息

**JavaScript (iframe)：**

```javascript
window.addEventListener('message', (event) => {
  if (event.data.type === 'ipc:ready') {
    console.log('ANORA IPC is ready at:', event.data.data.timestamp)
    // 现在可以安全地发送命令
    sendCommand('replay.importRecording', recordingData)
  }
})
```

**GDScript (Godot-WRY)：**

```gdscript
var anora_ready = false

func _on_ipc_message(message: String):
    var data = JSON.parse_string(message)
    if data.type == "ipc:ready":
        print("ANORA IPC is ready at: ", data.data.timestamp)
        anora_ready = true
        # 现在可以安全地发送命令
        load_recording(tutorial_data)

func send_command_safe(type: String, data = null):
    if not anora_ready:
        push_warning("ANORA IPC not ready yet")
        return
    # 发送命令...
```

### 为什么需要 Ready 消息

| 场景       | 问题                                  | Ready 机制解决方案            |
| ---------- | ------------------------------------- | ----------------------------- |
| 页面加载   | 外部程序无法确定 ANORA 何时完成初始化 | 收到 `ipc:ready` 后再发送命令 |
| 重新加载   | ANORA 刷新后外部程序不知道何时恢复    | 监听新的 `ipc:ready` 消息     |
| 多实例管理 | 无法追踪哪些实例已就绪                | 每个实例独立发送 ready 消息   |

### 通道架构

IPC 系统采用通道抽象设计，便于扩展新的通信方式：

```typescript
interface IPCChannel {
  readonly name: string
  send(message: IPCMessage): void
  startListening(handler: (msg: IPCMessage) => Promise<void>): void
  stopListening(): void
}
```

**内置通道：**

| 通道名称             | 接收方式                               | 发送方式                      | 适用场景                |
| -------------------- | -------------------------------------- | ----------------------------- | ----------------------- |
| `window.postMessage` | `window.addEventListener('message')`   | `window.parent.postMessage()` | iframe 嵌入、浏览器测试 |
| `godot-wry`          | `document.addEventListener('message')` | `window.ipc.postMessage()`    | Godot 游戏引擎集成      |

Ready 消息会同时通过所有已注册的通道发送，确保无论外部程序使用哪种通信方式都能收到通知。

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
    { "timestamp": 23, "event": { "type": "port:dataWritten", "portId": "port-5", "value": 42 } }
  ]
}
```

---

## 消息格式

### 命令消息（外部程序 → ANORA）

```typescript
interface IPCMessage {
  type: string // 命令类型，如 'replay.play'
  data?: unknown // 命令参数（可选）
}
```

**示例：**

```json
{
  "type": "replay.play"
}
```

```json
{
  "type": "replay.seek",
  "data": { "timeMs": 5000 }
}
```

### 响应消息（ANORA → 外部程序）

```typescript
interface IPCResponse {
  type: string // 响应类型，如 'replay.state'
  data: unknown // 响应数据
}
```

**示例：**

```json
{
  "type": "replay.state",
  "data": { "state": "Running" }
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
  "type": "replay.played"
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
  "type": "replay.paused"
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
  "type": "replay.toggled"
}
```

---

#### `replay.stepForward` - 单步前进

执行一步（播放下一个事件）。

**请求：**

```json
{ "type": "replay.stepForward" }
```

**响应：**

```json
{
  "type": "replay.stepped"
}
```

---

#### `replay.restart` - 重新开始

从头开始播放。

**请求：**

```json
{ "type": "replay.restart" }
```

**响应：**

```json
{
  "type": "replay.restarted"
}
```

---

### 播放速度

#### `replay.setSpeed` - 设置播放速度

设置播放速度倍率。

**请求：**

```json
{
  "type": "replay.setSpeed",
  "data": { "speed": 2.0 }
}
```

**响应：**

```json
{
  "type": "replay.speedSet",
  "data": { "speed": 2.0 }
}
```

**支持的速度值：** 0.5, 1.0, 1.5, 2.0, 4.0（或任意正数）

---

### 时间跳转

#### `replay.seek` - 跳转到指定位置

支持按时间（毫秒）或事件索引跳转。

**按时间跳转：**

```json
{
  "type": "replay.seek",
  "data": { "timeMs": 5000 }
}
```

**按索引跳转：**

```json
{
  "type": "replay.seek",
  "data": { "eventIndex": 42 }
}
```

**响应：**

```json
{
  "type": "replay.seeked",
  "data": {
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
  "data": { "keyframeIndex": 3 }
}
```

**跳转到关键帧之前的位置（before=true）：**

```json
{
  "type": "replay.seekToKeyframe",
  "data": { "keyframeIndex": 3, "before": true }
}
```

**响应：**

```json
{
  "type": "replay.seekToKeyframe",
  "data": {
    "keyframeIndex": 3
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
  "data": { "durationMs": 3000 }
}
```

**响应（播放开始）：**

```json
{
  "type": "replay.playFor.started",
  "data": { "durationMs": 3000, "timerId": 1 }
}
```

**响应（自动暂停/完成）：**

```json
{
  "type": "replay.playFor.completed",
  "data": {
    "durationMs": 3000
  }
}
```

**特殊用法：播放到结束**

当 `durationMs` 为 `-1` 时，表示播放到录制结束：

```json
{
  "type": "replay.playFor",
  "data": { "durationMs": -1 }
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

`data` 字段直接传入解析后的 DemoRecording 对象（不是 JSON 字符串）：

```json
{
  "type": "replay.importRecording",
  "data": {
    "version": "2.0.0",
    "metadata": { "createdAt": "...", "duration": 15000, "totalEvents": 234 },
    "initialGraph": { ... },
    "events": [ ... ]
  }
}
```

**响应（成功）：**

```json
{
  "type": "replay.importRecording.ok"
}
```

**响应（失败）：**

```json
{
  "type": "replay.importRecording.error",
  "data": {
    "error": "no-data"
  }
}
```

---

## 响应消息

ANORA 会主动发送以下类型的响应消息：

| 响应类型                       | 触发时机       | 数据内容                                      |
| ------------------------------ | -------------- | --------------------------------------------- |
| `replay.played`                | 播放命令执行   | 无                                            |
| `replay.paused`                | 暂停命令执行   | 无                                            |
| `replay.toggled`               | 切换命令执行   | 无                                            |
| `replay.stepped`               | 单步命令执行   | 无                                            |
| `replay.restarted`             | 重启命令执行   | 无                                            |
| `replay.seeked`                | 跳转完成       | `{ timeMs?, eventIndex?, error? }`            |
| `replay.seekToKeyframe`        | 关键帧跳转完成 | `{ keyframeIndex }` 或 `{ error }`            |
| `replay.speedSet`              | 速度设置完成   | `{ speed }`                                   |
| `replay.playFor.started`       | 定时播放开始   | `{ durationMs, timerId? }` 或 `{ playToEnd }` |
| `replay.playFor.completed`     | 定时播放完成   | `{ durationMs }` 或 `{ playedToEnd }`         |
| `replay.importRecording.ok`    | 录制加载成功   | 无                                            |
| `replay.importRecording.error` | 录制加载失败   | `{ error }`                                   |

**ExecutorState 枚举值：**

- `Idle` - 空闲（未加载录制）
- `Running` - 播放中
- `Paused` - 已暂停
- `Stepping` - 单步执行（暂不支持 IPC 控制）

---

## 集成示例

### Godot-WRY 集成

在 Godot 中通过 `godot-wry` 插件控制 ANORA 回放。

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
        "data": {"timeMs": time_ms}
    })
    webview.post_message(msg)

func load_recording(recording_data: Dictionary):
    var msg = JSON.stringify({
        "type": "replay.importRecording",
        "data": recording_data
    })
    webview.post_message(msg)

func _on_ipc_message(message: String):
    var data = JSON.parse_string(message)
    match data.type:
        "replay.state":
            print("Replay state changed: ", data.data.state)
        "replay.seeked":
            print("Seeked to: ", data.data.timeMs, "ms")
        "replay.error":
            print("Error: ", data.data.error)
```

**使用示例：**

```gdscript
# 游戏脚本中调用
func show_tutorial():
    # 加载教程录制
    var file = FileAccess.open("res://tutorials/intro.json", FileAccess.READ)
    var recording_data = JSON.parse_string(file.get_as_text())
    $ReplayController.load_recording(recording_data)

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

在 Web 页面中通过 iframe 嵌入 ANORA 回放。

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
        console.log('Received from ANORA:', msg.type, msg.data)

        // 处理响应
        if (msg.type === 'replay.state') {
          console.log('State:', msg.data.state)
        } else if (msg.type === 'replay.error') {
          alert('Error: ' + msg.data.error)
        }
      })

      // 发送命令到 ANORA
      function sendCommand(type, data = null) {
        const msg = { type, data }
        iframe.contentWindow.postMessage(msg, 'http://localhost:5173')
      }

      function seekToTime(timeMs) {
        sendCommand('replay.seek', { timeMs })
      }

      async function loadRecording() {
        // 从服务器加载录制文件
        const response = await fetch('/api/recordings/demo.json')
        const recording = await response.json()

        sendCommand('replay.importRecording', recording)
      }
    </script>
  </body>
</html>
```

---

## 错误处理

### 常见错误

| 错误消息                 | 原因                             | 解决方案                                   |
| ------------------------ | -------------------------------- | ------------------------------------------ |
| `not-loaded`             | 录制文件未加载                   | 先调用 `replay.importRecording` 加载       |
| `no-data`                | `replay.importRecording` 无数据  | 确保 `data` 字段包含有效的录制数据         |
| `invalid-data`           | `replay.seek` 参数缺失或类型错误 | 提供 `timeMs` 或 `eventIndex` 之一（数字） |
| `invalid-keyframe-index` | 指定的关键帧索引无效             | 确保 `keyframeIndex` 为非负整数            |

### 错误响应格式

```json
{
  "type": "replay.error",
  "data": {
    "command": "replay.seek",
    "error": "Invalid seek target: must provide timeMs or eventIndex"
  }
}
```

### 健壮性建议

1. **验证消息来源：**

```javascript
window.addEventListener('message', (event) => {
  if (event.origin !== 'https://your-anora-domain.com') return
  // 处理消息
})
```

2. **超时处理：**

```javascript
function sendCommandWithTimeout(type, data, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const handler = (event) => {
      if (event.data.type === `${type}.response`) {
        clearTimeout(timer)
        window.removeEventListener('message', handler)
        resolve(event.data.data)
      }
    }

    const timer = setTimeout(() => {
      window.removeEventListener('message', handler)
      reject(new Error('IPC command timeout'))
    }, timeoutMs)

    window.addEventListener('message', handler)
    sendCommand(type, data)
  })
}
```

3. **状态同步：**

```javascript
let currentState = 'Idle'

window.addEventListener('message', (event) => {
  if (event.data.type === 'replay.state') {
    currentState = event.data.data.state
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
  const recording = await fetch('demo-1.json').then((r) => r.json())
  sendCommand('replay.importRecording', recording)
  await sleep(500)

  // 2. 播放 3 秒
  sendCommand('replay.playFor', { durationMs: 3000 })
  await waitForMessage('replay.playFor.completed')

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
        resolve(event.data.data)
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

function broadcastCommand(type, data) {
  iframes.forEach((iframe) => {
    iframe.contentWindow.postMessage({ type, data }, '*')
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
- **2024-12** - 更新消息格式，统一使用 `data` 字段替代 `payload`
- **待定** - 计划支持自定义事件订阅、批量命令执行
