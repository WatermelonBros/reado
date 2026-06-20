# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Report vulnerabilities privately through GitHub's
[private vulnerability reporting](https://github.com/WatermelonBros/reado/security/advisories/new)
("Report a vulnerability" under the repository's **Security** tab). If that is
unavailable, email **matteo@watermelon-studio.it**.

Please include:

- a description of the issue and its impact,
- steps to reproduce (a proof of concept if you have one),
- affected version or commit, and your OS.

We aim to acknowledge reports within a few days and will keep you updated as we
work on a fix. Once a fix is released, we're happy to credit you unless you
prefer to stay anonymous.

## Scope

Reado is a local desktop application. The most relevant areas are filesystem
access, the bundled terminal/PTY, the `reado` CLI, and how the app handles the
project folders it opens. Issues in third-party dependencies should be reported
upstream, but let us know so we can bump them.
