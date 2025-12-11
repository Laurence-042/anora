# ANORA Mods 开发指南

## 目录结构

每个 mod 应该有以下结构：

```
mods/
├── your-mod/
│   ├── index.ts          # Mod 入口，定义 ModDefinition 并自动注册
│   ├── locales/
│   │   ├── index.ts      # 导出 locale 对象
│   │   ├── en.ts         # 英文翻译
│   │   └── zh-CN.ts      # 中文翻译
│   ├── runtime/
│   │   ├── index.ts      # 导出节点和端口
│   │   ├── nodes/        # 节点实现
│   │   └── ports/        # 端口实现（可选）
│   └── ui/
│       └── nodes/        # 节点视图组件（可选）
```

## 创建新 Mod

### 1. 创建 Mod 入口 (index.ts)

```typescript
import type { ModDefinition } from '../ModRegistry'
import { ModRegistry } from '../ModRegistry'
import { registerNodeView } from '@/base/ui/registry'

// 导入 locale
import { yourModLocales } from './locales'

// 导入节点视图（如果有）
import YourNodeView from './ui/nodes/YourNodeView.vue'

// Runtime exports
export * from './runtime'
export * from './locales'

/**
 * Mod 定义
 */
export const yourModDef: ModDefinition = {
  id: 'your-mod',
  locales: yourModLocales,
  init() {
    // 注册自定义节点视图（可选）
    registerNodeView('your-node', YourNodeView, ['your-mod.YourNode'])
  },
}

// 自动注册到 ModRegistry
ModRegistry.register(yourModDef)
```

### 2. 创建 Locale 文件

**locales/en.ts:**

```typescript
export default {
  nodes: {
    'your-mod': {
      YourNode: 'Your Node',
    },
  },
  nodeCategories: {
    yourCategory: 'Your Category',
  },
  mods: {
    yourMod: 'Your Mod',
  },
}
```

**locales/zh-CN.ts:**

```typescript
export default {
  nodes: {
    'your-mod': {
      YourNode: '你的节点',
    },
  },
  nodeCategories: {
    yourCategory: '你的分类',
  },
  mods: {
    yourMod: '你的模块',
  },
}
```

**locales/index.ts:**

```typescript
import en from './en'
import zhCN from './zh-CN'

export const yourModLocales = {
  en,
  'zh-CN': zhCN,
}
```

### 3. 创建节点

**runtime/nodes/YourNode.ts:**

```typescript
import { WebNode } from '@/base/runtime/nodes'
import { AnoraRegister } from '@/base/runtime/registry'

@AnoraRegister('your-mod.YourNode')
export class YourNode extends WebNode<...> {
  static override meta = { icon: '🔧', category: 'yourCategory' }

  constructor(id?: string, label?: string) {
    super(id, label ?? 'YourNode')
    // 添加端口...
  }

  async activateCore(ctx, inData) {
    // 实现逻辑...
  }
}
```

### 4. 注册 Mod

在 `mods/index.ts` 中添加导入：

```typescript
// 加载所有 Mods
import './core'
import './godot-wry'
import './your-mod' // 添加这一行

// Re-export
export * from './core'
export * from './godot-wry'
export * from './your-mod' // 添加这一行
```

## 自动加载机制

1. **Mod 注册**: 每个 mod 在 `index.ts` 被导入时自动调用 `ModRegistry.register()`
2. **Locale 合并**: `i18n` 初始化时从 `ModRegistry.getMergedLocales()` 获取所有 mod 的翻译
3. **节点注册**: 节点通过 `@AnoraRegister` 装饰器自动注册到 `NodeRegistry`
4. **视图注册**: `initAllMods()` 调用每个 mod 的 `init()` 函数注册节点视图

## 注意事项

- Mod ID 应该唯一，推荐使用 kebab-case (如 `your-mod`)
- 节点 typeId 格式为 `{modId}.{NodeName}` (如 `your-mod.YourNode`)
- i18n key 格式为 `nodes.{modId}.{NodeName}` (如 `nodes.your-mod.YourNode`)
- 节点的 `static meta` 定义 icon 和 category
