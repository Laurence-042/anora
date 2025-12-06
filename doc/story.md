[TOC]

# 背景

这是一个名为ANORA（Anora’s Not Only Recording API）的图形化编程项目的前端，这个项目设计上应该是一个兼容不同后端的通用图形化编程前端，且其节点系统具备高度可扩展性。同时，ANORA会提供一个默认的node后端，提供基于playwright的API调用录制与回放，用于演示其使用场景。

当前核心任务是完善 ANORA 前端节点系统设计，暂时不需要主动涉及后端录制功能；

当前技术栈为 TypeScript + Vue + Vue-Flow 。

# 架构

其执行逻辑和数据逻辑分离，执行由专门的Executor控制

- Executor：执行器，决定哪些时候运行哪些节点

其实体从底层到顶层（非严格顺序）为

- Port：相当于入参出参
- Node：相当于函数
- Graph：维护不同Node的不同Port之间的连接关系

```
Graph
 └─ Nodes
      └─ Ports
Executor
 ├─ Inspect Graph
 └─ Manage Context
```



## 可定制的Executor

ANORA作为一个纯前端项目，它不仅提供展示还会提供计算框架，后端只需要实现后端节点对应的函数即可

其默认Executor的运算逻辑抽象如下

- 每个节点相当于一个函数调用
  - 有多个入参（入port）和单个出参（出port）
  - port如果是复杂对象，可以通过点击port旁的开关展开，显示代表其属性的子port
  - 连接出入port表示传参
- 执行时分多次迭代，每次迭代都会找“声称自己已准备激活（Activation-Ready）”的节点执行，其流程为
  1. 初始化，查询所有节点的可运行状态
  2. 执行已准备好的节点，从执行后节点的出Port里取出数据填入其连接的另一节点的入Port
  3. 查询上一步执行的节点的准备状态，查询其他受影响节点的准备状态
  4. 重复2、3直到没有节点可以执行
- 需要注意的是，这个框架不要求逻辑图无环，它可以使用环结构来做类似周期性触发器之类的东西来长时间运行

ANORA支持继承Executor以修改/扩展运行逻辑，所以实现时需要合理分割函数功能便于重写

默认Executor使用context维护的全局状态中只包含节点准备状态、运行状态、后端类型之类的必要信息。

context和Executor并非强耦合，可以单独扩展。比如预期以后会实现的API录制回放场景中，只需要扩展context来保存cookie、persist-header之类的信息，而不必动executor。而在API分析场景中，就可以扩展executor来记录执行的节点的入参和出参，以此在执行完回放后自动生成OpenAPI 3.0接口定义文档，或者将逻辑图翻译成python代码，又或者翻译成其他低码项目的逻辑定义格式，以此实现无痛迁移

```typescript
enum ActivationReadyStatus{
    NOT_READY,  // 需要Executor下一轮迭代再次询问是否准备好
    NOT_READY_UNTIL_ANY_PORTS_FILLED,  // 需要Executor识别到其至少一个入Port被新写入数据后再次询问
    NOT_READY_UNTIL_ALL_PORTS_FILLED,  // 需要Executor识别到其至少一个入Port被新写入数据，且此时其所有入Port都已经填写数据后再次询问
    READY  // 已经准备好运行，Executor下一轮迭代中可以执行它
}

interface ExecutorBasicContext{
    ipcTypeId: string
}

type ExecutorContext = ExecutorBasicContext & {
  [key: string]: any;
};
```



## 自适应的Port

Port是一个节点接收数据、发出数据最主要的途径

Port是强类型的，但它们内置数据转换

比如，入Port在被写入字符串数据时会尝试将字符串解析为数字，这让字符串类型的出Port支持直接连上数字类型的入Port

