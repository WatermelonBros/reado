Bitwarden's command-line tool is how a desktop app that isn't a browser reaches
your vault. Reado's browser pane is a system webview: it has no extension host, so
the Bitwarden browser extension cannot run in it — `bw` talks to the same vault,
with the same account, and is the supported way in.

## Setting it up

```
brew install bitwarden-cli        # macOS
winget install Bitwarden.CLI      # Windows
npm install -g @bitwarden/cli     # anywhere with Node
```

Then sign in once, in a terminal: `bw login`. After that the vault is *locked*
rather than signed out, and Reado asks for your master password in the pane when
it needs to unlock it. That unlock lives in Reado's memory for as long as the app
is running — it is never written to disk, and quitting Reado locks the vault again.
