# Plan - Fix AI Agent Instability (Oscillation)

The user is still seeing the "oscillation" (fallback) message from the AI agent, indicating that the primary AI response generation (via Google Gemini 1.5/3.6 Flash) is failing or timing out, triggering the catch block in `src/lib/ai-agent.server.ts`.

## Proposed Changes

### AI Agent Logic (`src/lib/ai-agent.server.ts`)
- **Fix Model Reference**: Update the `MODEL` constant from `google/gemini-3.6-flash` (which is likely a typo or future-dated reference) to the stable `google/gemini-2.0-flash-exp` or `gemini-1.5-flash` to ensure compatibility with the Lovable AI Gateway.
- **Enhanced Logging**: Add detailed logging before and after the gateway call to pinpoint if the failure is a timeout, a specific error code, or an empty response.
- **Refined Fallbacks**: Update the fallback messages to be even more seamless, avoiding the word "oscilação" (oscillation) which confuses users, and instead using more natural "tying" phrases while guiding the user towards WhatsApp support.
- **Context Injection**: Ensure the `SALES_CONTEXT` is strictly followed even in fallback scenarios.

### Frontend Chat Component (`src/components/landing-page/AIChat.tsx`)
- **Graceful Error Handling**: Update the frontend to handle partial failures or slow responses without immediately showing the fallback message if a retry is possible.
- **WhatsApp Link Optimization**: Ensure the WhatsApp link is prominent and consistent across all fallback scenarios.

## Technical Details
- **Gateway Endpoint**: `https://ai.gateway.lovable.dev/v1/chat/completions`
- **Stable Model**: `google/gemini-2.0-flash-exp` (or `gemini-1.5-flash`)
- **Timeout**: Current 40s is generous; will maintain but improve status reporting.

## Verification Plan
- **API Testing**: Run `requests` tests from the sandbox to verify the API returns a 200 OK with a valid AI-generated response (not a fallback string).
- **Log Inspection**: Check `console.log` output in the sandbox to verify the gateway is responding correctly.
- **Manual Verification**: Use the preview to send "oi" and "quero instalar" to ensure the bot responds with helpful, non-fallback text.
