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

整体项目结构可以参考如下形式，但并非绝对。以保证语义清晰且可扩展为优先，同时保证核心内容和Mod以相同方式提供以在底层就保证可扩展性，而非照搬如下可能不合适的结构

- src/
  - base/
    - runtime/ - ←- 可独立运行、无- UI- 耦合
      - nodes/
        - BaseNode.ts
        - BaseWebNode.ts
        - BaseBackendNode.ts
        - SubGraphNode.ts
      - ports/
        - BasePort.ts
      - executor/
        - BasicExecutor.ts
        - BasicContext.ts
      - registry/
        - BaseRegistry.ts
        - NodeRegistry.ts - ←- 子类自动注册、插件加载入口
        - PortRegistry.ts
        - ExecutorRegistry.ts
      - serialization/
        - DefaultSerializer.ts
    - ui/ - ←- Node/Port- 的视图层
      - components/
        - BaseNode.vue
        - BasePort.vue
      - composables/
        - ...
      - editor/
        - GraphView.vue
  - mods/ - ←- 内容扩展
    - core/ - ←- 核心内容同样作为mod提供，保持一致性
      - runtime/
        - nodes/
          - web-nodes/
            - ForwardNode.ts
          - backend-nodes/
            - WryNode.ts
        - ports/
          - StringPort.ts
        - executor/
          - LoggingExecutor.ts
      - ui/
        - nodes/
          - web-nodes/
            - ForwardNode.vue
          - backend-nodes/
            - WryNode.vue
        - ports/
          - StringPort.vue
    - \<other-mod-name\>/
      - runtime/
        - nodes/
          - web-nodes/
            - \<node-name\>.ts
          - backend-nodes/
            - \<node-name\>.ts
        - ports/
          - \<port-name\>.ts
        - executor/
          - \<executror-name\>.ts
      - ui/
        - nodes/
          - web-nodes/
            - \<node-name\>.vue
          - backend-nodes/
            - \<node-name\>.vue
        - ports/
          - \<port-name\>.vue

## 可定制的Executor

ANORA作为一个纯前端项目，它不仅提供展示还会提供计算框架，后端只需要实现后端节点对应的函数即可

Executor运算逻辑抽象如下，其中有些细节可能在Port、Node章节提及，这里只讲最普适、最核心的部分

- 每个节点相当于一个函数调用
  - 有多个入参（入port）和单个出参（出port）
  - port如果是复杂对象，可以通过点击port旁的开关展开，显示代表其属性的子port
  - 连接出入port表示传参

- 主流程
  1. 初始化，查询所有节点的可运行状态

  2. 执行已准备好（Activation-Ready）的节点

     - 检查当前用户是否要求停止
     - 节点的执行函数`activate`必定是异步的，执行器在执行时会在then中更新执行状态、发现新准备的好节点
     - 使用类似`await Promise.allSettled`同时启动当前迭代中的所有准备好的节点并等待其都执行完成，而非单独await每一个执行。同一个迭代中节点的执行顺序并不确定
       - 说使用`await Promise.allSettled`只是一个说明一个节点执行失败不能影响其他的示例，实际编程时应使用bluebird之类的提供的支持取消的promise类似概念，以支持用户在一个节点卡太久时想终止的情况
       - 当在这个时候终止时，当前所有未完成的节点视为执行失败
     - 将执行后节点的入Port清空（以此避免下一次激活时残留脏数据），统一检查这些执行后节点的准备状态，从执行后节点的所有出Port里取出数据填入其连接的另一节点的入Port（即使它的值为null或者ContainerPort内的子Port为null），查询其他受影响节点的准备状态

       - 如果节点执行失败，保留当前的状态供后续使用
         - 供用户在逻辑图上检查各个Port的值
  3. 重复2直到没有节点可以执行

