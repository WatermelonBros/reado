# browser-credentials Specification

## Purpose
TBD - created by archiving change 2026-09-07-browser-credentials. Update Purpose after archive.
## Requirements
### Requirement: Vault Backend Detection

Reado SHALL detect the user's password manager from the presence of its official
CLI on the login-shell PATH: 1Password (`op`) or Bitwarden (`bw`). Where neither
is present, the credential controls SHALL state which CLI to install and SHALL
offer no other action. Reado SHALL NOT read a password manager's local database,
browser profile, or credential store directly.

#### Scenario: A backend is available

- **WHEN** the user opens the browser pane on a machine where `op` or `bw` resolves
- **THEN** the pane offers to fill credentials through that CLI

#### Scenario: Neither CLI is installed

- **WHEN** no supported CLI resolves
- **THEN** the control says which one to install and performs no vault action

#### Scenario: Installed only for the terminal

- **WHEN** the CLI is installed somewhere the integrated terminal finds but the
  GUI's own PATH does not (a Homebrew or npm-global install)
- **THEN** Reado still detects it, because detection uses the login-shell PATH

### Requirement: Fill a Login for the Current Origin

On an explicit user action, Reado SHALL list the vault logins whose stored URLs
match the origin of the page in the browser pane, and on the user's choice SHALL
fill that item's username and password into the page's login fields. Filling
SHALL never happen automatically on page load, and SHALL apply only to the page
currently shown in the pane.

#### Scenario: One matching login

- **WHEN** the user asks to fill on a page whose origin matches a vault item
- **THEN** the item's username and password are entered into the page's fields

#### Scenario: Several matching logins

- **WHEN** more than one vault item matches the origin
- **THEN** the user chooses which item to use before anything is filled

#### Scenario: Subdomain of a stored site

- **WHEN** the page is on a subdomain of a site stored in the vault
- **THEN** that item is offered, with exact-host matches listed first

#### Scenario: No automatic filling

- **WHEN** a page with a login form loads in the pane
- **THEN** nothing is filled until the user asks for it

#### Scenario: Framework-controlled fields accept the value

- **WHEN** the page's inputs are controlled by a frontend framework
- **THEN** the filled values survive the page's next render, because the fill
  produces the same events a real keystroke does

#### Scenario: The form cannot be read

- **WHEN** Reado cannot identify the page's username or password field
- **THEN** it reports what it could not find, and fills nothing

### Requirement: Fill a One-Time Code

Where the chosen vault item carries a one-time-password secret, Reado SHALL, on a
separate explicit user action, obtain the current code from the CLI and fill the
page's one-time-code field. The code SHALL be requested at the moment it is asked
for and SHALL NOT be stored by Reado.

#### Scenario: Item with a TOTP secret

- **WHEN** the user asks for the one-time code on a page awaiting a 2FA challenge
- **THEN** the current code is filled into the page's one-time-code field

#### Scenario: Split one-time-code inputs

- **WHEN** the page presents the code as a row of single-character inputs
- **THEN** each box receives its character, with the events the page expects

#### Scenario: Item without a TOTP secret

- **WHEN** the chosen item carries no one-time-password secret
- **THEN** the action is unavailable and says so, rather than filling nothing

### Requirement: Create a Login From a Signup Page

On an explicit user action, Reado SHALL generate a password, fill it into the
page's new-password fields, and save a new login item to the vault carrying the
page's origin, the entered username, and that password. Reado SHALL confirm the
save, and SHALL report a failed save rather than leaving the user with a
credential that exists only in the page.

#### Scenario: Signing up on a new site

- **WHEN** the user asks Reado to generate a credential on a signup page
- **THEN** a generated password is filled and a new vault item is saved for that
  origin

#### Scenario: Both password fields

- **WHEN** the page asks for the new password twice (a confirmation field)
- **THEN** both receive the same generated value

#### Scenario: The vault refuses the save

- **WHEN** saving the new item fails
- **THEN** Reado says the item was not saved, and identifies the failure

### Requirement: Unlock Handling

Where the backend requires an unlocked vault, Reado SHALL prompt for the unlock
explicitly and SHALL hold the resulting session in memory for the app's lifetime
only. The session SHALL NOT be written to disk, to project files, or to Reado's
settings, and SHALL NOT be passed to the CLI on its command line.

#### Scenario: Locked vault

- **WHEN** the user asks to fill and the vault is locked
- **THEN** Reado asks for the unlock, and proceeds once it succeeds

#### Scenario: The session does not outlive the app

- **WHEN** Reado is restarted
- **THEN** the vault is locked again and a fresh unlock is required

#### Scenario: The session is not visible to other processes

- **WHEN** Reado invokes the CLI with an unlocked session
- **THEN** the session reaches the CLI through its environment, never as a command
  line argument

### Requirement: Secrets Do Not Reach the Agent

