Lo strumento a riga di comando di 1Password è il modo in cui un'app desktop che
non è un browser raggiunge il tuo vault. Il pannello browser di Reado è una
webview di sistema: non ha un host per le estensioni, quindi l'estensione browser
di 1Password non può girarci dentro — `op` è la via supportata, quella che
1Password costruisce esattamente per questo.

## Come si configura

```
brew install 1password-cli               # macOS
winget install AgileBits.1Password.CLI   # Windows
```

Poi, nell'app 1Password: **Impostazioni → Sviluppatore → Integra con 1Password
CLI**. È quello che permette a `op` di sbloccarsi con Touch ID tramite l'app
invece di chiederti l'accesso da terminale, ed è il motivo per cui Reado non ti
chiede mai la password di 1Password: è l'app ad autorizzare ogni richiesta, e sei
tu ad approvarla lì.
