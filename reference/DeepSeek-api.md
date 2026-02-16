install: npm i @ziuchen/deepseek-api
deepseek-api
An OpenAI-compatible DeepSeek API proxy server implemented with Node.js 20+.

Features
✅ Fully compatible with OpenAI API format
✅ Supports streaming responses (SSE)
✅ Supports DeepSeek R1 reasoning chain (reasoning_content)
✅ Supports online search mode
✅ Local PoW computation (WASM)
✅ Server-side conversation reuse (reduces redundant sessions on DeepSeek)
✅ Zero production dependencies
Supported Models
Model ID Reasoning Chain Online Search
deepseek-chat ❌ ❌
deepseek-reasoner ✅ ❌
deepseek-chat-search ❌ ✅
deepseek-reasoner-search ✅ ✅
Aliases: deepseek-v3 → deepseek-chat, deepseek-r1 → deepseek-reasoner

Quick Start
Install dependencies
pnpm install
Configure environment variables
cp .env.example .env

# Edit the .env file (optional, defaults work out of the box)

Development mode
pnpm dev
Production build
pnpm build
pnpm start
Environment Variables
Variable Description Default
LISTEN_HOST Listening address 127.0.0.1
LISTEN_PORT Listening port 5001
DATA_DIR Data directory for persistent storage (conversations, etc.). Unset = memory only (unset)
DEBUG_LOG_OUTPUT Enable debug logging (1 or true to enable) (disabled)
API Endpoints
GET /v1/models
List available models.

POST /v1/chat/completions
Create a chat completion.

Request example:

curl http://127.0.0.1:5001/v1/chat/completions \
 -H "Content-Type: application/json" \
 -H "Authorization: Bearer YOUR_DEEPSEEK_TOKEN" \
 -d '{
"model": "deepseek-chat",
"messages": [{"role": "user", "content": "Hello!"}],
"stream": true
}'
Authentication
Pass DeepSeek's Bearer Token directly in the Authorization header.

You can obtain the token from DeepSeek web app (chat.deepseek.com):

Open browser DevTools (F12)
Go to Application → Local Storage → https://chat.deepseek.com
Copy the value of the userToken key
Project Structure
src/
├── index.ts # Main entry - HTTP server
├── types.ts # Type definitions
├── constants.ts # Constants and env config
├── logger.ts # Unified logger (DEBUG_LOG_OUTPUT control)
├── utils.ts # Utility functions
├── pow.ts # PoW WASM computation
├── account.ts # Token extraction from request
├── stream-parser.ts # DeepSeek stream response parser
├── deepseek.ts # DeepSeek API calls
├── conversation-store.ts # Server-side conversation state management
└── routes.ts # Route handlers
public/
└── sha3_wasm_bg.\*.wasm # PoW computation WASM file
