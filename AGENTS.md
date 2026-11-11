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
