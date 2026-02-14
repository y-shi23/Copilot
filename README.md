# ✨ Sanft - 你的定制化 AI Agent 🚀

> **随时随地，便捷召唤 AI！支持 MCP 与 Skill 技能库，将 AI 从简单的"聊天机器人"升级为能够执行复杂任务的"全能AI助手"。**

<p align="center">
  <img src="https://img.shields.io/badge/Electron-Desktop-blue?style=flat-square&logo=electron" alt="Electron Desktop">
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/Vue-3.5-brightgreen?style=flat-square&logo=vue.js" alt="Vue 3">
</p>

Sanft 是一款基于 **Electron** 的深度定制化 AI 助手桌面应用。它不仅仅是一个聚合 API 的聊天窗口，更是一个集成了 **MCP 工具调用**、**Skill 流程编排**、**多模态交互** 以及 **WebDAV 数据同步** 的生产力平台。

无论是日常的划词翻译、变量命名、OCR、文件总结，还是基于 MCP 和 SKILL 的智能爬虫、自动化工作流，它都能成为你最得力的助手。同时，Sanft 也可作为 AI 服务商的集成平台，或个人提示词的理想存储与管理工具。

> **📌 历史说明**：本项目最初为 uTools 插件开发，现已独立为 Electron 桌面应用，无需依赖 uTools 即可运行。

---

## 📸 功能预览

### 🚀 极速交互模式

**快捷输入**：极速启动的悬浮条。适用于划词翻译、变量命名等"阅后即焚，快捷输入"的轻量级任务。支持流式打字机效果，任务结束后自动销毁。

![快捷输入模式](image/快捷输入模式-深色.gif)

### 💬 独立对话窗口

**独立窗口**：功能完整的对话界面。支持多轮对话、文件拖拽、图片粘贴、语音交互，打造自定义Agent，支持自定义背景。

![独立窗口模式](image/独立对话窗口界面.gif)
![自定义背景图片](image/背景图片示例.png)

### ⚡ 全局快捷启动器

**全局唤出**：默认 `Ctrl+Shift+Space`（macOS 为 `Command+Shift+Space`）唤出输入框。

* 输入关键词实时匹配你在应用内注册的快捷助手
* 支持直接输入文本执行，或粘贴图片 / 拖拽文件后执行对应助手
* 支持在「设置 -> 通用设置」中启用/关闭并自定义快捷键

---

## 💡 核心特性

### 🧠 真正的智能 Agent (MCP 支持)

