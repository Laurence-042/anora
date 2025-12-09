import { DefType } from '../types'
import { NodeRegistry } from './NodeRegistry'
import type { NodeConstructor } from './NodeRegistry'
import { PortRegistry } from './PortRegistry'
import type { PortConstructor } from './PortRegistry'
import { ExecutorRegistry } from './ExecutorRegistry'
import type { ExecutorConstructor } from './ExecutorRegistry'
import { BaseNode } from '../nodes/BaseNode'
import { BasePort } from '../ports/BasePort'
import { BasicExecutor } from '../executor/BasicExecutor'

// 各类型的构造函数签名
// Node: (id?: string, label?: string) => BaseNode<any, any, any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NodeAnyConstructor = new (id?: string, label?: string) => BaseNode<any, any, any>
// Port: (parentNode, parentPort?, keyInParent?) => BasePort
/* eslint-disable @typescript-eslint/no-explicit-any */
type PortAnyConstructor = new (
  parentNode: any,
  parentPort?: any,
  keyInParent?: string | number,
) => BasePort
/* eslint-enable @typescript-eslint/no-explicit-any */
// Executor: () => BasicExecutor
type ExecutorAnyConstructor = new () => BasicExecutor

// 统一的构造函数类型（联合类型）
type AnyConstructor = NodeAnyConstructor | PortAnyConstructor | ExecutorAnyConstructor

/**
 * 判断定义类型
 */
function matchDefType(constructor: AnyConstructor): DefType {
  // 检查原型链
  let proto = constructor.prototype

  while (proto) {
    if (proto.constructor === BaseNode || proto instanceof BaseNode) {
      return DefType.NODE
    }
    if (proto.constructor === BasePort || proto instanceof BasePort) {
      return DefType.PORT
    }
    if (proto.constructor === BasicExecutor || proto instanceof BasicExecutor) {
      return DefType.EXECUTOR
    }
    proto = Object.getPrototypeOf(proto)
  }

  // 通过构造函数名推断
  const name = constructor.name
  if (name.endsWith('Node')) return DefType.NODE
  if (name.endsWith('Port')) return DefType.PORT
  if (name.endsWith('Executor')) return DefType.EXECUTOR

  throw new Error(`Cannot determine definition type for ${name}`)
}

/**
 * TC39 Stage 3 装饰器上下文类型
 */
interface ClassDecoratorContext {
  kind: 'class'
  name: string | undefined
  addInitializer(initializer: () => void): void
}

/**
 * ANORA 注册装饰器（TC39 Stage 3 新语法）
 * 用于自动注册 Node、Port、Executor 类型
 *
 * @example
 * ```typescript
 * @AnoraRegister('ForwardNode')
 * class ForwardNode extends WebNode {}
 * ```
 */
export function AnoraRegister(typeString: string) {
  return function <T extends AnyConstructor>(target: T, _context: ClassDecoratorContext): T | void {
    // 新装饰器语法中，可以直接返回修改后的类或不返回（保持原类）
    const defType = matchDefType(target)

    switch (defType) {
      case DefType.NODE:
        NodeRegistry.register(typeString, target as unknown as NodeConstructor)
        // 设置静态 typeId
        ;(target as unknown as typeof BaseNode).typeId = typeString
        // 注册子类关系
        const nodeParent = Object.getPrototypeOf(target)
        if (nodeParent && typeof nodeParent.registerSubclass === 'function') {
          nodeParent.registerSubclass(target)
        }
        break

      case DefType.PORT:
        PortRegistry.register(typeString, target as unknown as PortConstructor)
        break

      case DefType.EXECUTOR:
        ExecutorRegistry.register(typeString, target as unknown as ExecutorConstructor)
        break

      default:
        throw new Error(`Unknown definition type for ${typeString}`)
    }

    // 不返回表示保持原类不变
  }
}