- 用户可以指定从哪个节点启动（相当于Executor直接从其入边相连的前置节点重新把值写入它的入Port，如果之前没有执行过、用户也没也设置过前置节点的出Port值，那么节点启动后自然会因为入参不对报错，不用额外处理），以此避免普通程序每次都得完整调试的不便

- 需要注意的是，这个框架不要求逻辑图无环，它可以使用环结构来做类似周期性触发器之类的东西来长时间运行

  - 这也是ANORA执行一个迭代中使用异步，但迭代间使用同步的重要原因
  - 这也使ANORA不使用最大迭代次数来避免死循环的原因——这种周期触发器本质上和传统编程语言里的 while(true) do 同样是必要的死循环，用户在遭遇意外死循环时可以自行终止

- 逻辑图可以同时存在一对多和多对一

  - 一对多的情况下
    - 一个出Port的值可以推到所有与其相连的入Port
  - 多对一的情况下
    - 如果同一迭代中执行完成的一批节点出Port同时连接了下一个节点的父入Port和入Port的子入Port，先给父入Port赋值再给子入Port赋值
    - 如果同一迭代中执行完成的一批节点出Port同时连接了下一个节点的同一个入Port，覆盖顺序是不确定的，如果发生了这种情况（写入Port时发现入Port当前有非null的值）报个告警表示“这种情况会导致不可确定的覆盖顺序，进而导致逻辑图难以维护，不建议这么做”

ANORA支持继承Executor以修改/扩展运行逻辑，所以实现时需要合理分割函数功能便于重写

默认Executor使用context维护的全局状态中只包含如下必要信息，且只通过只读方法来为节点提供信息

- 后端类型

context和Executor并非强耦合，可以单独扩展。比如预期以后会实现的API录制回放场景中，只需要扩展context来保存cookie、persist-header之类的信息，而不必动executor。而在API分析场景中，就可以扩展executor来记录执行的节点的入参和出参，以此在执行完回放后自动生成OpenAPI 3.0接口定义文档，或者将逻辑图翻译成python代码，又或者翻译成其他低码项目的逻辑定义格式，以此实现无痛迁移

```typescript
enum ActivationReadyStatus {
  NOT_READY, // 需要Executor下一轮迭代再次询问是否准备好
  NOT_READY_UNTIL_ANY_PORTS_FILLED, // 需要Executor识别到其至少一个入Port被新写入数据后再次询问
  NOT_READY_UNTIL_ALL_PORTS_FILLED, // 需要Executor识别到其至少一个入Port被新写入数据，且此时其所有有入边的入Port都已经填写数据后再次询问
  READY, // 已经准备好运行，Executor下一轮迭代中可以执行它
}

interface ExecutorBasicContext {
  ipcTypeId: string
}

type ExecutorContext = ExecutorBasicContext & {
  [key: string]: any
}
```

Executor、Port的的注册机制请参考Node的`@AnoraRegister`

## 自适应的Port

Port是一个节点接收数据、发出数据最主要的途径

Port是强类型的，但它们内置数据转换

比如，入Port在被写入字符串数据时会尝试将字符串解析为数字，这让字符串类型的出Port支持直接连上数字类型的入Port

