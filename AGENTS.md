<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Android packaging
- Isolate TWA packaging in `android-twa/` and generate Android sources outside this repository; packaging must not modify the live portal.
- Treat the tracked TWA manifest as a Bubblewrap-compatible template; resolve signing placeholders only locally and preserve the generated project's signing identity and version when applying it.

## Portal invoice confirmation
- Keep renewal confirmation in a dedicated portal component with semantic invoice tokens; normalize the existing status response client-side without changing payment processing.

## RBOYS client actions
- Share the normalized server-client query between overview cards and server lists; this keeps displayed totals consistent without exposing provider credentials.
- Keep overview metrics in a dedicated component with fixed-height, semantic-token cards; this prevents labels, values and icons from overlapping on small screens.
- Route client operations through the existing admin-token-verified portal endpoint and a validated server-only action adapter, never a browser API key or a second payment engine; this preserves portal authentication and owner-scoped integrations.
- Keep each client's actions in an isolated menu/dialog component and invalidate server clients, access messages and credits after mutations; provider failures must stay local to the action.

## WhatsApp integrations
- Approved-payment WhatsApp delivery is invoked once by the central portal finalizer through the external send-whatsapp export under docs; this covers polling and card approvals without exposing credentials or duplicating webhook sends.
- Keep external webhook export adapters under docs and delegate payment finalization to the existing portal processor; this preserves commissions, push and billing behavior without deploying a second payment engine.
- Store Evolution credentials in a dedicated owner-scoped table with server-only API-key access; connection and sending must use the same owner's instance to prevent cross-account delivery.
- Prefer external administrative credentials with the external/browser database URL when configured; never fall back to publishable keys for privileged access, because private integration rows require the matching service role.
