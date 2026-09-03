## Why

Reado's layout is adjustable but not *reachable*. The sidebar toggles on a
shortcut (`⌘B`), the terminal on another, the activity bar and status bar only
from a Settings tab three clicks away — and nothing in the window tells you any
of it is possible. A reader who wants less on screen has to already know how.

That matters more than tidiness. The
[W3C COGA guidance](https://www.w3.org/TR/coga-usable/) devotes an objective to
*Help Users Focus* — **Avoid Too Much Content**, **Limit Interruptions** — and
another to *Support Adaptation and Personalization*. And a
[study of perceptual load in IDEs](https://arxiv.org/abs/2302.06376) found that
a visually quieter IDE measurably improved developers' speed on coding tasks and
total time on debugging, with the effect differing for people with ADHD
symptoms. Reado has accumulated a lot of signal — rails, badges, gutters, docks,
strips — and no fast way to turn it down.

The command pill is also narrower than it needs to be. It is the Command Center:
project name, search, `⌘K`. It sits in a strip that is otherwise empty.

## What Changes

- **window-chrome** (extended):
  - **Layout toggles in the title bar**: primary sidebar, panel (terminal), and
    secondary sidebar (the right dock) — the three things people hide most,
    one click each, with their state visible in the button.
  - A **layout popover** for the rest: activity bar, status bar, breadcrumbs,
    and the **primary sidebar's side** (left or right). One place that holds the
    window's shape, instead of a Settings tab.
  - A **wider command pill**, since the strip has the room and the pill is the
    search field.
  - Every toggle drives the settings that already exist, so a change made here
    and one made in Settings are the same change.

Out of scope: moving the activity bar independently of the sidebar (they are one
edge); a "quiet mode" preset that flips several of these at once — worth doing,
but it should be named for what it does rather than for a diagnosis, and it can
build on these toggles once they exist.
