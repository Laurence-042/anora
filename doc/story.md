[TOC]

# ANORA 项目说明书（整理版）

> ANORA = Anora's Not Only Recording API

---

## 1. 项目概述

### 1.1 定位

- **通用图形化编程前端**，兼容不同后端
- **高度可扩展的节点系统**
- 默认提供基于 Playwright 的 API 录制回放后端（演示用）

### 1.2 技术栈

TypeScript + Vue + Vue-Flow

### 1.3 当前目标

完善前端节点系统设计，暂不涉及后端录制功能

---

## 2. 核心架构

### 2.1 整体结构

```
Graph (边管理)
 └─ Nodes (函数抽象)
      └─ Ports (入参/出参)

Executor (执行控制)
 ├─ Inspect Graph
 └─ Manage Context
```

**执行逻辑与数据逻辑分离**：

- **Executor**：执行器，决定什么时候运行哪些节点
- **Port**：相当于入参出参
- **Node**：相当于函数
- **Graph**：维护不同 Node 的不同 Port 之间的连接关系

### 2.2 设计原则

- 执行逻辑与数据逻辑分离
- 核心内容与 Mod 以相同方式提供，保证底层可扩展性
- 语义清晰优先，而非照搬固定结构

---

## 3. Port 系统

### 3.1 基本概念

- Port 是节点接收/发出数据的**主要途径**
- **强类型**，但内置自动类型转换
- 支持嵌套（ContainerPort 可展开显示子 Port）
- 每种类型都有自己的 Port 类型，可分别重写解析输入数据的方法

### 3.2 数据类型

