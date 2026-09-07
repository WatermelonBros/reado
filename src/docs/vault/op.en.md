1Password's command-line tool is how a desktop app that isn't a browser reaches
your vault. Reado's browser pane is a system webview: it has no extension host, so
the 1Password browser extension cannot run in it — `op` is the supported way in,
and the one 1Password builds for exactly this.

## Setting it up

```
brew install 1password-cli               # macOS
winget install AgileBits.1Password.CLI   # Windows
```

Then, in the 1Password app: **Settings → Developer → Integrate with 1Password
CLI**. That is what lets `op` unlock with Touch ID through the app instead of
asking you to sign in on a terminal, and it is why Reado never asks you for your
1Password password: the app authorises each request, and you approve it there.
