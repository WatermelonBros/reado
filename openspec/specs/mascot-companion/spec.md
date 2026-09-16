# mascot-companion Specification

## Purpose

Give the agent's state a face: a small always-on-top character that says, at a
glance and from across the room, whether the agent is working, finished, stuck,
or waiting for an answer — including when Reado's window is not the one in front
and when the agent is running outside Reado entirely.

## Requirements

### Requirement: Speaks Only From Facts

The companion SHALL derive everything it shows from state Reado already holds —
an agent handoff, a dispatch, a reasoning line, a test verdict — or from text an
agent explicitly sent with `mascot_say`. It SHALL NOT generate advice, tips,
suggestions or observations of its own, and SHALL NOT speak on a timer, on an
interval, or in reaction to what the user is typing, editing or reading.

#### Scenario: Nothing to report

- **WHEN** no agent has been dispatched, no handoff has arrived and no test run has finished
- **THEN** the companion shows its idle animation and no bubble

#### Scenario: No self-authored speech

- **WHEN** the user has been editing a file for some time with no agent activity
- **THEN** the companion says nothing, regardless of how long that has been

### Requirement: The State Is The Agent's State

The companion SHALL show exactly one state at a time, resolved in this priority:
**needs-you** (a handoff with status `blocked`, or a `mascot_say` with mood
`ask`) > **failed** > **done** > **working** > **idle**. Working SHALL be entered
when Reado dispatches to the agent or a `reado thought` line arrives, and SHALL
end at the next handoff. A test run in flight SHALL also count as working, and
its verdict SHALL resolve to done or failed.

#### Scenario: Blocked outranks a finished test run

- **WHEN** a test run finishes green while a handoff with status `blocked` is standing
- **THEN** the companion shows needs-you, not done

#### Scenario: Working ends at the handoff

- **WHEN** the agent is dispatched and later writes `.reado/done.json`
- **THEN** the companion leaves working and shows the state that handoff carries

#### Scenario: An agent Reado did not start

- **WHEN** an agent running in a terminal outside Reado writes `.reado/done.json` for the open project
- **THEN** the companion shows the handoff state, having never shown working — Reado had no signal that it began

### Requirement: One Alert Per Handoff

The companion SHALL use the same coalesced handoff signal as the desktop
notification, so a run of premature `session_done` calls produces one change of
state carrying the last summary, not one per call. The companion and the
notification SHALL NOT be able to disagree about what the agent said.

#### Scenario: A burst of handoffs

- **WHEN** an agent calls `session_done` after each command it runs
- **THEN** the companion changes state once, showing the summary of the last call in the burst

### Requirement: A Companion, Not A Claim On Focus

The companion window SHALL be frameless, transparent, always on top, excluded
from the taskbar and the window switcher, and SHALL never take keyboard focus.
Pointer events SHALL pass through it everywhere except the character and its
bubble, so a click on whatever lies beneath reaches that application. It SHALL
NOT appear in screen captures of Reado's own window, and SHALL NOT block or
overlay a system dialog.

#### Scenario: Clicking through

- **WHEN** the user clicks a point of the companion window that is not the character or its bubble
- **THEN** the click reaches the window underneath and the companion does not activate

#### Scenario: Typing is never interrupted

- **WHEN** the companion changes state while the user is typing in another application
- **THEN** focus does not move and no keystroke is lost

### Requirement: The Bubble Is Bounded And Belongs To The Agent

A bubble SHALL appear only for a handoff summary or a `mascot_say`. Its text
SHALL be rendered as plain text — never markup, never a link — truncated to a
readable length with the full text available on click, and SHALL dismiss itself
after a bounded time or when the user clicks it. The companion SHALL show at most
one bubble at a time and SHALL drop older unshown text rather than queueing a
backlog.

#### Scenario: Long summary

- **WHEN** an agent sends a summary longer than the bubble holds
- **THEN** the bubble shows the beginning and the full text is reachable by clicking it

#### Scenario: Text that looks like markup

- **WHEN** an agent sends text containing HTML or markdown
- **THEN** it is displayed literally, as characters, and nothing in it is rendered or made clickable

#### Scenario: Two sayings in quick succession

- **WHEN** a second `mascot_say` arrives while the first bubble is still up
- **THEN** the bubble shows the newer text and the older is discarded

### Requirement: The Bubble Is Drawn By The Companion, Not Baked Into The Art

The bubble SHALL be rendered by the companion as live text, not as part of the
sprite art. The window SHALL be sized once, large enough to hold the character
and the longest bubble it will show, and SHALL NOT resize to fit each bubble.
The bubble SHALL open toward the screen's interior, away from the edge the
companion is parked against, so it is never drawn off screen. It SHALL carry a
tail pointing at the character's beak, on the side the bubble opens from, so that
who is speaking is never in doubt. The tail SHALL be part of the bubble's own
outline — one continuous line around bubble and tail, with no seam at the join.
The bubble SHALL be styled from the character's own palette rather than Reado's theme — the character and
its bubble read as one object, floating over whatever application happens to be
underneath.

