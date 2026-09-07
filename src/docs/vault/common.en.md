## Using it

1. Open the browser pane and go to the page you want to sign in to.
2. Click the key in the pane's toolbar. Reado lists the logins your vault holds
   for that page's origin — exact host first.
3. Click one: the username and password go into the form. Nothing is filled until
   you pick an item.
4. If the entry has a one-time password, **Code** fills the 2FA field with the
   current one — including the six-single-box kind.
5. Signing up instead? **Generate and save** creates a password, fills it (and its
   confirmation), and saves a new login to your vault under that site.

## What Reado does with the secret

- The list of logins carries no password. The password, and a one-time code, are
  fetched from your vault **at the moment you fill them** and dropped afterwards.
  Reado never caches them, never writes them to a project file, and never logs them.
- Anything Reado fills is redacted from what the terminal agent can read: the
  console/network mirror under `.reado/`, the result of any command it runs in the
  page, and "send to agent". Your own inspector keeps showing the real page, the way
  a browser's developer tools do.
- While a password field in the page holds a value, the agent's commands are
  **refused** rather than filtered — a filter on the result can be walked around by
  transforming the value, a refusal cannot. Reado asks whether you want to allow
  that page; if you do, the permission covers that page only and lapses the moment
  it navigates.

## When it doesn't work

- **Installed, but Reado says it isn't.** Reado looks along your login shell's
  PATH — the same one your terminal has. If `which` finds it in the integrated
  terminal, Reado will too; if it doesn't, the install went somewhere your shell
  doesn't look.
- **No login offered for a site you know you saved.** Matching is by the URLs
  stored on the vault item: the exact host first, then a parent domain. An item
  with no URL saved on it cannot be matched to a page.
- **The form isn't filled.** Reado tells you which field it could not find. A
  login split across two screens (username, then password) is filled one screen at
  a time.
