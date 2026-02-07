# Apps Workspace

该目录承载 Electron 桌面版的所有子应用源码：

- `apps/main`: 主设置界面（Vue 3 + Vite）
- `apps/window`: 对话窗口界面（Vue 3 + Vite）
- `apps/fast-window`: 快捷输入条（原生 HTML/JS）
- `apps/backend`: 预加载与桥接逻辑（esbuild）

构建建议统一在仓库根目录执行：

```bash
pnpm run install:all
pnpm build
```