#### Scenario: Any of the four corners

- **WHEN** the user has parked the companion in the bottom-right, bottom-left, top-right or top-left of a display, and a bubble appears
- **THEN** the bubble opens away from the two screen edges it is against — upward from a bottom corner, downward from a top one, inward from a left or right one — entirely on screen in every case

#### Scenario: The bubble changes side

- **WHEN** the companion is moved from one corner of the display to another and a bubble appears
- **THEN** the bubble opens toward the screen's interior and its tail moves with it, still pointing at the beak

#### Scenario: A bubble comes and goes

- **WHEN** a bubble appears and later dismisses
- **THEN** the window's size and position do not change, and nothing beneath it is repainted or displaced

#### Scenario: Over a dark application and a light one

- **WHEN** the companion floats over a dark terminal, and later over a white page
- **THEN** the bubble looks the same in both — it follows the character, not the background or Reado's theme

### Requirement: Never The Only Channel

Everything the companion shows SHALL also reach the user through the existing
channels — the desktop notification, the chime, and the screen-reader
announcement — so that hiding, disabling or never noticing the companion loses
nothing. The companion SHALL NOT be the sole carrier of any fact.

#### Scenario: Companion disabled

- **WHEN** the companion is turned off and the agent hands back the turn
- **THEN** the notification and chime behave exactly as they did before the companion existed

#### Scenario: Reduced motion

- **WHEN** the system asks for reduced motion
- **THEN** the character holds a single frame per state instead of animating, and the bubble still appears

### Requirement: The User Places It And Can Dismiss It

The companion SHALL be placeable in any
of the four corners of the display — bottom-right, bottom-left, top-right,
top-left. Where it is parked is the user's choice, and everything that depends on
it (which way the bubble opens, which way its tail points) SHALL follow from that
choice rather than assume one corner. It SHALL be parked against the display's
*work area*, not its full extent: a corner under the menu bar or behind the Dock
is not a corner.
It SHALL be dismissable from its own context menu and from settings, and its size
SHALL be adjustable. Dismissing it SHALL NOT stop or alter anything the agent is
doing.

#### Scenario: A corner is really a corner

- **WHEN** the companion is parked in any of the four corners
- **THEN** it sits against the edges of the usable screen — never under the menu bar, never behind the Dock

#### Scenario: Dismissed mid-run

- **WHEN** the user closes the companion while the agent is working
- **THEN** the agent continues untouched and the handoff still notifies

### Requirement: Clicking Does The One Thing That Matters Now

A click on the character SHALL raise Reado. It SHALL grow into the single action
the current state implies — the pane that handed back, the failing test — and
SHALL NOT, in the meantime, do something else instead. It SHALL NOT open a menu of choices on a plain click; the
menu belongs to the secondary click.

#### Scenario: Back from the kitchen

- **WHEN** the companion shows needs-you and the user clicks it
- **THEN** Reado comes to the front

### Requirement: It Can Be Sent To The Edge And Called Back

The companion SHALL offer a way to put itself out of sight without turning it
off: the character leaves through the edge it is parked against and a thin bar
remains, which widens under the pointer and brings it back when clicked. While it
is away it SHALL say nothing — a bubble from beyond the screen's edge is words
with nobody attached to them.

#### Scenario: Out of the way, not off

- **WHEN** the user sends the companion to the edge while an agent is working
- **THEN** the character is gone from the screen, a bar remains against the edge, and the agent is untouched

#### Scenario: Called back

- **WHEN** the user clicks the bar
- **THEN** the character comes back in, and anything it was saying is there again

### Requirement: `mascot_say` Is The Only Way In

Reado SHALL expose `mascot_say(text, mood?, ttl?)` over MCP, writing a single
`.reado/mascot.json` per call, watched like the project's other agent facts.
`mood` SHALL be one of the companion's states and default to a neutral say;
`text` SHALL be bounded in length and rejected — not truncated silently — when it
exceeds it. The tool SHALL be rate-limited so an agent in a loop cannot turn the
companion into a stream.

#### Scenario: A verb with no words

- **WHEN** `mascot_say` is called with empty text
- **THEN** the call is refused with a message the agent can read, and the bubble does not change

#### Scenario: An agent in a loop

- **WHEN** an agent calls `mascot_say` many times per second
- **THEN** the companion shows the most recent text at its own pace and the rest are dropped

### Requirement: The Character Is Drawn From One Anchored Atlas

The companion SHALL render from sprite atlases whose frames all share a single
crop, so that the character's body — identical in every frame — stays anchored
across a state change. Frames SHALL NOT be cropped individually to their own
content.

#### Scenario: Switching to a leaning frame

- **WHEN** the companion moves from a state whose frames are upright to one whose frames lean
- **THEN** the body does not shift, and no part of the character is clipped
