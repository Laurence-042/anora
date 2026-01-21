# ANORA Copilot Instructions

## Project Overview

ANORA (Anora's Not Only Recording API) is a visual/graph-based programming frontend built with **Vue 3 + TypeScript + Vue-Flow + Element Plus**. It features a modular node system where execution logic is separated from data logic via Executors.

**Context**: ANORA is the programming/visual-scripting subsystem for **ProxyOS**, an educational OS simulation game built with Godot. Future backend integrations may include Python environments and Playwright for API recording/playback.

## Architecture

```
Graph (边管理)
 └─ Nodes (函数抽象)
      └─ Ports (入参/出参)

Executor (执行控制)
 ├─ Inspect Graph
 └─ Manage Context
```

**Key Layers:**

- `src/base/runtime/` - Core runtime (UI-independent, can run standalone in Node.js)
- `src/base/ui/` - Vue components for node/port visualization
- `src/mods/` - Extensions (core functionality is also a mod for consistency)

## Node System Patterns

### Creating a New Node

**Extend `WebNode`** (browser-side) or **`BackendNode`** (requires IPC):

```typescript
@AnoraRegister('your-mod.YourNode')
export class YourNode extends WebNode<YourInput, YourOutput, YourControl, YourContext> {
  static override meta = { icon: '🔧', category: 'yourCategory' }

  constructor(id?: string, label?: string) {
    super(id, label ?? 'YourNode')
    this.addInPort('input', new StringPort(this))
    this.addOutPort('output', new NumberPort(this))
  }

  async activateCore(
    ctx: ExecutorContext,
    inData: YourInput,
    controlData: YourControl,
  ): Promise<YourOutput> {
    // Node logic here
  }
}
```

- **TypeId Format**: `{modId}.{NodeName}` (e.g., `core.ForwardNode`)
- **Auto-registration**: `@AnoraRegister` decorator registers to `NodeRegistry`

### Port Types

- **Primitive Ports**: `StringPort`, `NumberPort`, `BooleanPort`, `IntegerPort` (`src/mods/core/runtime/ports/PrimitivePorts.ts`)
- **Container Ports**: `ArrayPort`, `ObjectPort` (`src/mods/core/runtime/ports/ContainerPorts.ts`) - hold nested ports
- **NullPort**: For dependsOn/activateOn ports or any-type data flow (`src/base/runtime/ports/NullPort.ts`)

### Port Data Operations

| Method       | Behavior                                      | Use Case                     |
| ------------ | --------------------------------------------- | ---------------------------- |
| `write()`    | Converts & stores data, increments `_version` | Upstream node pushes data    |
| `read()`     | Returns data, marks as consumed (NOT cleared) | Node execution gets input    |
| `peek()`     | Returns data, no version change               | View data without consuming  |
| `hasData`    | `_data !== null \|\| _version > 0`            | Check if any data exists     |
| `hasNewData` | `_version > _lastReadVersion`                 | Check if unread data exists  |
| `clear()`    | Clears data and resets version                | Reset state before execution |

**Key Design**: `read()` does NOT clear data—it only marks data as consumed via version tracking. This allows `activateOn` to reuse previous data.

### Node Flow Control Ports

Nodes have flow control ports for execution sequencing:

- **inDependsOnPort**: Hard dependency - node must wait for this port to be written before first activation
- **inActivateOnPort**: Soft activation - can trigger node re-activation without blocking initial execution. Used for feedback loops in cyclic graphs. When triggered, bypasses "new data" check and reuses existing port data.
- **outTriggerPort**: Fires when node completes execution, can connect to downstream `inDependsOnPort` or `inActivateOnPort`

### Activation Mechanism

**Version-based activation**:

- Each input port maintains a version number (`_version` incremented on `write()`, `_lastReadVersion` updated on `read()`)
- "New data" = `write()` occurred after last `read()`
- Normal activation: all connected input ports must have new data
- `inActivateOnPort` trigger: ignores "new data" check, activates if ports have any data

### Port Name Constants

Use constants from `src/mods/core/runtime/nodes/PortNames.ts` to avoid hardcoded strings:

```typescript
import { CommonPorts, ForwardNodePorts } from './PortNames'

// CommonPorts: VALUE, RESULT, LEFT, RIGHT
// ArrayPorts: ARRAY, ITEM, INDEX, LENGTH
// ControlPorts: CONDITION, ON_TRUE, ON_FALSE, DONE, AGGREGATE
```

### Custom Node Views

Register Vue components in mod's `init()`:

```typescript
registerNodeView('your-node-view', YourNodeView, ['your-mod.YourNode'])
```

## Backend Integration

ANORA supports multiple backends via `BackendNode` and `ExecutorContext.ipcTypeId`:

| Backend              | IPC Type      | Use Case                          |
| -------------------- | ------------- | --------------------------------- |
| `godot-wry`          | `wry`         | Godot integration via WRY webview |
| `postMessage`        | `postMessage` | iframe/window communication       |
| (planned) Python     | TBD           | Python scripting environment      |
| (planned) Playwright | TBD           | API recording/playback            |

`BackendNode.sendIpcMessage()` routes to the appropriate transport based on `ipcTypeId`.

## SubGraph System

SubGraphs allow nesting graphs as nodes. Data flow:

```
SubGraphNode.inPort → SubGraphEntryNode → [inner graph] → SubGraphExitNode → SubGraphNode.outPort
```

Key class in `src/base/runtime/nodes/SubGraphNode.ts`:

- `SubGraphNode` - Container node with dynamic ports based on entry/exit nodes
- Entry/Exit nodes are identified by typeId patterns (`*Entry*`, `*Exit*`)

**Execution**: SubGraphNode instantiates a separate `BasicExecutor` for internal graph. Executor instances don't share state, but `ExecutorContext` is shared.

## Executor System

### State Management

Uses `ExecutorStateMachine` with states:

- `Idle` - Ready for new execution
- `Running` - Continuous execution in progress
- `Paused` - Execution paused, can resume or step
- `Stepping` - Single step in progress

### Execution Flow

1. **Initialize**: Reset node states, clear ports
2. **Iterate**: Find ready nodes → execute in parallel → propagate data → repeat
3. **Direct-through**: `ForwardNode` with `directThrough=true` executes immediately during propagation (special Executor handling, not a general mechanism)

### Event System

```typescript
enum ExecutorEventType {
  Start,
  Iteration,
  NodeStart,
  NodeComplete,
  DataPropagate,
  Complete,
  Cancelled,
  Error,
  StateChange,
}

executor.on((event: ExecutorEvent) => {
  /* handle */
})
```

## Demo/Recording System

`src/base/runtime/demo/` provides execution recording for playback demos:

| File                  | Purpose                                       |
| --------------------- | --------------------------------------------- |
| `DemoRecorder.ts`     | Records executor events with timestamps       |
| `ReplayExecutor.ts`   | Replays events, extends BasicExecutor         |
| `ReplayController.ts` | High-level playback control (speed, seek, UI) |
| `types.ts`            | DemoRecording format (v2.0.0)                 |

**Recording workflow**:

1. `GraphEditor` + `RecordingControls` - Start recording
2. Execute graph - Events recorded with timestamps
3. Export to `.json` file

**Replay workflow**:

1. Navigate to `/demo` route (`ReplayView.vue`)
2. Load recording file via `ReplayController`
3. `ReplayExecutor` emits events to `AnoraGraphView`

**IPC Control**: Replay supports external control via IPC messages. See `doc/replay-ipc-guide.md`.

## Mod Development

Follow `src/mods/README.md`. Each mod has:

- `index.ts` - ModDefinition + auto-registration to `ModRegistry`
- `locales/` - i18n translations (`en.ts`, `zh-CN.ts`)
- `runtime/nodes/`, `runtime/ports/` - Node and Port implementations
- `ui/nodes/` - Optional custom Vue views

**Adding a new mod**: Create directory `src/mods/{mod-name}/` with `index.ts` that calls `ModRegistry.register()`. Mods are auto-discovered via Vite glob import—no manual imports needed.

## i18n Conventions

- Node names: `nodes.{modId}.{NodeName}` (e.g., `nodes.core.ForwardNode`)
- Categories: `nodeCategories.{category}`
- Mods: `mods.{modId}`

## Key Files Reference

| File                                                | Purpose                               |
| --------------------------------------------------- | ------------------------------------- |
| `src/base/runtime/nodes/BaseNode.ts`                | Node base class with ports, context   |
| `src/base/runtime/nodes/NodeTypes.ts`               | `WebNode` and `BackendNode`           |
| `src/base/runtime/nodes/SubGraphNode.ts`            | SubGraph implementation               |
| `src/base/runtime/ports/BasePort.ts`                | Port base class with version tracking |
| `src/base/runtime/executor/BasicExecutor.ts`        | Graph execution engine                |
| `src/base/runtime/executor/ExecutorStateMachine.ts` | State machine for executor lifecycle  |
| `src/base/runtime/demo/ReplayController.ts`         | High-level replay control             |
| `src/base/runtime/registry/AnoraRegister.ts`        | `@AnoraRegister` decorator            |
| `src/stores/graph.ts`                               | Pinia store for graph/executor state  |
| `src/base/ui/editor/GraphEditor.vue`                | Main editor component                 |
| `src/base/ui/composables/useReplayIPC.ts`           | Replay IPC handling                   |
| `src/mods/core/`                                    | Reference mod implementation          |
| `src/mods/core/runtime/nodes/PortNames.ts`          | Port name constants                   |
| `src/mods/godot-wry/`                               | Godot backend integration mod         |

## Core Nodes (src/mods/core/runtime/nodes/)

| Node               | Purpose                                            |
| ------------------ | -------------------------------------------------- |
| `ForwardNode`      | Pass-through, supports `directThrough` mode        |
| `ParameterNode`    | Constant value source (JSON or string)             |
| `ArithmeticNode`   | Math operations (+, -, \*, /, %)                   |
| `CompareNode`      | Comparison (>, <, ==, etc.)                        |
| `LogicNode`        | Boolean logic (AND, OR, NOT)                       |
| `BranchNode`       | Conditional routing (true/false outputs)           |
| `DistributeNode`   | For-each: outputs array elements one per iteration |
| `AggregateNode`    | Collect values into array                          |
| `ConsoleLogNode`   | Debug output                                       |
| `StringFormatNode` | String interpolation                               |
| `NotifyNode`       | UI notifications                                   |
| `DataNodes`        | Data manipulation utilities                        |

## Development Commands

```bash
npm run dev      # Start dev server with HMR
npm run build    # Type-check + production build
npm run lint     # ESLint with auto-fix
npm run format   # Prettier formatting
```

## Common Gotchas

- **Port data flow**: `read()` marks data as consumed but does NOT clear it. Use version tracking (`hasNewData`) to check for new writes.
- **Execution model**: Nodes declare readiness via `ActivationReadyStatus`, Executor iterates until no nodes ready
- **Direct-through nodes**: `ForwardNode` with `directThrough=true` executes immediately during propagation—this is Executor's special handling, not a general mechanism
- **Out-port clearing**: Out-ports are cleared after data propagation to prevent duplicate propagation
- **Cyclic graphs**: Supported via `inActivateOnPort` for feedback loops. No max iteration limit—user must cancel infinite loops manually.
- **Shallow reactivity**: `shallowRef` for Graph/Executor in stores—call `triggerRef()` after mutations
- **No tests yet**: Project is in active development/refactoring phase
