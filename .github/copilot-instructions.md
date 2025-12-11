# ANORA Copilot Instructions

## Project Overview

ANORA (Anora's Not Only Recording API) is a visual/graph-based programming frontend built with **Vue 3 + TypeScript + Vue-Flow + Element Plus**. It features a modular node system where execution logic is separated from data logic via Executors.

**Context**: ANORA is the programming/visual-scripting subsystem for **ProxyOS**, an educational OS simulation game built with Godot. Future backend integrations may include Python environments and Playwright for API recording/playback.

## Architecture

```
Graph → manages → Nodes → contain → Ports (input/output)
Executor → inspects Graph, activates Nodes, manages Context
```

**Key Layers:**

- `src/base/runtime/` - Core runtime (UI-independent, can run standalone)
- `src/base/ui/` - Vue components for node/port visualization
- `src/mods/` - Extensions (core functionality is also a mod for consistency)

## Node System Patterns

### Creating a New Node

**Extend `WebNode`** (browser-side) or **`BackendNode`** (requires IPC):

```typescript
@AnoraRegister('your-mod.YourNode')
export class YourNode extends WebNode<YourInput, YourOutput> {
  static override meta = { icon: '🔧', category: 'yourCategory' }

  constructor(id?: string, label?: string) {
    super(id, label ?? 'YourNode')
    this.addInPort('input', new StringPort(this))
    this.addOutPort('output', new NumberPort(this))
  }

  async activateCore(ctx: ExecutorContext, inData: YourInput): Promise<YourOutput> {
    // Node logic here
  }
}
```

- **TypeId Format**: `{modId}.{NodeName}` (e.g., `core.ForwardNode`)
- **Auto-registration**: `@AnoraRegister` decorator registers to `NodeRegistry`

### Port Types

- **Primitive Ports**: `StringPort`, `NumberPort`, `BooleanPort`, `IntegerPort` (`src/mods/core/runtime/ports/`)
- **Container Ports**: `ArrayPort`, `ObjectPort` - hold nested ports
- **NullPort**: For exec ports or any-type data flow

### Custom Node Views

Register Vue components in mod's `init()`:

```typescript
registerNodeView('your-node-view', YourNodeView, ['your-mod.YourNode'])
```

## Backend Integration

ANORA supports multiple backends via `BackendNode` and `ExecutorContext.ipcTypeId`:

| Backend              | IPC Type | Use Case                          |
| -------------------- | -------- | --------------------------------- |
| `godot-wry`          | `wry`    | Godot integration via WRY webview |
| (planned) Python     | TBD      | Python scripting environment      |
| (planned) Playwright | TBD      | API recording/playback            |

`BackendNode.sendIpcMessage()` routes to the appropriate transport based on `ipcTypeId`.

## SubGraph System

SubGraphs allow nesting graphs as nodes. Data flow:

```
SubGraphNode.inPort → SubGraphEntryNode → [inner graph] → SubGraphExitNode → SubGraphNode.outPort
```

Key classes in `src/base/runtime/nodes/SubGraphNode.ts`:

- `SubGraphNode` - Container node with dynamic ports based on entry/exit nodes
- `SubGraphEntryNode` - Marks input points inside subgraph
- `SubGraphExitNode` - Marks output points inside subgraph

## Demo/Recording System

`src/base/runtime/demo/` provides operation recording for playback demos:

- `DemoRecorder` - Records node/edge add/remove, port value changes, iterations
- `DemoPlayer` - Replays recorded operations for visualization

This is a **playback-only** system—it records graph mutations and port states, not execution logic.

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

| File                                         | Purpose                              |
| -------------------------------------------- | ------------------------------------ |
| `src/base/runtime/nodes/BaseNode.ts`         | Node base class with ports, context  |
| `src/base/runtime/nodes/NodeTypes.ts`        | `WebNode` and `BackendNode`          |
| `src/base/runtime/nodes/SubGraphNode.ts`     | SubGraph implementation              |
| `src/base/runtime/executor/BasicExecutor.ts` | Graph execution engine               |
| `src/base/runtime/registry/AnoraRegister.ts` | `@AnoraRegister` decorator           |
| `src/stores/graph.ts`                        | Pinia store for graph/executor state |
| `src/base/ui/editor/GraphEditor.vue`         | Main editor component                |
| `src/mods/core/`                             | Reference mod implementation         |
| `src/mods/godot-wry/`                        | Godot backend integration mod        |

## Development Commands

```bash
npm run dev      # Start dev server with HMR
npm run build    # Type-check + production build
npm run lint     # ESLint with auto-fix
npm run format   # Prettier formatting
```

## Common Gotchas

- **Port data flow**: `write()` converts & stores, `read()` clears data, `peek()` preserves
- **Execution model**: Nodes declare readiness via `ActivationReadyStatus`, Executor iterates until no nodes ready
- **Direct-through nodes**: `ForwardNode` with `directThrough=true` executes immediately during propagation
- **Shallow reactivity**: `shallowRef` for Graph/Executor in stores—call `triggerRef()` after mutations
- **No tests yet**: Project is in active development/refactoring phase