其支持的基础数据类型对标[OpenAPI 3.0](https://swagger.io/docs/specification/v3_0/data-models/data-types/)，但同样有些修改以适应实际工程

- [`string`](https://swagger.io/docs/specification/v3_0/data-models/data-types/#strings) 
  - 这个并没有对file的支持，同样没有二进制支持，二进制的传递需要base64编码解码，毕竟经常搞二进制的场景不适合使用ANORA这种以教育和简化编程为目的设计的前端，复杂内容都需要封装在节点内部

- [`number`](https://swagger.io/docs/specification/v3_0/data-models/data-types/#numbers)
- [`integer`](https://swagger.io/docs/specification/v3_0/data-models/data-types/#numbers)
- [`boolean`](https://swagger.io/docs/specification/v3_0/data-models/data-types/#boolean)
- [`array`](https://swagger.io/docs/specification/v3_0/data-models/data-types/#arrays)
  - 当一个port被写入array数据后，array内每个元素都会成为这个port的子port

- [`object`](https://swagger.io/docs/specification/v3_0/data-models/data-types/#objects)
  - 当一个port被写入object数据后，object内每个键值都会成为这个port的子port

- `null`（port的值为null时视为未填入数据，此时取值也会取到null。如果port把null作为预期类型，那么实际表示可以接受/输出任何类型数据）

每种类型都有自己的Port类型，以此分别重写解析输入数据的方法，可维护地提供不同的解析逻辑

array和object的Port需要使用相同的基类ContainerPort，使用key:number|string获取value、获取key列表之类的方法需要在ContainerPort一层实现

## 可扩展的Node

节点本质上是函数的抽象。节点最基础的数据结构为

```typescript
class AnoraNode {
    id: string
    label: string
    
    // 执行Port，用于不需要传递数据但需要顺序执行的情况
    inExecPort: AnoraPort
    outExecPort: AnoraPort
    
    // 控制Port，用于在特定情况下进行额外流程控制，大部分节点这俩都是空的。
    // 和inExecPort/inPorts不同，它们即便连接了入边且未被填写，默认也不会导致节点不可执行
    inControlPorts: {[portName:string]:AnoraPort}
    outControlPorts: {[portName:string]:AnoraPort}
    
    // 入Port，相当于入参
    inPorts: {[portName:string]:AnoraPort}
    // 出Port，相当于出参
    outPorts: {[portName:string]:AnoraPort}
    // 上下文，便于节点实现在多次工作中的差异行为，也可以用于节点运行的静态配置（比如regex匹配器使用什么regex之类的）。考虑到维持整体精简和灵活性，动态数据和静态数据并未分离，需要实现特定节点时自己避免去写静态数据。子类中如果要用一般会重写它的类型为特定类型，保证开发中的类型安全
    context: any
    
    // 显示context中的配置问题、Port数据类型无法转换之类的节点特有的警告信息
    getConfigurationWarnings():string[]
    
    // 表示节点是否可以激活并运行。Executor会在activate节点后询问其是否还可以运行，这种机制可以实现“一次激活，多次输出”的效果。基类中只有所有被连接的inExecPort和inPorts都被填入数据才会READY，其他时候都是NOT_READY_UNTIL_ALL_PORTS_FILLED
    isReadyToActivate():ActivationReadyStatus
    
    // 节点激活逻辑，Executor调用它时会将全局context传入。其流程为：从入Port中读取并清空数据，将读到的数据作为参数调用activateCore得到处理后的数据，把处理后生成的数据填到出Port里。考虑到可维护性，通常不建议使用executorContext，除非节点运行真的依赖某种全局数据，且无法通过节点的局部缓存解决
    activate(executorContext:ExecutorContext):void
    
    // 节点激活核心逻辑，可以理解成节点实际上包装的函数。子类通常会重写它的类型，保证开发中的类型安全
    activateCore(executorContext:ExecutorContext, ...args:any[]):{[outPortName:string]:any}
}
```

节点继承关系如下

- `AnoraNode`：基类
  - `AnoraWebNode`：可以直接在浏览器环境中运行的节点，其子类大多是预置的通用节点，以下是其中一些比较重要的
    - 中继：接受所有数据类型并原样输出，可以使用context指定是否应该在填写入Port的时候立刻执行并填写其后面的入Port（即设置“走默认的迭代”还是“直通”），默认非直通。这会是唯一支持直通的节点类型，Executor会为此做专门适配，以此避免用户怕延迟问题而不敢用它整理连线。通常用于整理图结构、缓存数据值、延迟迭代以控制节点执行时序等等（简单的功能，灵活的应用）
    - 算术运算：可以使用context指定各种js支持的运算符（包含布尔）
    - 集合运算：可以使用context指定各种集合运算，比如并集、差集、交集
    - 排序：可以使用context指定默认key，会被入port的key覆盖（使用一阶数组作为key则按序取值比较），直接用lodash之类的排序。在ANORA的使用场景里不需要也不应该支持太复杂的排序
    - 取值：接受一个任意数据和一个key，支持数组中取特定位置的值，也支持在对象中取key对应的value
    - 分支：输入一个bool，按需激活true和false两个输出。通常用于逻辑分支
    - 分配：接受一个数组，然后在接下来的数次迭代中依次输出数组里的每个元素，并在它的outControlPort index输出索引，相当于for-each。当输出最后一个元素时，会同步激活它的outControlPort finish，来表示迭代完成（而outExecPort每输出一个元素都会激活一次）。通常用于循环
    - 聚集：接受任意数据，同时有一个inControlPort aggregate，激活时将输入的数据加进缓存数组。inExecPort被激活后会将缓存数组输出，然后清空缓存。往往和分配器共同使用，来实现filter、map、reduce之类的操作
    - 比较：两个有顺序的输入port和三个输出port，输出分别是gt、eq、lt。本质上是布尔的算术运算+分支的语法糖，通常用于逻辑分支
    - 文件读取：一个fileUploader，可以使用context决定文件内容是作为特定编码的字符串读取后输出（不设置的话需要能自动识别）还是作为二进制流读取并以base64编码后输出
  - `AnoraBackendNode`：需要调用后端功能的节点，Executor在执行它的时候，它从`executorContext`中获取当前IPC类型，然后使用对应的逻辑使用IPC与后端通信。默认提供的后端节点类型如下
    - API：用于调用Rest API
    - WRY：用于与godot-wry等基于tauri-wry的后端通讯
  - `SubGraphNode`：一个由逻辑图抽象得到的封装子图节点。它内部可以创建继承自中继节点的节点提供输入输出代理，这些子图输入输出节点会在封装后得到的子图节点上表现为Port。目前子图输入输出节点只需要直接继承中继节点即可，后续可能会扩展一些独有功能。SubGraph 执行必须是 **可暂停、可返回、不破坏外部执行状态** 的。当执行器执行子图节点时，它会使用类似调用栈的方式，暂存外部的执行状态，然后执行子图节点里的图。执行器context在子图内外是共享的。实际上，在实现时，最外面的图就应该是一个没有输入输出代理节点的SubGraphNode，以此保证全局逻辑统一

## 可序列化的Graph

`AnoraGraph`只需要维持port之间的连接关系，并支持序列化和反序列化以提供保存和加载功能（Node和Port本身也需要支持序列化和反序列化，避免将所有序列化反序列化堆在Graph层）

Executor会频繁问Graph哪个节点的哪个Port另一边是哪个节点的哪个Port，正反查都有可能，所以这里需要注意性能优化

# 细节实现

- 与vue-flow解耦，使用AnoraNode初始化VueFlowNode
- 图总是从左向右，需要合适的自动排版功能
- 连线使用贝塞尔曲线
- ContainerPort可展开收起，以显示表示其内部元素的port
- 当两个连接的Port都未被折叠导致不可见时，连线是虚线且线段从出port到入port移动，否则是直线且有小圆形周期性从出port沿实线运动到入port（供 UI 实现参考，优先保证逻辑正确性。）
- SubGraphNodes双击可以展开，将内部图显示给用户，界面上方使用Breadcrumb 显示当前的子图栈
- 需要在运行时给当前激活的节点外框使用高光描线，并可以设置两个迭代之间的延迟（用于演示/调试）
- 运行后输出值会留在出Port上，以便用户主动激活其后面的某个节点来从中间继续运行（通常是用于调试）
- 需要提供从外部使用IPC控制Executor执行、状态快照、加载快照之类的功能（当前使用`window.addEventListener("message"...)`来实现）