打破 AI 与物理世界的隔阂。通过引入 **[Model Context Protocol (MCP)](https://modelcontextprotocol.io/)**，Sanft 让 AI 拥有了"双手"：

* **内置强力工具**：开箱即用，无需配置即可支持 **Python 代码执行**、**全能文件操作** (读/写/搜索/正则替换)、**终端命令执行** (Bash/PowerShell)、**联网搜索** (DuckDuckGo)。
* **无限扩展**：兼容社区成千上万的 MCP 服务 (Stdio/HTTP/SSE)。
* **安全可控**：支持人工审批机制，高风险操作需确认。

![MCP管理界面](image/MCP管理界面.png)

### 📚 Skill 技能库 (SOP 编排)

如果 MCP 是手，Skill 就是 AI 的"大脑"。

* **SOP 标准化**：将复杂的任务（如代码审查规范、周报生成模板）封装成技能包。
* **子智能体模式 (Sub-Agent)**：对于复杂任务，Sanft 可以启动一个独立的 Agent 专注执行该技能，主对话流仅接收最终结果。

![SKILL下载示例](image/skill下载示例.gif)

### ☁️ 数据与隐私

* **WebDAV 同步**：支持坚果云、Nextcloud 等 WebDAV 服务，实现多台电脑间的配置与对话记录秒级同步。
* **本地隐私优先**：对话记录默认存储在本地 JSON 文件中，支持自动保存。

![云端对话管理页面](image/对话管理界面.png)

---

## 📖 界面概览

<details>
<summary><b>🖱️ 点击展开更多界面截图</b></summary>

|             快捷助手管理             |            服务商配置            |
| :-----------------------------------: | :-------------------------------: |
| ![快捷助手界面](image/快捷助手界面.png) | ![服务商页面](image/服务商界面.png) |

|           设置中心           |
| :---------------------------: |
| ![设置界面](image/设置界面.png) |

</details>

---

## 📚 详细文档

我们为不同模块提供了详尽的文档，帮助你挖掘 Sanft 的潜力：

| 模块                   | 说明                                                              | 文档链接                        |
| :--------------------- | :---------------------------------------------------------------- | :------------------------------ |
| **历史对话**     | 管理本地与云端对话记录，自动清理与导出。                          | [查看文档](./docs/chat_doc.md)     |
| **快捷助手**     | 学习创建不同类型的助手（文本/截图/文件），设置窗口行为。          | [查看文档](./docs/ai_doc.md)       |
| **MCP 服务**     | **(高阶)** 配置 Python 环境，启用内置工具，接入第三方服务。 | [查看文档](./docs/mcp_doc.md)      |
| **Skill 技能库** | **(高阶)** 编写 SOP，创建SKILL，支持子智能体模式。         | [查看文档](./docs/skill_doc.md)    |
| **服务商管理**   | 配置多模型、负载均衡及自定义模型参数。                            | [查看文档](./docs/provider_doc.md) |
| **设置与同步**   | 全局设置、语音配置及 WebDAV 云同步教程。                          | [查看文档](./docs/setting_doc.md)  |

*所有文档均可以在设置页面左上角的使用指南中查看*

---

## 🛠️ 开发者指南

如果你想参与 Sanft 的开发，或者想自己编译修改版，请参考以下指南。

### 技术栈

| 层级 | 技术 |
| :--- | :--- |
| **桌面框架** | Electron 30.x |
| **前端框架** | Vue 3.5 + Vite 7.x |
| **UI 组件** | Element Plus 2.x |
| **状态管理** | Vue Reactivity API |
| **国际化** | vue-i18n |
| **MCP 适配** | @langchain/mcp-adapters |
| **打包工具** | electron-builder |

### 项目结构

```text
Sanft/
├── apps/
│   ├── backend/        # 后端逻辑 (Node.js)，处理文件读写、MCP连接、Preload脚本
│   │   └── src/
│   │       ├── preload.js           # 主窗口预加载脚本
│   │       ├── window_preload.js    # 对话窗口预加载脚本
│   │       ├── fast_window_preload.js # 快捷输入条预加载脚本
│   │       ├── utools_shim.js       # uTools API 兼容层
│   │       ├── mcp.js               # MCP 客户端管理
│   │       ├── mcp_builtin.js       # 内置 MCP 工具
│   │       ├── skill.js             # Skill 技能库管理
│   │       └── runtime/             # 运行时模块
│   ├── main/           # 主界面前端 (Vue 3 + Element Plus)，用于设置、管理配置
│   │   └── src/
│   │       ├── components/          # Vue 组件 (Chats, Prompts, Mcp, Skills, Providers, Setting)
│   │       ├── locales/             # 国际化文件 (zh, en, ja, ru)
│   │       └── App.vue              # 主应用入口
│   ├── window/         # 独立对话窗口前端 (Vue 3 + Element Plus)，核心交互区
│   │   └── src/
│   │       └── components/          # 对话组件 (ChatHeader, ChatInput, ChatMessage 等)
│   └── fast-window/    # 快捷输入条前端 (原生 HTML/JS)，轻量级交互
├── electron/           # Electron 主进程与 IPC 桥接
│   ├── main.js         # 主进程入口，窗口管理、全局快捷键、IPC 通信
│   └── launcher_preload.js # 全局启动器预加载脚本
├── build/              # 打包资源 (图标等)
├── docs/               # 项目文档
├── scripts/            # 构建与工具脚本
├── runtime/            # 统一运行目录（构建产物）
│   ├── main/           # 主界面构建产物
│   ├── preload.js      # 预加载脚本构建产物
│   └── plugin.json     # uTools 插件配置（兼容模式）
└── release/            # 打包输出目录
```

### 开发环境搭建

请确保你的环境已安装 `Node.js` (>= 18.x) 和 `pnpm`。

#### 🚀 一键启动（推荐）

macOS / Linux 用户可使用一键启动脚本：

```bash
git clone https://github.com/your-username/Sanft.git
cd Sanft
chmod +x dev.sh
./dev.sh
```

脚本支持以下选项：

| 选项             | 说明                                   |
| :--------------- | :------------------------------------- |
| `--skip-install` | 跳过依赖安装（已安装过时使用）         |
| `--skip-build`   | 跳过构建步骤（直接启动已构建的应用）   |
| `--rebuild`      | 强制重新构建（清理 dist 目录后再构建） |
| `-h, --help`     | 显示帮助信息                           |

```bash
# 常用示例
./dev.sh                  # 完整流程：安装 → 构建 → 启动
./dev.sh --skip-install   # 跳过安装，直接构建并启动
./dev.sh --skip-build     # 跳过构建，直接启动（需已构建过）
```

#### 📝 手动构建步骤

如果你更喜欢手动控制每一步，或使用 Windows 系统：

1. **克隆项目**

   ```bash
   git clone https://github.com/your-username/Sanft.git
   cd Sanft
   ```

2. **安装全部依赖**

   ```bash
   pnpm install
   pnpm run install:all
   ```

3. **构建桌面版运行资源**

   ```bash
   pnpm build
   ```

   该命令会自动完成：
   - `apps/main` 前端构建
   - `apps/window` 前端构建
   - `apps/backend` preload 构建
   - 构建产物同步到 `runtime/`

4. **启动 Electron 桌面版**

   ```bash
   pnpm start
   ```

5. **打包安装包（可选）**

   ```bash
   pnpm dist
   ```

   打包产物将输出到 `release/` 目录，支持：
   - **Windows**: NSIS 安装包、便携版
   - **macOS**: DMG、ZIP
   - **Linux**: AppImage、DEB

### 开发模式（热重载）

开发模式下会启动 Vite 开发服务器，支持前端热重载：

```bash
./dev.sh
```

这会同时启动：
- Main 界面 Vite 服务器 (端口 5173)
- Window 界面 Vite 服务器 (端口 5174)
- Backend 预加载脚本监视模式
- Electron 主进程

### 核心架构说明

#### uTools 兼容层 (`utools_shim.js`)

为了保持与原 uTools 插件的兼容性，项目实现了一个 uTools API 兼容层：

- **数据存储**: 使用本地 JSON 文件替代 uTools 数据库，存储在 `userData/utools-shim/` 目录
- **窗口管理**: 通过 Electron IPC 实现多窗口创建、管理
- **系统交互**: 剪贴板、通知、文件对话框等功能

#### MCP 客户端 (`mcp.js`)

支持两种连接模式：
- **持久连接**: 保持长连接，适合高频使用的服务（最多 5 个）
- **即用即走**: 临时连接，用完即关闭，适合低频服务

#### Skill 系统 (`skill.js`)

支持两种执行模式：
- **直接模式**: 返回指令给主对话执行
- **子智能体模式 (Fork)**: 启动独立 Agent 执行复杂任务

---

## 💡 推荐 API 资源

如果你还没有 API Key，可以尝试以下渠道：

1. **AI Studio (Google Gemini)**: [免费申请](https://aistudio.google.com/apikey) (需配合支持 Gemini 转 OpenAI 格式的中转使用)。
2. **DeepSeek**: [官方平台](https://platform.deepseek.com/)，性能强劲，完美支持 Function Calling，且价格亲民。
3. **OpenRouter**: [聚合平台](https://openrouter.ai)，支持几乎所有主流模型。

---

## 🤝 社区与支持

Sanft 是一个持续进化的开源项目，欢迎加入社区交流心得、分享 Skill 或反馈 Bug。

* **GitHub Issues**: [提交反馈与建议](https://github.com/your-username/Sanft/issues)
* **原作者提示词库**: [Komorebi 的提示词库](https://komorebi.141277.xyz/post?file=posts%2F5.md)
* **QQ 交流群**: `1065512489` (欢迎加群催更、分享提示词、Agent、MCP与SKILL、或者闲聊~)

---

## 📄 许可证

本项目采用 [MIT License](LICENSE) 开源。

---

## 🙏 致谢

本项目 Fork 自 [Anywhere](https://github.com/Komorebi-yaodong/Anywhere)，感谢原作者 @Komorebi-yaodong 的出色工作！
