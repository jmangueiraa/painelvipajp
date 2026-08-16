---
name: AI Agent Stability and Resiliency
description: Fixes for AI agent responsiveness and database conflicts in the landing page chat.
type: feature
---

# AI Agent Stability Plan

The user reports that the AI agent only works within the Lovable environment and fails (or shows instability) on the production/public landing page. This is often caused by:
1.  **Framework Context Issues**: Raw API routes in TanStack Start sometimes lose context or fail when calling functions that rely on server-side middleware.
2.  **Database Conflicts**: `upsert` operations on history without proper ID handling can cause race conditions or primary key violations.
3.  **API Timeouts**: The AI gateway might take longer than the client-side fetch timeout or browser expectations.

## Proposed Changes

### Backend Logic (`src/lib/ai-agent.server.ts`)
- Refine the `processAgentMessageLogic` to be more resilient to database errors during history saving.
- Ensure the background save task doesn't block the response to the user.
- Add more explicit fallbacks for common user intents (greeting, specific brands).

### API Route (`src/routes/api/public/portal/public-ai-agent.ts`)
- Ensure CORS headers are correctly applied.
- Add logging to track the flow of requests from the public landing page.

### Frontend Component (`src/components/landing-page/AIChat.tsx`)
- Improve error handling to provide a better user experience even when the API flickers.
- Ensure `sessionId` is consistently passed.

## Technical Details
- Using `Promise.race` for timeouts.
- Non-blocking async IIFE for history persistence.
- Fuzzy matching for brand detection (Samsung/LG -> Smartone).
