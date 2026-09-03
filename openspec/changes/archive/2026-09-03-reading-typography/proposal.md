## Why

Reado is a tool for *reading* code, and its reading surface is tuned for one
kind of eye. Font family, size and line height are adjustable; **letter spacing
is not** — and letter spacing is the one typographic lever with direct evidence
behind it for dyslexic readers.

[Zorzi et al. (PNAS, 2012)](https://www.pnas.org/doi/10.1073/pnas.1205566109)
tested 54 Italian and 40 French dyslexic children on standard versus expanded
letter spacing: reading improved, and the group×spacing interaction was
significant — the benefit is *specifically* larger for dyslexic readers, not a
general legibility effect. The [BDA Dyslexia Style
Guide](https://cdn.bdadyslexia.org.uk/uploads/documents/Advice/style-guide/BDA-Style-Guide-2023.pdf)
recommends tracking around 35% of average letter width and 1.5 line spacing.

The obvious alternative — shipping a "dyslexia font" — is the thing to *not*
build. A [meta-analysis of 15 studies (91 effect sizes, N=688)](https://pubmed.ncbi.nlm.nih.gov/42536336/)
finds no consistent effect of dyslexia-specific fonts on reading speed or
accuracy, and a [controlled study of OpenDyslexic](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5629233/)
found no improvement for any participant and no participant preferring it.
Spacing is where the evidence is, so spacing is what this change adds.

The font picker, meanwhile, does nothing. It offers six faces by name and
resolves them against what the OS has installed — but on a clean machine only
Menlo is there. Every other preset falls through to `ui-monospace`, which is
also where the default lands, so five of the six options render identically to
each other and to picking nothing. The control looks like a choice and isn't
one.

## What Changes

- **reading-typography** (capability):
  - A **letter-spacing** control for the code surface, in ems, applying to the
    editor, the diff and every code view — so it is the *reading* that changes,
    not one panel.
  - **Fonts that are actually there.** The open-licensed presets (Geist Mono,
    JetBrains Mono, Fira Code, IBM Plex Mono) ship with the app, latin subset,
    two weights, so choosing one changes what you see on any machine. The
    system faces stay in the list as what they are.
  - A **custom font** field beside the presets, so any installed monospace face
    can be named too. The presets stay as the quick path.
  - Both settings sit with the existing font size and line height, travel
    between machines like every other preference, and default to today's values
    so nobody's editor moves under them.

Out of scope: bundling Apple's SF Mono or Menlo (licensed, and Menlo already
ships with macOS); a "dyslexia font" preset (the evidence says it does not
help); word
spacing (monospace makes it a function of letter spacing); the colour-blind diff
work, which is a separate capability with a separate argument.
