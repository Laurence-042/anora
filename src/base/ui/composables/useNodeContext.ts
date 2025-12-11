/**
 * useNodeContext - 节点 context 字段的响应式绑定
 *
 * 提供统一的方式将 UI 输入绑定到节点 context 字段：
 * 1. 创建响应式 ref，自动同步节点 context
 * 2. 变更时自动触发节点事件（用于执行和边检查）
 * 3. 支持值转换（如字符串 -> 枚举）
 */
import { ref, watch, onUnmounted, type Ref, type ComputedRef } from 'vue'
import { useGraphStore } from '@/stores/graph'

/**
 * Context 字段选项
 */
export interface ContextFieldOptions<T, R = T> {
  /**
   * context 中的字段名
   */
  field: string

  /**
   * 从 context 读取值时的转换函数
   * @default (v) => v
   */
  fromContext?: (value: unknown) => T

  /**
   * 写入 context 前的转换函数
   * @default (v) => v
   */
  toContext?: (value: T) => R

  /**
   * 默认值（当 context 字段不存在时使用）
   */
  defaultValue?: T
}

/**
 * Context 字段返回类型
 */
export interface ContextFieldRef<T> {
  /**
   * 响应式值引用
   * 可直接用于 v-model
   */
  value: Ref<T>

  /**
   * 手动保存当前值到 context
   * 通常不需要调用，值变更会自动保存
   */
  save: () => void
}

/**
 * 节点类型约束 - 只需要有 context 相关方法即可
 * 使用宽松的类型以兼容各种 TContext 泛型
 */
interface NodeWithContext {
  id: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getContextField(field: any): any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setContextField(field: any, value: any): void
  onContextChange(
    listener: (event: {
      nodeId: string
      field: string
      oldValue: unknown
      newValue: unknown
    }) => void,
  ): () => void
}

/**
 * 创建节点 context 字段的响应式绑定
 *
 * @param node 节点 ref 或 computed
 * @param options 字段配置
 * @returns 响应式字段引用
 *
 * @example
 * ```ts
 * // 简单字段
 * const { value: editValue } = useContextField(node, { field: 'value', defaultValue: '' })
 *
 * // 带转换的枚举字段
 * const { value: operation } = useContextField(node, {
 *   field: 'operation',
 *   defaultValue: ArithmeticOperation.Add,
 * })
 * ```
 */
export function useContextField<T, R = T>(
  node: Ref<NodeWithContext> | ComputedRef<NodeWithContext>,
  options: ContextFieldOptions<T, R>,
): ContextFieldRef<T> {
  const { field, fromContext, toContext, defaultValue } = options
  const graphStore = useGraphStore()

  // 从 context 读取初始值
  const readFromContext = (): T => {
    const raw = node.value.getContextField(field)
    if (raw === undefined) {
      return defaultValue as T
    }
    return fromContext ? fromContext(raw) : (raw as T)
  }

  // 创建响应式值
  const fieldValue = ref<T>(readFromContext()) as Ref<T>

  // 写入 context 的函数
  const writeToContext = (value: T): void => {
    const converted = toContext ? toContext(value) : value
    node.value.setContextField(field, converted)
  }

  // 监听值变化，自动写入 context
  const stopValueWatch = watch(
    fieldValue,
    (newValue) => {
      writeToContext(newValue)
    },
    { deep: true },
  )

  // 监听节点 context 变更事件，处理外部变更
  const unsubscribe = node.value.onContextChange((event) => {
    if (event.field === field) {
      const newValue = fromContext ? fromContext(event.newValue) : (event.newValue as T)
      // 避免循环更新
      if (fieldValue.value !== newValue) {
        fieldValue.value = newValue
      }

      // 触发边兼容性检查
      graphStore.checkNodeEdgesCompatibility(event.nodeId)
    }
  })

  // 监听节点切换（如果 node ref 发生变化）
  const stopNodeWatch = watch(
    () => node.value,
    () => {
      fieldValue.value = readFromContext()
    },
  )

  // 清理
  onUnmounted(() => {
    stopValueWatch()
    stopNodeWatch()
    unsubscribe()
  })

  return {
    value: fieldValue,
    save: () => writeToContext(fieldValue.value),
  }
}

/**
 * 批量创建多个 context 字段绑定
 *
 * @param node 节点 ref 或 computed
 * @param fields 字段配置映射
 * @returns 字段名 -> 响应式值的映射
 *
 * @example
 * ```ts
 * const fields = useContextFields(node, {
 *   value: { field: 'value', defaultValue: '' },
 *   type: { field: 'type', defaultValue: 'string' },
 * })
 *
 * // 使用: fields.value.value, fields.type.value
 * ```
 */
export function useContextFields<T extends Record<string, ContextFieldOptions<unknown, unknown>>>(
  node: Ref<NodeWithContext> | ComputedRef<NodeWithContext>,
  fields: T,
): {
  [K in keyof T]: ContextFieldRef<T[K] extends ContextFieldOptions<infer V, unknown> ? V : unknown>
} {
  const result: Record<string, ContextFieldRef<unknown>> = {}

  for (const [name, options] of Object.entries(fields)) {
    result[name] = useContextField(node, options)
  }

  return result as {
    [K in keyof T]: ContextFieldRef<
      T[K] extends ContextFieldOptions<infer V, unknown> ? V : unknown
    >
  }
}

export default useContextField
