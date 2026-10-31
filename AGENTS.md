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

- Security headers are added in src/server.ts and the prompt API enforces same-origin + a per-IP rate limit (src/lib/rate-limit.ts); keep both when touching those files — they protect the AI credits.
- Use CooldownButton for page actions to centralize per-button cooldown timing and preserve layout while controls are hidden.
- Keep background movement to one transform-only grid layer without blur or backdrop filters; batch streamed text updates to reduce low-power rendering work.