其支持的基础数据类型对标[OpenAPI 3.0](https://swagger.io/docs/specification/v3_0/data-models/data-types/)，但同样有些修改以适应实际工程。

- [`string`](https://swagger.io/docs/specification/v3_0/data-models/data-types/#strings)
  - 这个并没有对file的支持，同样没有二进制支持，二进制的传递需要base64编码解码，毕竟经常搞二进制的场景不适合使用ANORA这种以教育和简化编程为目的设计的前端，复杂内容都需要封装在节点内部

- [`number`](https://swagger.io/docs/specification/v3_0/data-models/data-types/#numbers)
- [`integer`](https://swagger.io/docs/specification/v3_0/data-models/data-types/#numbers)
- [`boolean`](https://swagger.io/docs/specification/v3_0/data-models/data-types/#boolean)
- [`array`](https://swagger.io/docs/specification/v3_0/data-models/data-types/#arrays)
  - 当一个port被写入array数据后，array内每个元素都会成为这个port的子port。默认状态（新初始化而非从序列化的快照中加载时）子port属性为空数组
  - array内部元素类型可以不同
- [`object`](https://swagger.io/docs/specification/v3_0/data-models/data-types/#objects)
  - 当一个port被写入object数据后，object内每个键值都会成为这个port的子port。默认状态（新初始化而非从序列化的快照中加载时）子port属性为空Map
  - object的key必须为string，value类型可以不同
  - 比如写入 `[1, "hello", true]`时其会有NumberPort、StringPort、BooleanPort三个子Port
- `null`（如果port把null作为预期类型，那么实际表示可以接受/输出任何类型数据。任何Port也都可以接受入null作为输入）

每种类型都有自己的Port类型，以此分别重写解析输入数据的方法，可维护地提供不同的解析逻辑

Port结构可以自行设计，其ID通过UUID生成。但考虑到根据Port查Node、父Port的需求，可以考虑将其所属的Node、父Port在初始化时作为属性传入，Port基类参考结构如下

```typescript
class BasePort{
    // UUID
    id: string
    
    // 反查所属节点
    parentNode: BaseNode
    
    // 反查所属父Port
    parentPort?: ContainerPort
    
    // 反查所属父Port中自己的key
    keyInParent?: string | number
}
```

array和object的Port需要使用相同的基类ContainerPort，使用key:number|string获取value、获取key列表之类的方法需要在ContainerPort一层实现。通过这种方式，在视图层就可以使用这些方法迭代渲染子Port。ContainerPort 展开后，子 port 可以独立连接。但需要注意需要分别实现ArrayPort和ObjectPort，这两个能接受的数据是互斥的

Port、子Port本质上只是Port间的组合，子Port并非单独的类型（不论是NumberPort还是ArratPort，都可以作为ObjectPort的子Port）。

为父port赋值会覆盖子port的值

- 相同key的子port
  - 类型一样直接赋值
  - 类型不同但能转换就转换类型后赋值
  - 否则报错

- key对应的port不存在会增加port，
- 某个port对应的key在赋的值中不存在
  - port存在连接：将值设为null
  - port不存在连接：删除port

被设为null时，只保留存在连接或子孙存在连接的Port

Port数据转换矩阵如下，行为待写入数据类型，列为port指定类型。

|         | string         | number            | integer         | boolean                       | array         | object   | null     |
| ------- | -------------- | ----------------- | --------------- | ----------------------------- | ------------- | -------- | -------- |
| string  | 直接赋值       | Number.parseFloat | Number.parseInt | str.toLowerCase() === "true"; | str.split("") | 不兼容   | 直接赋值 |
| number  | toString       | 直接赋值          | Math.floor      | !!num                         | 不兼容        | 不兼容   | 直接赋值 |
| integer | toString       | 直接赋值          | 直接赋值        | !!num                         | 不兼容        | 不兼容   | 直接赋值 |
| boolean | toString       | 0/1               | 0/1             | 直接赋值                      | 不兼容        | 不兼容   | 直接赋值 |
| array   | JSON.stringify | 不兼容            | 不兼容          | 不兼容                        | 直接赋值      | 不兼容   | 直接赋值 |
| object  | JSON.stringify | 不兼容            | 不兼容          | 不兼容                        | 不兼容        | 直接赋值 | 直接赋值 |
| null    | null           | null              | null            | null                          | null          | null     | null     |

需要注意，虽然Graph中建立边时会根据Port类型做校验来避免Port间数据传递问题，但不能保证节点运行时不会把不匹配的数据往出Port里写，也不能保证ContainerPort的子节点能正确赋值。

parseFloat/parseInt得到NaN视为转换失败

运行时不管哪个节点的入/出Port转换失败了，都就视为这个节点执行出错。

可供参考的序列化格式如下

```typescript
enum DataType{
    STRING="string",
    NUMBER="number",
    INTEGER="integer",
    BOOLEAN="boolean",
    ARRAY="array",
    OBJECT="object",
    NULL="null"
}

type RealDataType = string|number|boolean|object|null

type SerializedPort{
    dataType: DataType
	data: RealDataType
}
```

## 可扩展的Node

节点本质上是函数的抽象。节点最基础的数据结构为

```typescript
class BaseNode {
  // UUID
  id: string
  label: string

  // 执行Port，用于不需要传递数据但需要顺序执行的情况，数据类型是null。必选，因为不依赖输入的节点只有ParameterNode一种，而只要依赖输入就可能有控制执行顺序的需求
  inExecPort: AnoraPort
  outExecPort: AnoraPort

  // 控制Port，用于在特定情况下进行额外流程控制，大部分节点这俩都是空的。
  // 和inExecPort/inPorts不同，它们即便连接了入边且未被填写，在绝大多数情况下（基类实现）也不会导致节点不可执行。一些特例节点会在描述节点的同时介绍其激活模式
  inControlPorts: { [portName: string]: AnoraPort }
  outControlPorts: { [portName: string]: AnoraPort }

  // 入/出Port，相当于入/出参，节点初始化时也可以自行为其分配初始值来辅助用户进行object类型的连线
  inPorts: { [portName: string]: AnoraPort }
  outPorts: { [portName: string]: AnoraPort }
  // 上下文，便于节点实现在多次工作中的差异行为，也可以用于节点运行的静态配置（比如regex匹配器使用什么regex之类的）。考虑到维持整体精简和灵活性，动态数据和静态数据并未分离，需要实现特定节点时自己避免去写静态数据。子类中如果要用一般会重写它的类型为特定类型，保证开发中的类型安全
  context: any

  // 显示context中的配置问题、Port数据类型无法转换之类的节点特有的警告信息
  getConfigurationWarnings(): string[]

  // 表示节点是否可以激活并运行。Executor会在activate节点后询问其是否还可以运行，这种机制可以实现“一次激活，多次输出”的效果。在绝大多数情况下（基类实现）只有所有“被连接的”inExecPort和inPorts都被填入数据才会READY（如果没有任何inExecPort和inPorts被连接也算READY），其他时候都是NOT_READY_UNTIL_ALL_PORTS_FILLED。一些特例节点会在描述节点的同时介绍其激活模式
  isReadyToActivate(): ActivationReadyStatus

  // 节点激活逻辑，Executor调用它时会将全局context传入。其流程为：从入Port中读取并清空数据，将读到的数据作为参数调用activateCore得到处理后的数据，把处理后生成的数据填到出Port里。节点应且只应操作考虑到可维护性，通常不建议使用executorContext，除非节点运行真的依赖某种全局数据，且无法通过节点的局部缓存解决
  async activate(executorContext: ExecutorContext): void

  // 节点激活核心逻辑，可以理解成节点实际上包装的函数。子类通常会重写它的类型，保证开发中的类型安全
  async activateCore(executorContext: ExecutorContext, ...args: any[]): { [outPortName: string]: any }
}
```

节点就像是一个自动加工机

- inPorts就是原料入口，默认情况下它看到原料足够制造成品了就会开始工作，然后把成品放到成品出口inPorts
- inControlPorts就是加工机的模式设置面板，可以改变其工作模式来在多次启动中使用不同的逻辑
- outControlPorts就是加工机的状态显示面板，可以通过它来显示当前工作状态/进度
- inExecPort就是它的电源，如果没接线就说明它在用内置电源工作，有原料就加工；如果接了线就说明它不是用自己的内部电源工作了，这时候线没电它就不会动

节点继承关系如下

- `BaseNode`：基类
  - `WebNode`：可以直接在浏览器环境中运行的节点，其子类大多是预置的通用节点，以下是其中一些比较重要的
    - 中继`ForwardNode`：接受所有数据类型并原样输出，可以使用context指定是否应该在填写入Port的时候立刻执行并填写其后面的入Port（即设置“走默认的迭代”还是“直通”），默认非直通。这会是唯一支持直通的节点类型，Executor会为此做专门适配，以此避免用户怕延迟问题而不敢用它整理连线。通常用于整理图结构、作为MergeGate保证后续节点在同一个迭代中执行、缓存数据值、延迟迭代以控制节点执行时序等等（简单的功能，灵活的应用）
      - 直通：通常一个迭代的流程是：当前节点执行、将执行结果填到自己的出Port里、将出Port的数据推到与之相连的下一个节点的入Port。Executor在推完数据后，还会检查下目标入Port是不是直通Forward的，如果是，Executor会立刻执行这个直通Forward，然后再将其出Port的数据继续往后推，直到没有任何直通Forward的入Port被推数据。两个直通模式的Forward不允许组成环，这个在Graph中需要做检查
    - 参数`ParameterNode`：没有入Port，只有类型为null的出Port。可以使用string的context设置出Port的值，当可以解析为json时将json解析后的值写进出Port，否则作为字符串。如果在特殊情况下需要传递一个json-string，可以使用双引号包裹来强制其作为string写进出Port。因为没有任何inPort，所以当inExecPort没有被连接时在首个迭代就可以ready
    - 算术运算：可以使用context指定各种js支持的运算符（包含布尔）
    - 集合运算：可以使用context指定各种集合运算，比如并集、差集、交集
    - 排序：可以使用context指定默认key，会被入port的key覆盖（使用一阶数组作为key则按序取值比较），直接用lodash之类的排序。在ANORA的使用场景里不需要也不应该支持太复杂的排序
    - 取值：接受一个任意数据和一个key，支持数组中取特定位置的值，也支持在对象中取key对应的value
    - 分支：输入一个bool，按需激活true和false两个输出。通常用于逻辑分支
    - 分配：接受一个数组，然后在接下来的数次迭代中依次输出数组里的每个元素，并在它的outControlPort index输出索引，相当于for-each。当输出最后一个元素时，会同步激活它的outControlPort finish，来表示迭代完成（而outExecPort每输出一个元素都会激活一次）。需要重写isReadyToActivate（但可以调super来复用相同逻辑），激活条件是`还有元素待输出||默认条件`。通常用于循环
      - 这是个十分特殊的节点，它在一个迭代中激活后，即便它的in端没有任何Port被写入，它也会在下一个迭代激活并输出数组中的一个元素（比如第x个迭代用长度为y的数组arr激活了它，那么它在第x+i（i<y）个迭代中总是会激活并输出arr[i]）
      - 如果在还未完成输出的时候通过默认条件激活（即又往inPort输入了一个数组让它分配），那么它会丢弃这次inPort中输入的数组（比如第x个迭代用长度为y的数组arr激活了它，那么它在第x+y-1个迭代中即使inPort被输入了一个数组让它分配，它也只会丢掉输入继续专心输出arr[y-1]，然后在第x+y个迭代及之后如果没有新的输入，那么它就不会READY）
    - 聚集：inPort接受任意数据。有一个inControlPort aggregate，激活时将输入的数据加进缓存数组。inExecPort被激活后会将缓存数组输出，然后清空缓存。需要重写isReadyToActivate，激活条件是`aggregate被写入||inExecPort被写入`（两种激活的表现不一样，前者是累积数据，后者是将累积的数据作为数组输出），此时如果inPort输入的数据为null，就正常将null缓存进数组。往往和分配器共同使用，来实现filter、map、reduce之类的操作
      - 这也是个十分特殊的节点，它有两种激活模式，而且两种激活模式下表现不同
      - 它的两种激活模式都不是由inPorts的数据触发的
    - 比较`CompareNode`：两个有顺序的输入port和三个输出port，输出分别是gt、eq、lt。本质上是布尔的算术运算+分支的语法糖，通常用于逻辑分支
    - 文件读取：一个fileUploader，可以使用context决定文件内容是作为特定编码的字符串读取后输出（不设置的话需要能自动识别）还是作为二进制流读取并以base64编码后输出
  - `BackendNode`：需要调用后端功能的节点，Executor在执行它的时候，它从`executorContext`中获取当前IPC类型，然后使用对应的逻辑使用IPC与后端通信。默认提供的后端节点类型如下
    
    - API：用于调用Rest API
    - WRY：用于与godot-wry等基于tauri-wry的后端通讯
    
      - ### From JavaScript to Godot
    
        You can send messages from JavaScript to Godot using the [`ipc.postMessage()`](https://godot-wry.doceazedo.com/reference/javascript.html#ipc-postmessage) function in JavaScript.
    
        First, let's load some HTML with a button to send our message. Make sure to connect to the [`ipc_message`](https://godot-wry.doceazedo.com/reference/webview.html#ipc-message) so we can retrieve the response later:
    
        
    
        ```javascript
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
    
        TIP
    
        Notice that the message is sent as a JSON string. While any string would be valid, JSON makes it easier to identify message types and send complex data.
    
      - ### From Godot to JavaScript
    
        Similarly, you can also send messages from Godot to your web content using the method [`post_message()`](https://godot-wry.doceazedo.com/reference/webview.html#post-message) in GDScript.
    
        In this example, let's send a message when the player's health changes, so we can create a HUD with some simple HTML, CSS and JavaScript to display a health bar:
    
        
    
        ```javascript
        func update_player_health():
        	var message = {
        		"action": "update_health",
        		"health": 20
        	}
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
  - `SubGraphNode`：一个由逻辑图抽象得到的封装子图节点。它内部可以创建继承自中继节点的节点提供输入输出代理，这些子图输入输出节点会在封装后得到的子图节点上表现为Port。目前子图输入输出节点只需要直接继承中继节点即可，后续可能会扩展一些独有功能。当执行器执行子图节点时，它会实例化一个和自己一个类型的执行器来执行子图节点内部的子图。当内部执行器执行完成后，输出代理节点的出Port值就会被填到SubGraphNode的出Port。虽然执行器实例不共享（因为要做执行状态隔离），但执行器context在子图内外是共享的。实际上，在实现时，最外面的图就应该是一个没有输入输出代理节点的SubGraphNode，以此保证全局逻辑统一

节点类型间通过如下形式维护类型间继承关系，以此支持注册

```typescript
class BaseNode {
  static subclasses: (typeof Base)[] = []

  static registerSubclass(subclass: typeof Base) {
    // 注册到父类的 subclass 列表
    this.subclasses.push(subclass)
  }

  static getSubClasses(): (typeof Base)[] {
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
    // 注册用于在序列化、反序列化过程中保持类型对应关系的标识
    switch (matchDefType(constructor)) {
      case NODE:
        NodeRegistry.register(typeString, constructor)
        break
      case PORT:
        PortRegistry.register(typeString, constructor)
        break
      case EXECUTOR:
        ExecutorRegistry.register(typeString, constructor)
        break
      default:
        throw new Error(XXX)
    }
    if (isNode(constructor)) {
    }

    // 注册子类
    const parent = Object.getPrototypeOf(constructor)
    parent.registerSubclass(constructor)
  }
}

@AnoraRegister('BaseWebNode')
class BaseWebNode extends BaseNode {}

@AnoraRegister('BaseBackendNode')
class BaseBackendNode extends BaseNode {}

@AnoraRegister('ForwardNode')
class ForwardNode extends BaseWebNode {}
```

然后由NodeRegistry使用类似下面的思路加载Core和所有其他Mod的Node类，以完成注册

```typescript
import.meta.glob('./nodes/**/*.ts', { eager: true })
```

## 可序列化的Graph

`AnoraGraph`只需要维持port之间的连接关系，并支持序列化和反序列化以提供保存和加载功能（Node和Port本身也需要支持序列化和反序列化，避免将所有序列化反序列化堆在Graph层）

需要注意，本质上`AnoraGraph`是`SubGraphNode`的一个成员，本质上呈现给用户看到的图是顶层`SubGraphNode`，而非一个`AnoraGraph`

边没有专门设计单独的数据类型，它由Graph维护的连接关系体现。为了实现方便/可扩展性也可以考虑添加，但需要同时考虑执行/内存效率。

其预期会频繁执行以下操作（通常由Executor或者前端展开折叠Port触发查询），需要提供对应的方法，并保证方法性能尽可能在O(1)

- Port所属的Node
- 与出/入Port连接的另一端的的Port列表
- 与出/入Port及其子Port连接的另一端的Port列表
- 节点出、入Port另一端的节点列表

参考函数列表如下

```typescript
class AnoraGraph {
  // O(1) 查询
  getNodeByPort(port: BasePort): BaseNode
  getConnectedPorts(port: BasePort): BasePort[]
  getConnectedPortsIncludingChildren(port: BasePort): BasePort[]
  getUpstreamNodes(node: BaseNode): BaseNode[]
  getDownstreamNodes(node: BaseNode): BaseNode[]
  
  // 边操作
  addEdge(from: BasePort, to: BasePort): void
  removeEdge(from: BasePort, to: BasePort): void
  
  // 验证
  canConnect(from: BasePort, to: BasePort): boolean
}
```

Graph在创建边时会进行检查，检查项包括但不限于

- 不允许在先前`Port数据转换矩阵`中标注不兼容的port间建立边
- 两个直通模式的ForwardNode不允许直接组成环

虽然说是“可序列化的Graph”，但实际上序列化架构是"`DefaultSerializer`以`SubGraphNode`为单位控制整体序列化反序列化并提供`schema`版本号，各个类只控制必要的需要自己决定的序列化"，此处以“可序列化的Graph”为题单纯是强调逻辑图需要能导入导出，既不是说Graph是控制者，也不是说只需要序列化Graph而非包含它的`SubGraphNode`

序列化版本间迁移策略在开发阶段暂不考虑

# UI功能

- **撤销/重做**机制
- **节点/边的选择与批量操作**：Vue-Flow应该内置了相关功能
- **复制粘贴**功能
- **快捷键定义**：暂时先不支持Vue-Flow内置之外的快捷键
- **自动布局算法**的选择：elk

# 细节实现

- 与vue-flow解耦，使用AnoraNode初始化VueFlowNode。

- 同样出于解耦考虑，节点大小和位置都独立于AnoraNode存储

- 图总是从左向右，需要合适的自动排版功能

- 连线使用贝塞尔曲线

- ContainerPort可展开收起，以显示表示其内部元素的port

- 当两个连接的Port都未被折叠导致不可见时，连线是虚线且线段从出port到入port移动，否则是直线且有小圆形周期性从出port沿实线运动到入port（供 UI 实现参考，优先保证逻辑正确性。）

- SubGraphNodes双击可以展开，将内部图显示给用户，界面上方使用Breadcrumb 显示当前的子图栈

- 需要在运行时给当前激活的节点外框使用高光描线，并可以设置两个迭代之间的延迟（用于演示/调试）

- 运行后输出值会留在出Port上，以便用户主动激活其后面的某个节点来从中间继续运行（通常是用于调试）

- 需要提供从外部使用IPC控制Executor执行、状态快照、加载快照之类的功能（当前使用`window.addEventListener("message"...)`来实现）

  - ```typescript
    interface IPCMessage {
      type: 'execute' | 'pause' | 'resume' | 'stop' | 'snapshot' | 'loadSnapshot' | 'getState'
      payload?: any
    }
    ```