Values Reado fills from the vault SHALL be redacted from everything the agent can
read: the console and network state mirrored to `.reado/`, the result of every
agent command including page evaluation, and any inspector entry the user sends to
the agent. Reado SHALL NOT log a vault secret at any log level.

The user's own inspector SHALL keep showing the real captured values, as a browser's
developer tools do — the boundary being drawn is the one into the agent, not the
one into the user's own view of their own page.

#### Scenario: Submitting the login form

- **WHEN** the page posts the filled credentials and the pane captures that request
- **THEN** the mirrored file the agent reads shows the password redacted

#### Scenario: The agent reads the field directly

- **WHEN** the agent evaluates script in the page that returns a filled field's value
- **THEN** the result handed back to the agent is redacted

#### Scenario: The page prints the value

- **WHEN** a page logs a filled value to its console and that entry is sent to the
  agent
- **THEN** the agent receives it redacted

#### Scenario: The inspector is not degraded

- **WHEN** the user opens the captured login request in the inspector
- **THEN** the real body is shown, as it is in a browser's developer tools

### Requirement: The CLIs Are Discoverable Where Extensions Are

Reado SHALL list the supported password-manager CLIs among its extensions: the one
that resolves on the user's PATH SHALL read as installed, and one that does not
SHALL be offered with the install command for the current OS — or say plainly that
this OS has no one-liner. Where a CLI needs more than its binary to work (the
1Password app's CLI integration, a Bitwarden login), the listing SHALL say so
rather than let the user discover it at the first failure. Where the browser pane
finds no CLI at all, it SHALL point at that listing.

#### Scenario: The desktop app is installed but the CLI is not

- **WHEN** the user runs Bitwarden or 1Password as a desktop app and opens Reado's
  extensions
- **THEN** that vendor's CLI is listed as available, with the command that installs
  it on this machine

#### Scenario: The CLI is already there

- **WHEN** the CLI resolves on the user's login-shell PATH
- **THEN** it reads as installed, among the user's own extensions

#### Scenario: A prerequisite the binary alone doesn't satisfy

- **WHEN** the listing is for a CLI that unlocks through its desktop app
- **THEN** the listing states that requirement alongside the install command

#### Scenario: The listing explains itself

- **WHEN** the user opens a password manager's listing
- **THEN** Reado shows a guide it wrote itself — what the CLI is for, why the
  browser extension cannot serve here, how to set it up, how filling works, what
  Reado does with the secret, and what to check when it doesn't work — since these
  are the vendors' binaries and have no README to fetch

#### Scenario: From the pane to the listing

- **WHEN** the user asks the browser pane to fill a credential and no CLI is
  installed
- **THEN** the pane says so and takes them to where it is listed

### Requirement: A Page Holding a Password Is Gated From the Agent

Before executing a command from the agent against the browser pane, Reado SHALL
determine whether any password field in the page holds a value, and SHALL refuse
the command while one does, unless the user has granted the agent access to that
page. The refusal SHALL apply to every agent command, page evaluation included,
and SHALL NOT be substituted by redacting the command's result. This SHALL hold
for any password in the page, whether Reado filled it from the vault or the user
typed it.

The refusal SHALL be reported to the agent as a stated reason. Reado SHALL surface
the request to the user, saying plainly that granting lets the agent see what is
entered on that page, credentials included. A grant SHALL apply to the current
page only, SHALL lapse when the pane navigates or closes, and SHALL NOT be
persisted. Reado SHALL NOT wait on the user before answering the agent.

#### Scenario: A password is in the page

- **WHEN** the agent issues a command while a password field holds a value and no
  grant is in force
- **THEN** the command is not executed, and the agent is told the page holds a
  credential it has not been granted access to

#### Scenario: The user grants access

- **WHEN** the user grants the agent access to that page
- **THEN** the agent's commands run against it, password fields included

#### Scenario: The grant does not follow the user

- **WHEN** the pane navigates elsewhere, or is closed and reopened
- **THEN** the grant is gone and the next page starts gated again

#### Scenario: A hand-typed password counts

- **WHEN** the user types a password themselves, without the vault
- **THEN** the same gate applies

#### Scenario: The user is not there

- **WHEN** nobody answers the request
- **THEN** the agent still gets its refusal immediately, rather than the command
  hanging

#### Scenario: An empty field is not a credential

- **WHEN** the page has a password field with nothing in it
- **THEN** agent commands run normally

### Requirement: Credentials Are Not an Agent Surface

The vault SHALL be reachable only from Reado's own UI on a user action. Reado
SHALL NOT expose vault listing, filling, unlocking, or item creation to the agent
control channel or the MCP tool surface.

#### Scenario: The agent cannot ask for a credential

- **WHEN** the agent issues commands to the preview pane
- **THEN** no command can list vault items, fill a credential, or unlock the vault

