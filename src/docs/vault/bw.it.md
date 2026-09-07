Lo strumento a riga di comando di Bitwarden è il modo in cui un'app desktop che
non è un browser raggiunge il tuo vault. Il pannello browser di Reado è una
webview di sistema: non ha un host per le estensioni, quindi l'estensione browser
di Bitwarden non può girarci dentro — `bw` parla con lo stesso vault, con lo
stesso account, ed è la via supportata.

## Come si configura

```
brew install bitwarden-cli        # macOS
winget install Bitwarden.CLI      # Windows
npm install -g @bitwarden/cli     # ovunque ci sia Node
```

Poi accedi una volta, da terminale: `bw login`. Da lì in avanti il vault è
*bloccato*, non disconnesso, e Reado ti chiede la password principale nel
pannello quando serve sbloccarlo. Quello sblocco resta nella memoria di Reado
finché l'app è aperta — non viene mai scritto su disco, e chiudendo Reado il
vault torna bloccato.
