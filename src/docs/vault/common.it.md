## Come si usa

1. Apri il pannello browser e vai sulla pagina in cui vuoi entrare.
2. Clicca la chiave nella barra del pannello. Reado elenca gli accessi che il tuo
   vault ha per l'origin di quella pagina — prima quelli con host esatto.
3. Cliccane uno: nome utente e password finiscono nel modulo. Niente viene
   inserito finché non scegli una voce.
4. Se la voce ha un codice temporaneo, **Codice** compila il campo 2FA con quello
   valido adesso — anche quello a sei caselle separate.
5. Ti stai invece registrando? **Genera e salva** crea una password, la inserisce
   (insieme alla conferma) e salva un nuovo accesso nel vault per quel sito.

## Cosa fa Reado con il segreto

- L'elenco degli accessi non contiene password. La password, e il codice
  temporaneo, vengono chiesti al vault **nel momento in cui li inserisci** e poi
  lasciati andare. Reado non li tiene in cache, non li scrive nei file del
  progetto e non li registra nei log.
- Tutto ciò che Reado inserisce viene oscurato in ciò che l'agente nel terminale
  può leggere: il mirror di console e rete sotto `.reado/`, il risultato di
  qualsiasi comando che esegue nella pagina, e "manda all'agente". Il tuo
  inspector continua a mostrare la pagina reale, come fanno gli strumenti per
  sviluppatori di un browser.
- Finché un campo password della pagina contiene qualcosa, i comandi dell'agente
  vengono **rifiutati**, non filtrati — un filtro sul risultato si aggira
  trasformando il valore, un rifiuto no. Reado ti chiede se vuoi autorizzare
  quella pagina; se accetti, il permesso vale solo per quella pagina e decade
  appena naviga altrove.

## Quando non funziona

- **È installata ma Reado dice di no.** Reado cerca lungo il PATH della tua shell
  di login — lo stesso che ha il terminale. Se `which` la trova nel terminale
  integrato, la trova anche Reado; se non la trova, l'installazione è finita dove
  la tua shell non guarda.
- **Nessun accesso proposto per un sito che hai salvato.** La corrispondenza usa
  gli URL salvati sulla voce del vault: prima l'host esatto, poi il dominio
  padre. Una voce senza URL non può essere associata a una pagina.
- **Il modulo non viene compilato.** Reado ti dice quale campo non ha trovato. Un
  login diviso su due schermate (prima l'utente, poi la password) si compila una
  schermata alla volta.
