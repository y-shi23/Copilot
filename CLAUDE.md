# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Anywhere** is a sophisticated uTools plugin that transforms AI from a simple chat interface into a production-grade AI assistant platform. It integrates:
- **MCP (Model Context Protocol)**: Enables AI to execute Python code, manipulate files, run terminal commands, and search the web
- **Skill System**: SOP-based workflow orchestration with sub-agent support
- **Multi-Window Architecture**: Three independent frontends (settings UI, chat window, fast input)
- **WebDAV Sync**: Multi-device configuration and conversation synchronization

## Build Commands

### Development Workflow

Each frontend project must be built independently before integration:

```bash
# Build main settings UI
cd Anywhere_main
pnpm install && pnpm build
cd ..

# Build chat window
cd Anywhere_window
pnpm install && pnpm build
cd ..

# Build backend/preload scripts
cd backend
pnpm install && pnpm build
cd ..

# Integrate all builds into release directory
# Windows:
move.bat
# macOS/Linux:
chmod +x move.sh && ./move.sh
```

### Development Mode (Hot Reload)

```bash
# Main UI
cd Anywhere_main && pnpm dev

# Chat Window
cd Anywhere_window && pnpm dev

# Backend (watch mode)
cd backend && pnpm run watch
```

### Testing in uTools