数据类型对标 [OpenAPI 3.0](https://swagger.io/docs/specification/v3_0/data-models/data-types/)，但有适应性修改：

| 类型      | 说明                                                                                           |
| --------- | ---------------------------------------------------------------------------------------------- |
| `string`  | 字符串，不支持二进制（需 base64 编码）。复杂内容应封装在节点内部                               |
| `number`  | 浮点数                                                                                         |
| `integer` | 整数                                                                                           |
| `boolean` | 布尔值                                                                                         |
| `array`   | 数组，元素类型可不同。写入后每个元素成为子 Port。默认状态子 Port 为空数组                      |
| `object`  | 对象，key 必须为 string，value 类型可不同。写入后每个键值成为子 Port。默认状态子 Port 为空 Map |
| `null`    | 表示可接受/输出**任意类型**数据。任何 Port 也都可以接受 null 作为输入                          |

### 3.3 类型转换矩阵

行为待写入数据类型，列为 Port 指定类型：

| 写入 ↓ / Port 类型 → | string         | number            | integer         | boolean                      | array         | object   | null     |
| -------------------- | -------------- | ----------------- | --------------- | ---------------------------- | ------------- | -------- | -------- |
| **string**           | 直接赋值       | Number.parseFloat | Number.parseInt | str.toLowerCase() === "true" | str.split("") | ❌不兼容  | 直接赋值 |
| **number**           | toString       | 直接赋值          | Math.floor      | !!num                        | ❌不兼容       | ❌不兼容  | 直接赋值 |
| **integer**          | toString       | 直接赋值          | 直接赋值        | !!num                        | ❌不兼容       | ❌不兼容  | 直接赋值 |
| **boolean**          | toString       | 0/1               | 0/1             | 直接赋值                     | ❌不兼容       | ❌不兼容  | 直接赋值 |
| **array**            | JSON.stringify | ❌不兼容           | ❌不兼容         | ❌不兼容                      | 直接赋值      | ❌不兼容  | 直接赋值 |
| **object**           | JSON.stringify | ❌不兼容           | ❌不兼容         | ❌不兼容                      | ❌不兼容       | 直接赋值 | 直接赋值 |
| **null**             | null           | null              | null            | null                         | null          | null     | null     |

**转换规则**：

- `parseFloat`/`parseInt` 返回 `NaN` 视为**转换失败**
- 运行时任何节点的入/出 Port 转换失败，都视为该节点**执行出错**
- Graph 建立边时会根据 Port 类型校验，但不能保证节点运行时不会写入不匹配数据

### 3.4 Port 基类结构

```typescript
class BasePort {
  id: string // UUID
  parentNode: BaseNode // 反查所属节点
  parentPort?: ContainerPort // 反查父 Port
  keyInParent?: string | number // 在父 Port 中的 key

  // 版本号机制：用于追踪数据是否是"新的"
  private _version: number = 0 // 每次 write 时递增
  private _lastReadVersion: number = 0 // 上次 read 时记录的版本号
}
```

Port ID 通过 UUID 生成。子 Port 并非单独的类型，NumberPort、ArrayPort 都可以作为 ObjectPort 的子 Port。

### 3.4.1 Port 数据操作

| 方法           | 行为                                                    | 用途                             |
| -------------- | ------------------------------------------------------- | -------------------------------- |
| `write(data)`  | 写入数据，`_version++`                                  | 上游节点推送数据                 |
| `read()`       | 返回数据，`_lastReadVersion = _version`，**不清空数据** | 节点执行时获取入参               |
| `peek()`       | 返回数据，不改变版本号                                  | 查看数据但不消费                 |
| `hasData()`    | 返回 `_data !== null \|\| _version > 0`                 | 检查是否有数据（包括旧数据）     |
| `hasNewData()` | 返回 `_version > _lastReadVersion`                      | 检查是否有新数据（未被 read 过） |
| `clear()`      | 清空数据并重置版本号                                    | 执行开始前重置状态               |

**关键设计**：`read()` 不清空数据，只标记数据已被消费。这使得 `activateOn` 触发时节点可以重用上一次的数据。

### 3.5 ContainerPort 规则

`ArrayPort` 和 `ObjectPort` 共用基类 `ContainerPort`，需要在 ContainerPort 层实现：

- 使用 `key: number | string` 获取 value
- 获取 key 列表
- 视图层可使用这些方法迭代渲染子 Port

**子 Port 连接**：ContainerPort 展开后，子 Port 可独立连接

**为父 Port 赋值时的规则**：

| 情况                       | 处理方式                         |
| -------------------------- | -------------------------------- |
| 相同 key，类型一样         | 直接赋值                         |
| 相同 key，类型不同但可转换 | 转换后赋值                       |
| 相同 key，类型不兼容       | **报错**                         |
| key 不存在                 | 新增自动推断类型的子 Port 并赋值 |
| 新值中无此 key，有连接     | 将值设为 null                    |
| 新值中无此 key，无连接     | 删除该 Port                      |

**设为 null 时**：只保留有连接或子孙有连接的 Port

### 3.6 序列化格式

```typescript
enum DataType {
  STRING = 'string',
  NUMBER = 'number',
  INTEGER = 'integer',
  BOOLEAN = 'boolean',
  ARRAY = 'array',
  OBJECT = 'object',
  NULL = 'null',
}

type RealDataType = string | number | boolean | object | null

interface SerializedPort {
  dataType: DataType
  data: RealDataType
}
```

---

## 4. Node 系统

### 4.1 基本概念

节点本质上是**函数的抽象**：

- 有多个入参（入 Port）和多个出参（出 Port）
- Port 如果是复杂对象，可以点击展开显示子 Port
- 连接出入 Port 表示传参

### 4.2 基类结构

```typescript
// 节点输入/输出/控制数据类型
type NodeInput = { [key: string]: unknown }
type NodeOutput = { [key: string]: unknown }
type NodeControl = { [key: string]: unknown }

// 泛型基类，通过类型参数约束 activateCore 的输入输出
abstract class BaseNode<TInput = NodeInput, TOutput = NodeOutput, TControl = NodeControl> {
  // 标识
  id: string // UUID
  label: string

  // 依赖 Port：用于不需要传递数据但需要顺序执行的情况，数据类型是 null
  // 连接后，节点必须等待此 Port 被写入才能激活（首次执行的硬性前置条件）
  inDependsOnPort: BasePort
  outDependsOnPort: BasePort

  // 激活 Port：用于可选的激活触发，数据类型是 null
  // 连接后，当此 Port 被写入时可以激活节点，但不参与首次激活的条件判断
  // 主要用于环结构中的反馈激活，避免死锁
  inActivateOnPort: BasePort
  outActivateOnPort: BasePort

  // 控制 Port：用于特定情况下的额外流程控制，大部分节点这俩都是空的
  // 与 inDependsOnPort/inPorts 不同，即便连接了入边且未被填写，
  // 在绝大多数情况下（基类实现）也不会导致节点不可执行
  inControlPorts: Map<string, BasePort>
  outControlPorts: Map<string, BasePort>

  // 数据 Port：相当于入/出参
  // 节点初始化时可自行分配初始值来辅助用户进行 object 类型的连线
  inPorts: Map<string, BasePort>
  outPorts: Map<string, BasePort>

  // 上下文：便于节点在多次工作中实现差异行为，也可用于静态配置
  // 动态数据和静态数据并未分离，需实现特定节点时自己避免写静态数据
  // 子类中如果要用一般会重写它的类型为特定类型，保证开发中的类型安全
  context: any

  // 显示 context 配置问题、Port 数据类型无法转换等节点特有的警告信息
  getConfigurationWarnings(): string[]

  // 表示节点是否可以激活并运行（由 Executor 调用）
  // connectedPorts 为 Executor 传入，表示当前被连接的 Ports 的 ID 列表
  // Executor 会在 activate 节点后询问其是否还可以运行，可实现"一次激活，多次输出"
  //
  // 基类实现（版本号机制）：
  //   - 有入边连接（不含 inActivateOnPort）：所有被连接的入 Port 都有**新数据**时 READY
  //   - 无入边连接（不含 inActivateOnPort）：只执行一次
  //   - inActivateOnPort 有新数据时：忽略"新数据"检查，只要有数据就 READY
  //
  // "新数据"定义：Port 的 version > lastReadVersion（即 write 后未被 read）
  //
  // 其他时候都是 NOT_READY_UNTIL_ALL_PORTS_FILLED
  // 子类可以覆盖此方法实现特殊激活规则（如 DistributeNode 的多次输出、AggregateNode 的双模式激活）
  isReadyToActivate(connectedPorts: Set<string>): ActivationReadyStatus

  // 节点激活逻辑，Executor 调用时传入全局 context
  // 流程：从入 Port read 数据（标记为已消费但不清空）→ 调用 activateCore → 把结果填到出 Port
  // 通常不建议使用 executorContext，除非节点运行真的依赖全局数据
  async activate(executorContext: ExecutorContext): void

  // 节点激活核心逻辑，可理解为节点实际包装的函数
  // 通过泛型参数获得类型安全，子类定义具体的输入输出类型
  abstract activateCore(
    executorContext: ExecutorContext,
    inData: TInput,
    controlData: TControl,
  ): Promise<TOutput>
}
```

### 4.3 节点比喻

节点就像一个**自动加工机**：

| 概念             | 比喻                                                                 |
| ---------------- | -------------------------------------------------------------------- |
| inPorts          | 原料入口，默认看到原料足够就开始工作，把成品放到 outPorts            |
| outPorts         | 成品出口                                                             |
| inControlPorts   | 模式设置面板，可改变工作模式在多次启动中使用不同逻辑                 |
| outControlPorts  | 状态显示面板，显示当前工作状态/进度                                  |
| inDependsOnPort  | 电源插座。未接线=内置电源，有原料就加工；接线=外部供电，线没电就不动 |
| inActivateOnPort | 遥控启动按钮。可以远程再次启动机器，用上次剩下的原料再加工一次       |

### 4.3.1 激活机制详解

**版本号机制**：每个入 Port 维护一个版本号，`write()` 时递增，`read()` 时记录已读版本。"新数据"指 write 后未被 read 过的数据。

**正常激活条件**：所有被连接的入 Port 都有**新数据**时，节点才会激活。

```
A ──→ C    // A 执行后推数据给 C，C 的 A 入口标记为"有新数据"
B ──→ C    // B 执行后推数据给 C，C 的 B 入口标记为"有新数据"
           // 此时 C 的两个入口都有新数据，C 激活
           // C 执行时 read 两个入口，标记为"已消费"（数据不清空）
```

**activateOn 的作用**：当 `inActivateOnPort` 收到新数据时，节点**忽略"新数据"检查**，只要入 Port 有数据（不管新旧）就可以激活。

```
           ┌──────────────────────────────────────────────┐
           │                                              ↓
待办列表 ──→ 获取元素 ──→ ... ──→ Branch.outDependsOn ──→ 获取元素.inActivateOn
           │
索引 ──────┘

// 第一次执行：待办列表和索引都推新数据，获取元素正常激活
// activateOn 触发时：待办列表没有推新数据，但入 Port 里还有上次的数据
// 因为 inActivateOnPort 有新数据，获取元素忽略"新数据"检查，用旧数据再次激活
```

**关键特性**：

- 入 Port 数据**不会被清空**，只是标记为"已消费"
- activateOn 让节点可以**重用上次的数据**
- 避免了环结构中"需要上游重新执行才能拿到数据"的问题

### 4.4 继承体系

```
BaseNode
├── WebNode (可直接在浏览器环境中运行，子类大多是预置的通用节点)
│   ├── ForwardNode (中继)
│   ├── ParameterNode (参数)
│   ├── ArithmeticNode (算术运算，context 指定运算符，包含布尔)
│   ├── SetOperationNode (集合运算：并集、差集、交集)
│   ├── SortNode (排序，context 指定默认 key，使用 lodash)
│   ├── GetValueNode (取值，支持数组位置和对象 key)
│   ├── BranchNode (分支，输入 bool，按需激活 true/false 两个输出)
│   ├── DistributeNode (分配/for-each)
│   ├── AggregateNode (聚集)
│   ├── CompareNode (比较，两个输入三个输出 gt/eq/lt)
│   └── FileReadNode (文件读取，context 决定编码或 base64)
├── BackendNode (需调用后端功能，从 executorContext 获取 IPC 类型)
│   ├── APINode (REST API 调用)
│   └── WRYNode (godot-wry 通讯)
└── SubGraphNode (封装子图)
```

### 4.5 特殊节点详解

#### 4.5.1 ForwardNode (中继)

接受所有数据类型并**原样输出**，可使用 `directThrough` 属性指定"直通"模式：

| 模式   | 行为                                                |
| ------ | --------------------------------------------------- |
| 非直通 | 走正常迭代流程                                      |
| 直通   | 填写入 Port 时立刻执行并填写后面的入 Port，不等迭代 |

**直通机制详解**：

通常一个迭代的流程是：当前节点执行 → 将执行结果填到出 Port → 将出 Port 数据推到下一个节点的入 Port

Executor 在推完数据后，还会检查目标节点是不是开启了直通模式的 ForwardNode：

- 如果是，Executor 会**立刻执行**这个直通 Forward
- 然后再将其出 Port 的数据继续往后推
- 直到没有任何直通 Forward 的入 Port 被推数据

**用途**：整理图结构、作为 MergeGate 保证后续节点在同一迭代中执行、缓存数据值、延迟迭代以控制执行时序

**限制**：两个直通模式的 Forward **不允许组成环**（Graph 中需要检查）

> **⚠️ 设计说明**：直通模式是 Executor 针对 ForwardNode 的**特殊处理**，而非通用机制。
> 这是有意为之的设计决策——如果将直通作为通用机制提供给所有节点类型，会导致：
>
> 1. **时序管理灾难**：任意节点都能在迭代中途触发执行，执行顺序将变得不可预测
> 2. **调试困难**：难以追踪数据流和执行顺序
> 3. **语义混乱**：节点的"执行"概念被稀释，违背"迭代"作为执行单元的设计
>
> ForwardNode 的直通之所以安全，是因为它**只做数据传递，不产生副作用**。

#### 4.5.2 ParameterNode (参数)

- **没有入 Port**，只有类型为 null 的出 Port
- 使用 string 的 context 设置出 Port 的值：
  - 可解析为 JSON 时：解析后的值写进出 Port
  - 否则：作为字符串
  - 特殊情况需传递 json-string：使用双引号包裹强制作为 string
- 因为没有任何 inPort，当 inDependsOnPort 没有被连接时**首个迭代就可以 READY**

#### 4.5.3 DistributeNode (分配)

接受一个数组，然后在接下来的**数次迭代**中依次输出每个元素，相当于 **for-each**：

- outPort `item`：输出当前元素
- outPort `index`：输出当前索引
- outControlPort `done`：输出最后一个元素时同步激活，表示迭代完成
- outDependsOnPort：每输出一个元素都会激活一次

**激活条件**：`还有元素待输出 || 默认条件`（需要重写 checkActivationReady）

**特殊行为**：

- 在一个迭代中激活后，即便 in 端没有任何 Port 被写入，下一个迭代也会激活并输出数组中的元素
- 例：第 x 个迭代用长度为 y 的数组 arr 激活，则第 x+i（i<y）个迭代中总是会激活并输出 arr[i]

**输出期间收到新数组**：丢弃新输入，继续当前输出

- 例：第 x 个迭代用长度为 y 的数组 arr 激活，第 x+y-1 个迭代即使 inPort 被输入新数组，也只会丢掉输入继续输出 arr[y-1]

#### 4.5.4 AggregateNode (聚集)

inPort 接受任意数据，有**两种激活模式**（需要重写 isReadyToActivate）：

| 激活条件                         | 行为                                      |
| -------------------------------- | ----------------------------------------- |
| inControlPort `aggregate` 被写入 | 将 inPort 数据加进缓存数组（null 也缓存） |
| inDependsOnPort 被写入           | 输出缓存数组，然后清空缓存                |

**特点**：两种激活模式都不是由 inPorts 的数据触发的

**用途**：往往和分配器共同使用，实现 filter、map、reduce 之类的操作

#### 4.5.5 SubGraphNode (封装子图)

由逻辑图抽象得到的封装子图节点：

- 内部可创建继承自中继节点的**输入输出代理节点**
- 这些代理节点会在封装后得到的子图节点上表现为 Port
- 目前子图输入输出节点只需直接继承中继节点，后续可能扩展独有功能

**执行机制**：

- 执行器执行子图节点时，会**实例化一个同类型的执行器**来执行内部子图
- 内部执行器执行完成后，输出代理节点的出 Port 值被填到 SubGraphNode 的出 Port
- 执行器实例**不共享**（执行状态隔离），但 executorContext 在子图内外是**共享的**

**设计统一性**：实现时，最外面的图就应该是一个没有输入输出代理节点的 SubGraphNode

### 4.6 注册机制

```typescript
class BaseNode {
  static subclasses: (typeof BaseNode)[] = []

  static registerSubclass(subclass: typeof BaseNode) {
    this.subclasses.push(subclass)
  }

  static getSubClasses(): (typeof BaseNode)[] {
    return this.subclasses.flatMap((sub) => [sub, ...sub.getAllDescendants()])
  }
}

enum DefType {
  NODE,
  PORT,
  EXECUTOR,
}

function AnoraRegister(typeString: string) {
  return function <T extends typeof BaseNode>(constructor: T) {
    // 1. 注册用于序列化/反序列化过程中保持类型对应关系的标识
    switch (matchDefType(constructor)) {
      case DefType.NODE:
        NodeRegistry.register(typeString, constructor)
        break
      case DefType.PORT:
        PortRegistry.register(typeString, constructor)
        break
      case DefType.EXECUTOR:
        ExecutorRegistry.register(typeString, constructor)
        break
      default:
        throw new Error('Unknown definition type')
    }

    // 2. 注册子类关系
    const parent = Object.getPrototypeOf(constructor)
    parent.registerSubclass(constructor)
  }
}

// 使用示例
@AnoraRegister('BaseWebNode')
class BaseWebNode extends BaseNode {}

@AnoraRegister('ForwardNode')
class ForwardNode extends BaseWebNode {}
```

**模块加载**：NodeRegistry 使用如下方式加载 Core 和所有其他 Mod 的 Node 类完成注册：

```typescript
import.meta.glob('./nodes/**/*.ts', { eager: true })
```

### 4.7 Port 名称常量

为避免硬编码字符串带来的维护问题，每个节点类型的 Port 名称应使用常量定义：

```typescript
// 通用 Port 名称
const CommonPorts = {
  VALUE: 'value',
  RESULT: 'result',
  LEFT: 'left',
  RIGHT: 'right',
} as const

// 节点特定 Port 名称（支持继承）
const ForwardNodePorts = {
  IN: { VALUE: CommonPorts.VALUE },
  OUT: { VALUE: CommonPorts.VALUE },
} as const

const DistributeNodePorts = {
  IN: { ARRAY: 'array' },
  OUT: { ITEM: 'item', INDEX: 'index' },
  OUT_CONTROL: { DONE: 'done' },
} as const

// 节点输入输出类型定义
interface ForwardInput {
  [ForwardNodePorts.IN.VALUE]: unknown
}

interface ForwardOutput {
  [ForwardNodePorts.OUT.VALUE]: unknown
}

// 使用示例：泛型节点类
class ForwardNode extends WebNode<ForwardInput, ForwardOutput> {
  constructor() {
    super()
    this.addInPort(ForwardNodePorts.IN.VALUE, DataType.STRING)
    this.addOutPort(ForwardNodePorts.OUT.VALUE, DataType.STRING)
  }

  async activateCore(ctx, inData: ForwardInput): Promise<ForwardOutput> {
    // inData[ForwardNodePorts.IN.VALUE] 类型安全
    return {
      [ForwardNodePorts.OUT.VALUE]: inData[ForwardNodePorts.IN.VALUE],
    }
  }
}

// 更复杂的示例：算术节点
interface ArithmeticInput {
  [ArithmeticNodePorts.IN.LEFT]: number
  [ArithmeticNodePorts.IN.RIGHT]: number
}

interface ArithmeticOutput {
  [ArithmeticNodePorts.OUT.RESULT]: number
}

class ArithmeticNode extends WebNode<ArithmeticInput, ArithmeticOutput> {
  async activateCore(ctx, inData: ArithmeticInput): Promise<ArithmeticOutput> {
    // inData.left 和 inData.right 已经是 number 类型，无需手动转换
    const left = inData[ArithmeticNodePorts.IN.LEFT]
    const right = inData[ArithmeticNodePorts.IN.RIGHT]
    return { [ArithmeticNodePorts.OUT.RESULT]: left + right }
  }
}
```

**设计原则**：

- 使用 `as const` 确保类型安全
- 通用名称（如 `value`, `result`）定义在 `CommonPorts` 中复用
- 节点特定的 Port 名称按 `IN`/`OUT`/`IN_CONTROL`/`OUT_CONTROL` 分组
- 子类可继承父类的 Port 名称常量
- **使用泛型参数约束 `activateCore` 的输入输出类型**，避免冗余的类型检查和转换

---

## 5. Graph 系统

### 5.1 职责

`AnoraGraph` 只需要：

- 维持 Port 之间的**连接关系**
- 支持**序列化和反序列化**以提供保存和加载功能

Node 和 Port 本身也需要支持序列化/反序列化，避免将所有序列化逻辑堆在 Graph 层。

### 5.2 与 SubGraphNode 的关系

- `AnoraGraph` 是 `SubGraphNode` 的一个**成员**
- 用户看到的顶层图本质上是一个没有输入输出代理节点的 `SubGraphNode`，而非 `AnoraGraph`

### 5.3 边的设计

边没有专门设计单独的数据类型，由 Graph 维护的连接关系体现。

为了实现方便/可扩展性也可以考虑添加，但需同时考虑执行/内存效率。

### 5.4 核心接口

以下操作会频繁执行（通常由 Executor 或前端展开折叠 Port 触发），需要保证性能尽可能在 **O(1)**：

```typescript
class AnoraGraph {
  // O(1) 查询
  getNodeByPort(port: BasePort): BaseNode // Port 所属的 Node
  getConnectedPorts(port: BasePort): BasePort[] // 与出/入 Port 连接的另一端的 Port 列表
  getConnectedPortsIncludingChildren(port: BasePort): BasePort[] // 包含子 Port
  getUpstreamNodes(node: BaseNode): BaseNode[] // 节点入 Port 另一端的节点列表
  getDownstreamNodes(node: BaseNode): BaseNode[] // 节点出 Port 另一端的节点列表

  // 边操作
  addEdge(from: BasePort, to: BasePort): void
  removeEdge(from: BasePort, to: BasePort): void

  // 验证
  canConnect(from: BasePort, to: BasePort): boolean
}
```

### 5.5 连接验证规则

Graph 在创建边时会进行检查，检查项包括但不限于：

1. **不允许**在类型转换矩阵中标注"不兼容"的 Port 间建立边
2. 两个直通模式的 ForwardNode **不允许直接组成环**

### 5.6 序列化架构

虽然说是"可序列化的 Graph"，但实际序列化架构是：

- `DefaultSerializer` 以 `SubGraphNode` 为单位控制整体序列化/反序列化，并提供 schema 版本号
- 各个类只控制必要的、需要自己决定的序列化

此处强调"可序列化的 Graph"单纯是因为逻辑图需要能导入导出，既不是说 Graph 是控制者，也不是说只需要序列化 Graph 而非包含它的 SubGraphNode。

**版本迁移策略**：开发阶段暂不考虑

---

## 6. Executor 系统

### 6.1 定位

ANORA 作为一个**纯前端项目**,它不仅提供展示还会提供计算框架，后端只需要实现后端节点对应的函数即可。

### 6.2 状态管理

#### 6.2.1 执行器状态（ExecutorState）

使用 `ExecutorStateMachine` 管理执行器生命周期：

```typescript
enum ExecutorState {
  Idle, // 空闲，可以开始新的执行
  Running, // 连续运行中
  Paused, // 暂停中
  Stepping, // 单步执行中
}
```

#### 6.2.2 完成原因（FinishReason）

执行结束时的原因分类：

```typescript
enum FinishReason {
  Completed, // 正常完成（无更多节点可执行）
  Cancelled, // 用户取消
  Error, // 执行出错
}
```

#### 6.2.3 节点激活状态（ActivationReadyStatus）

```typescript
enum ActivationReadyStatus {
  NOT_READY, // 需要 Executor 下一轮迭代再次询问
  NOT_READY_UNTIL_ANY_PORTS_FILLED, // 至少一个入 Port 被新写入数据后再询问
  NOT_READY_UNTIL_ALL_PORTS_FILLED, // 至少一个入 Port 被写入，且所有有入边的入 Port 都被填写后再询问
  READY, // 已准备好，Executor 下一轮迭代中可执行
}
```

### 6.3 主流程

#### 1. 初始化

查询所有节点的可运行状态

#### 2. 执行已准备好（Activation-Ready）的节点

1. **检查停止请求**：检查当前用户是否要求停止或暂停

2. **并行执行**：
   - 节点的执行函数 `activate` 必定是**异步的**
   - 使用类似 `await Promise.allSettled` 同时启动当前迭代中所有准备好的节点并等待完成
   - 同一个迭代中节点的执行顺序**并不确定**
   - 支持**取消**操作，终止时当前所有未完成的节点视为执行失败

3. **执行后处理**：
   - 统一检查这些执行后节点的准备状态（主要用于`DistributeNode`这类在激活后的多个迭代都会保持READY的节点）
   - 从执行后节点的所有出 Port 里取出数据填入其连接的另一节点的入 Port
     - 即使值为 null 或 ContainerPort 内的子 Port 为 null 也要填入
     - 写入会使目标入 Port 的 `_version` 递增，标记为"新数据"
     - **传播完成后清空 outPort**，防止下次迭代时重复传播
   - **特殊处理直通节点**：如果目标节点是 `directThrough=true` 的 ForwardNode，立即执行并继续传播
   - 查询其他受影响节点的准备状态

> **设计说明**：
>
> - **入 Port**：数据不会被清空，通过版本号机制判断是否是新数据。这使得 `activateOn` 触发时，节点可以重用上次执行后保留的入 Port 数据。
> - **出 Port**：传播后立即清空。防止类似 Branch 节点的两个分支在下一迭代都被视为有数据，导致下游节点被错误激活。

4. **失败处理**：
   - 如果节点执行失败，**保留当前状态**供后续使用
   - 供用户在逻辑图上检查各个 Port 的值

#### 3. 重复步骤 2 直到没有节点可以执行

### 6.4 执行模式

执行器支持多种运行模式：

```typescript
enum ExecutionMode {
  Continuous, // 连续执行直到完成
  StepByStep, // 单步执行（每次迭代后暂停）
}
```

### 6.5 事件系统

执行器通过事件系统通知外部组件执行状态变化：

```typescript
enum ExecutorEventType {
  Start, // 执行开始
  Iteration, // 新迭代开始
  NodeStart, // 节点开始执行
  NodeComplete, // 节点执行完成
  DataPropagate, // 数据传播（边上的数据传输）
  Complete, // 执行完成
  Cancelled, // 执行被取消
  Error, // 执行出错
}
```

事件订阅：

```typescript
executor.on((event: ExecutorEvent) => {
  // 处理事件
})
```

### 6.6 特性

#### 指定起始节点

用户可以指定从哪个节点启动：

- 相当于 Executor 直接从其入边相连的前置节点重新把值写入它的入 Port
- 如果之前没有执行过、用户也没设置过前置节点的出 Port 值，节点启动后会因为入参不对报错（不用额外处理）
- 目的：避免普通程序每次都得完整调试的不便

#### 支持环

这个框架**不要求逻辑图无环**，可以使用环结构做类似周期性触发器的东西来长时间运行：

- 这是 ANORA 执行一个迭代中使用异步、但**迭代间使用同步**的重要原因
- 这也是 ANORA **不使用最大迭代次数来避免死循环**的原因
- 这种周期触发器本质上和传统编程语言里的 `while(true)` 同样是必要的死循环
- 用户在遭遇意外死循环时可以自行终止

#### 一对多和多对一

逻辑图可以同时存在一对多和多对一：

| 情况   | 处理方式                                                                                                                                                                                            |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 一对多 | 一个出 Port 的值可以推到所有与其相连的入 Port                                                                                                                                                       |
| 多对一 | 同一迭代中执行完成的一批节点出 Port 同时连接下一节点的父入 Port 和子入 Port 时，**先给父入 Port 赋值再给子入 Port**，可以用非直通中继节点来保证父子入 Port 相连的出 Port 对应的节点在同一迭代中执行 |
| 多对一 | 同一迭代中执行完成的一批节点出 Port 同时连接同一个入 Port 时，覆盖顺序**不确定**，报告警                                                                                                            |

多对一覆盖警告："这种情况会导致不可确定的覆盖顺序，进而导致逻辑图难以维护，不建议这么做"

### 6.7 可扩展性

ANORA 支持**继承 Executor** 以修改/扩展运行逻辑：

- `BasicExecutor`：基础执行器，提供标准的迭代执行逻辑
- `ReplayExecutor`：回放执行器，用于演示模式，按时间轴重放录制的事件

扩展示例：

- 实现时需要合理分割函数功能便于重写
- 可重写 `executeOneIteration()` 改变单次迭代行为
- 可重写事件发射逻辑添加自定义监控

### 6.8 Context

```typescript
type ExecutorContext = {
  ipcTypeId: string // 后端类型
  iterationDelay?: number // 迭代间延迟（毫秒，用于调试）
  [key: string]: unknown // 其他的可能由节点访问的属性
}
```

默认 Executor 使用 context 维护的全局状态只包含必要信息，且只通过**只读方法**为节点提供信息。

**Context 与 Executor 解耦**，可单独扩展：

| 扩展场景     | 扩展方式                                                                          |
| ------------ | --------------------------------------------------------------------------------- |
| API 录制回放 | 扩展 Context 保存 cookie、persist-header 等信息，不必动 Executor                  |
| API 分析     | 扩展 Executor 记录执行节点的入参和出参，生成 OpenAPI 3.0 文档或翻译成 Python 代码 |

---

## 7. Demo/Replay 系统

### 7.1 设计思路

Demo 系统用于录制和回放图的执行过程，主要用于**演示和教学**场景。

核心设计：

- 录制 Executor 发出的事件序列（带时间戳）
- 回放时使用 `ReplayExecutor` 重放这些事件
- 前端组件订阅事件，录制和回放使用**相同的 UI 更新逻辑**

### 7.2 录制格式

```typescript
interface DemoRecording {
  version: '2.0.0'
  metadata: {
    createdAt: string
    duration: number
    totalEvents: number
  }
  initialGraph: SerializedGraph // 初始图状态
  events: TimestampedEvent[] // 带时间戳的事件序列
}

interface TimestampedEvent {
  timestamp: number // 相对时间（ms）
  event: SerializedExecutorEvent // 序列化的执行器事件
}
```

### 7.3 回放功能

`ReplayExecutor` 提供以下能力：

- **时间轴播放**：按录制时的时间间隔重放事件
- **播放速度控制**：支持 0.5x ~ 4x 速度
- **时间跳转**：`seekToTime(timeMs)` 跳转到指定时间点
- **关键帧聚合**：`getKeyframes(intervalMs)` 按时间间隔聚合事件
- **状态重建**：`getStateAtIndex(index)` 获取指定时刻的 UI 状态

### 7.4 UI 特性

回放视图（`ReplayView.vue`）提供：

- 进度条显示（支持拖动）
- 关键帧标记（13ms 间隔）
- 播放/暂停/单步/重启控制
- 速度选择（0.5x / 1x / 1.5x / 2x / 4x）
- 平滑进度动画（requestAnimationFrame）
- **无顶部工具栏**（适合嵌入外部系统）

### 7.5 IPC 控制

回放模式支持通过 IPC 消息进行外部控制，详见 [IPC 控制文档](./replay-ipc-guide.md)。

---

## 8. 项目结构

以保证语义清晰且可扩展为优先，同时保证核心内容和 Mod 以相同方式提供：

```
src/
├── base/
│   ├── runtime/                    # ← 可独立运行、无 UI 耦合
│   │   ├── nodes/
│   │   │   ├── BaseNode.ts
│   │   │   ├── NodeTypes.ts        # WebNode & BackendNode
│   │   │   └── SubGraphNode.ts
│   │   ├── ports/
│   │   │   ├── BasePort.ts
│   │   │   └── NullPort.ts
│   │   ├── executor/
│   │   │   ├── BasicExecutor.ts
│   │   │   └── BasicContext.ts
│   │   ├── demo/                   # ← 录制与回放
│   │   │   ├── DemoRecorder.ts
│   │   │   ├── DemoPlayer.ts       # ReplayExecutor
│   │   │   └── types.ts            # DemoRecording format
│   │   ├── graph/
│   │   │   └── AnoraGraph.ts
│   │   └── registry/
│   │       ├── BaseRegistry.ts
│   │       ├── AnoraRegister.ts    # @AnoraRegister decorator
│   │       ├── NodeRegistry.ts
│   │       ├── PortRegistry.ts
│   │       └── ExecutorRegistry.ts
│   └── ui/                         # ← Node/Port 的视图层
│       ├── components/
│       │   ├── BaseNodeView.vue
│       │   ├── BasePortView.vue
│       │   └── EdgeView.vue
│       ├── composables/
│       │   ├── useGraph.ts
│       │   ├── useExecutor.ts
│       │   ├── useIPC.ts           # Base IPC controller
│       │   ├── useReplayIPC.ts     # Replay-specific IPC
│       │   └── useDemo.ts
│       ├── editor/
│       │   ├── GraphEditor.vue
│       │   ├── NodePalette.vue
│       │   ├── ExecutorControls.vue
│       │   ├── RecordingControls.vue
│       │   └── Breadcrumb.vue
│       └── registry/
│           └── NodeViewRegistry.ts
├── mods/                           # ← 内容扩展
│   ├── core/                       # ← 核心节点作为 mod
│   │   ├── runtime/
│   │   │   ├── nodes/
│   │   │   │   ├── ForwardNode.ts
│   │   │   │   ├── BranchNode.ts
│   │   │   │   ├── CompareNode.ts
│   │   │   │   ├── ArithmeticNode.ts
│   │   │   │   ├── AggregateNode.ts
│   │   │   │   ├── DistributeNode.ts
│   │   │   │   ├── ConsoleLogNode.ts
│   │   │   │   └── ...
│   │   │   └── ports/
│   │   │       ├── StringPort.ts
│   │   │       ├── NumberPort.ts
│   │   │       ├── BooleanPort.ts
│   │   │       ├── IntegerPort.ts
│   │   │       ├── ArrayPort.ts
│   │   │       └── ObjectPort.ts
│   │   ├── ui/
│   │   │   └── nodes/              # Custom node views (if any)
│   │   └── locales/
│   │       ├── en.ts
│   │       └── zh-CN.ts
│   └── godot-wry/                  # ← Godot 后端集成
│       ├── runtime/
│       │   └── nodes/
│       │       └── GodotNode.ts    # BackendNode example
│       └── locales/
│           ├── en.ts
│           └── zh-CN.ts
├── stores/
│   └── graph.ts                    # Pinia store for graph/executor state
├── views/
│   ├── EditorView.vue              # Main editor
│   ├── DemoView.vue                # Recording mode
│   └── ReplayView.vue              # Playback mode (no toolbar)
└── router/
    └── index.ts
```

**关键设计：**

- `base/runtime/` 完全无 UI 依赖，可在 Node.js 环境运行
- `base/ui/` 提供 Vue 组件和 composables
- Mod 通过 `@AnoraRegister` 装饰器自动注册节点
- Mod 使用 Vite glob import 自动发现，无需手动导入

---

## 9. UI 功能

### 9.1 基础交互

- **撤销/重做**机制（基于 Vue-Flow）
- **节点/边的选择与批量操作**：Vue-Flow 内置功能
- **复制粘贴**功能
- **快捷键定义**：使用 Vue-Flow 内置快捷键
- **自动布局算法**：使用 ELK

### 9.2 视觉设计

- 图总是**从左向右**，需要合适的自动排版功能
- 连线使用**贝塞尔曲线**
- ContainerPort 可**展开/收起**，显示表示其内部元素的 Port
- 连线样式：
  - 两端 Port 都**可见**：实线，选中时高亮，小圆形周期性从出 Port 沿实线运动到入 Port
  - 任一 Port 被**折叠不可见**：虚线，选中时高亮，线段从出 Port 到入 Port 移动

### 9.3 SubGraph 交互

- **双击**可以展开，将内部图显示给用户
- 界面上方使用 **Breadcrumb** 显示当前的子图栈

### 9.4 调试功能

- 运行时给当前激活的节点外框使用**高光描线**
- 可设置两个迭代之间的**延迟**（用于演示/调试）
- 运行后输出值会**留在出 Port 上**，便于用户主动激活后面某个节点从中间继续运行

### 9.5 IPC 接口

ANORA 支持从外部使用 IPC 控制 Executor 执行、状态快照、加载快照等功能。

**架构设计：**

- `useIPC()` - 基础 IPC 控制器（window.postMessage + godot-wry 桥接）
- `useReplayIPC()` - 回放模式专用 IPC 扩展

**通信方式：**

```typescript
// 接收消息
window.addEventListener('message', (event) => {
  const msg = event.data
  console.log(`Received: ${msg.type}`, msg.data)
})

// 发送消息
window.postMessage({ type: 'response', data: { ... } }, '*')
```

**详细文档：** 见 [IPC 控制文档](./replay-ipc-guide.md)

---

## 10. 与 Vue-Flow 解耦

- 使用 AnoraNode 初始化 VueFlowNode
- 节点大小和位置都**独立于 AnoraNode 存储**

---

## 11. BackendNode 示例：WRY

用于与 godot-wry 等基于 tauri-wry 的后端通讯。

### 11.1 JavaScript → Godot

使用 `ipc.postMessage()` 发送消息：

```javascript
// 前端发送
function sendToGodot() {
  ipc.postMessage(
    JSON.stringify({
      action: 'update_score',
      score: 100,
      player: 'Player1',
    }),
  )
}
```

```gdscript
# Godot 接收
func _ready():
    $WebView.connect("ipc_message", self, "_on_ipc_message")
    $WebView.load_html("""
        <button onclick="sendToGodot()">Send data to Godot</button>
        <script>
            function sendToGodot() {
                ipc.postMessage(JSON.stringify({
                    action: "update_score",
                    score: 100,
                    player: "Player1"
                }));
            }
        </script>
    """)

func _on_ipc_message(message):
    var data = JSON.parse_string(message)
    if data.action == "update_score":
        print("Updating score for %s to %d" % [data.player, data.score])
        # TODO: handle the data in your game...
```

> **TIP**: 消息作为 JSON 字符串发送。虽然任何字符串都有效，但 JSON 更便于识别消息类型和发送复杂数据。

### 11.2 Godot → JavaScript

使用 `post_message()` 发送消息：

```gdscript
# Godot 发送
func update_player_health():
    var message = {"action": "update_health", "health": 20}
    $WebView.post_message(JSON.stringify(message))

func _ready():
    $WebView.load_html("""
        <progress id="healthBar" value="42" max="100"></progress>
        <script>
            document.addEventListener("message", (event) => {
                const data = JSON.parse(event.detail);
                if (data.action == "update_health") {
                    const healthBar = document.getElementById("healthBar");
                    healthBar.value = data.health;
                }
            });
        </script>
    """)
```