1. Install [uTools Developer Tools](https://www.u-tools.cn/plugins/detail/uTools%20%E5%BC%80%E5%8F%91%E8%80%85%E5%B7%A5%E5%85%B7/)
2. Import the generated release folder (e.g., `v2.0.0/plugin.json`)
3. Run and debug directly in uTools

## Architecture

### Multi-Window System

Anywhere uses a **three-window architecture** coordinated through uTools APIs:

1. **Main Window** (`Anywhere_main/`): Settings and configuration UI
   - Entry point: `plugin.json` → `/main/index.html`
   - Manages: AI providers, assistants, MCP servers, Skills, WebDAV sync
   - Built with: Vue 3 + Element Plus + Vite

2. **Chat Window** (`Anywhere_window/`): Full-featured conversation interface
   - Opened via: `utools.ubrowser.run()` from main window or preload
   - Features: Multi-turn chat, file drag-drop, image paste, voice input, markdown rendering
   - Preload: `window_preload.js` (exposes `window.utools` bridge)
   - Built with: Vue 3 + Element Plus + OpenAI SDK + marked + highlight.js + mermaid

3. **Fast Input Window** (`Fast_window/`): Lightweight ephemeral input bar
   - Opened via: `utools.ubrowser.run()` with specific dimensions
   - Use case: Quick tasks (translation, variable naming) with auto-destroy
   - Preload: `fast_window_preload.js`
   - Built with: Vanilla HTML/CSS/JS (no framework)

### Backend Architecture (`backend/`)

The backend is bundled into three preload scripts using **esbuild**:

- **`preload.js`**: Main plugin entry point
  - Initializes uTools plugin lifecycle
  - Handles feature commands (e.g., "Anywhere Settings", "Resume Conversation")
  - Manages window creation and routing

- **`window_preload.js`**: Chat window bridge
  - Exposes `window.utools` API to chat frontend
  - Handles MCP tool calls, Skill execution, file operations
  - Manages conversation persistence (local JSON + WebDAV)

- **`fast_window_preload.js`**: Fast input bridge
  - Minimal API surface for lightweight interactions

### Key Subsystems

#### 1. MCP Integration (`backend/src/mcp.js`, `mcp_builtin.js`)

**Model Context Protocol** allows AI to interact with external tools:

- **Built-in Tools** (no config required):
  - `python_execute`: Run Python code in isolated environment
  - `file_read`, `file_write`, `file_search`, `file_replace`: File operations
  - `bash_execute`, `powershell_execute`: Terminal commands
  - `web_search`: DuckDuckGo search integration

- **External MCP Servers**: Supports Stdio/HTTP/SSE protocols
  - Managed via `@langchain/mcp-adapters`
  - User approval mechanism for high-risk operations
  - Server lifecycle: start → connect → tool discovery → execution → cleanup

**Architecture Pattern**:
```
AI Request → Skill/MCP Router → MCP Client → Tool Execution → Response Stream
```

#### 2. Skill System (`backend/src/skill.js`)

**Skills** are SOP (Standard Operating Procedure) templates that orchestrate complex workflows:

- **Structure**: JSON-based with `system_prompt`, `user_prompt`, `tools`, `model` config
- **Sub-Agent Mode**: Complex skills spawn independent agent sessions
  - Main conversation receives only final result
  - Prevents context pollution in primary chat
- **Skill Discovery**: Downloaded from remote repositories, stored locally
- **Execution Flow**:
  1. User invokes skill (via command or selection)
  2. Skill prompt injected into conversation
  3. AI executes with specified tools/model
  4. Result returned to user (inline or via sub-agent)

#### 3. Conversation Management

**Dual Storage Strategy**:
- **Local**: JSON files in uTools data directory (fast, private)
- **Cloud**: WebDAV sync (坚果云, Nextcloud) for multi-device access

**Conversation Structure**:
```javascript
{
  id: "uuid",
  title: "Auto-generated from first message",
  messages: [
    { role: "system", content: "..." },
    { role: "user", content: "...", files: [...] },
    { role: "assistant", content: "...", tool_calls: [...] }
  ],
  provider: "openai",
  model: "gpt-4",
  created_at: timestamp,
  updated_at: timestamp
}
```

**Auto-Save Mechanism**:
- Triggered after each AI response
- Debounced to prevent excessive writes
- Syncs to WebDAV if enabled

#### 4. AI Provider Abstraction (`backend/src/input.js`)

**Unified API Interface** for multiple providers:
- OpenAI, Anthropic, Google Gemini, DeepSeek, OpenRouter, etc.
- Streaming support with SSE (Server-Sent Events)
- Function calling / tool use normalization
- Load balancing across multiple API keys

**Request Flow**:
```
User Input → Provider Router → API Client → Stream Parser → UI Renderer
```

### Data Flow

```
┌─────────────────┐
│   User Action   │
│  (uTools Input) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Preload Script │ ◄─── Reads config from uTools DB
│   (preload.js)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Window Bridge  │ ◄─── Exposes APIs to frontend
│ (window_preload)│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Vue Frontend   │ ◄─── Renders UI, handles user interaction
│ (Anywhere_main/ │
│  window/fast)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   AI Provider   │ ◄─── Streams response back
│   (OpenAI API)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ MCP/Skill Layer │ ◄─── Executes tools if needed
│  (mcp.js/skill) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Conversation   │ ◄─── Persists to local/cloud
│    Storage      │
└─────────────────┘
```

## Critical Implementation Details

### 1. uTools Plugin Lifecycle

**Entry Point**: `plugin.json` defines features and commands
- `main`: Points to main UI HTML
- `preload`: Points to preload script
- `features`: Array of commands (e.g., "Anywhere Settings")

**Preload Script Responsibilities**:
- Must export `window.exports` object with feature handlers
- Cannot use ES modules (CommonJS only)
- Has access to Node.js APIs and Electron APIs
- Bridges uTools APIs to frontend windows

### 2. Window Communication

**Main → Chat Window**:
```javascript
// In preload.js
utools.ubrowser.run({
  show: true,
  width: 1200,
  height: 800,
  preload: path.join(__dirname, 'window_preload.js'),
  url: 'file://' + path.join(__dirname, 'window/index.html')
})
```

**Chat Window → Backend**:
```javascript
// In window_preload.js (exposed to frontend)
window.utools = {
  sendMessage: async (messages, config) => {
    // Calls AI API, handles streaming
  },
  executeMCP: async (toolName, params) => {
    // Executes MCP tool
  },
  saveConversation: async (conversation) => {
    // Persists to local/cloud
  }
}
```

### 3. MCP Tool Execution Flow

1. **Tool Discovery**: On MCP server start, query available tools
2. **Tool Injection**: Add tools to AI request as function definitions
3. **AI Decision**: Model decides to call tool (returns `tool_calls`)
4. **Execution**: Backend executes tool via MCP client
5. **Result Injection**: Tool result added to conversation as `tool` role message
6. **Continuation**: AI processes result and generates final response

### 4. Skill Sub-Agent Pattern

**Problem**: Complex skills pollute main conversation context
**Solution**: Spawn independent agent session

```javascript
// In skill.js
async function executeSkillAsSubAgent(skill, userInput) {
  const subAgentMessages = [
    { role: "system", content: skill.system_prompt },
    { role: "user", content: skill.user_prompt.replace("{{input}}", userInput) }
  ]

  // Execute in isolated context
  const result = await callAI(subAgentMessages, skill.tools, skill.model)

  // Return only final result to main conversation
  return result
}
```

### 5. Markdown Rendering with Code Blocks

**Challenge**: Render AI responses with syntax highlighting, mermaid diagrams, LaTeX
**Solution**: Custom marked renderer in `Anywhere_window/`

- **Syntax Highlighting**: `highlight.js` for code blocks
- **Diagrams**: `mermaid` for flowcharts/diagrams
- **Math**: `katex` for LaTeX equations
- **Sanitization**: `dompurify` to prevent XSS

**File Path Clickability**: Code blocks with file paths are clickable (jumps to file in editor)

### 6. WebDAV Synchronization

**Library**: `webdav` npm package
**Sync Strategy**:
- Upload: After local conversation save
- Download: On app start, merge remote changes
- Conflict Resolution: Last-write-wins (timestamp-based)

**Security**: Credentials stored in uTools encrypted DB

## Common Development Tasks

### Adding a New Built-in MCP Tool

1. Define tool in `backend/src/mcp_builtin.js`:
```javascript
{
  name: "my_tool",
  description: "What this tool does",
  inputSchema: {
    type: "object",
    properties: {
      param1: { type: "string", description: "..." }
    },
    required: ["param1"]
  }
}
```

2. Implement handler in `executeBuiltinTool()` function
3. Rebuild backend: `cd backend && pnpm build`

### Adding a New Skill

1. Create JSON file in `Skills/` directory:
```json
{
  "name": "My Skill",
  "description": "What it does",
  "system_prompt": "You are...",
  "user_prompt": "Task: {{input}}",
  "tools": ["mcp_tool_name"],
  "model": "gpt-4",
  "sub_agent": false
}
```

2. Skill auto-discovered on next app launch

### Modifying Chat UI

1. Edit components in `Anywhere_window/src/components/`
2. Hot reload: `cd Anywhere_window && pnpm dev`
3. Test in uTools developer mode
4. Build: `pnpm build` → `move.bat/move.sh`

### Debugging MCP Issues

1. Enable debug logging in `backend/src/mcp.js`
2. Check MCP server stdout/stderr (logged to console)
3. Verify tool schema matches AI expectations
4. Test tool execution independently before AI integration

## Important Constraints

### uTools-Specific Limitations

- **No ES Modules in Preload**: Must use CommonJS (`require`, `module.exports`)
- **Path Resolution**: Use `__dirname` for absolute paths, not relative
- **Window Lifecycle**: Windows destroyed on close, state must be persisted
- **API Restrictions**: Some Node.js APIs unavailable in preload context

### Build Process Quirks

- **Three Separate Builds**: Each frontend + backend must build independently
- **Manual Integration**: `move.bat/move.sh` required to assemble final plugin
- **Version Folder**: Release folder name (e.g., `v2.0.0`) must match version in code
- **Asset Paths**: Vite build output paths must align with `plugin.json` structure

### MCP Constraints

- **Tool Schema Validation**: AI providers have different function calling formats
- **Streaming Limitations**: Some tools cannot stream results (must buffer)
- **Security**: High-risk tools (bash, file_write) require user approval
- **Server Lifecycle**: MCP servers must be started before tool use, cleaned up after

## Testing Strategy

### Manual Testing Checklist

- [ ] Main UI loads and displays all settings tabs
- [ ] Chat window opens and sends messages successfully
- [ ] Fast input window appears and auto-destroys after response
- [ ] MCP tools execute correctly (test each built-in tool)
- [ ] Skills load and execute (test sub-agent mode)
- [ ] WebDAV sync uploads/downloads conversations
- [ ] File drag-drop works in chat window
- [ ] Voice input records and transcribes
- [ ] Markdown rendering (code, mermaid, LaTeX) works
- [ ] Conversation history persists across restarts

### Debugging Tools

- **uTools Developer Tools**: Inspect plugin, view console logs
- **Chrome DevTools**: Debug frontend (right-click → Inspect in ubrowser)
- **Console Logging**: Add `console.log()` in preload scripts (visible in uTools console)
- **Network Tab**: Monitor AI API requests/responses

## Key Files Reference

| File | Purpose | Critical Sections |
|------|---------|-------------------|
| `backend/src/preload.js` | Plugin entry point | `window.exports` feature handlers |
| `backend/src/window_preload.js` | Chat window bridge | `window.utools` API exposure |
| `backend/src/mcp.js` | MCP client manager | `connectToMCPServer()`, `executeToolCall()` |
| `backend/src/skill.js` | Skill orchestration | `executeSkill()`, sub-agent logic |
| `backend/src/input.js` | AI provider abstraction | `streamChatCompletion()`, provider routing |
| `Anywhere_window/src/App.vue` | Chat UI root | Message rendering, streaming display |
| `Anywhere_main/src/components/Mcp.vue` | MCP management UI | Server config, tool approval |
| `plugin.json` | uTools plugin manifest | Feature definitions, entry points |

## Language and Localization

- **Primary Language**: Chinese (Simplified)
- **i18n Support**: Vue I18n in `Anywhere_main` and `Anywhere_window`
- **Locale Files**: Check `src/locales/` in each frontend project
- When adding UI text, always add to locale files, not hardcoded strings
