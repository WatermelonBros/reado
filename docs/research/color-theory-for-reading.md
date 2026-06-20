# Color theory for prolonged code reading — research findings

> Deep-research report (adversarially verified: 90 claims extracted → 25 verified → 21 confirmed, 4 refuted). Feeds the Reado theme system and the impeccable design guidelines. Dated 2026-06-19.

## TL;DR for Reado

1. **Ship BOTH a light and a dark theme** — polarity advantage is *conditional*, not absolute. Don't pick one.
2. **Light (positive polarity) is actually better for acuity/detail reading** in normal daytime conditions (smaller pupils, sharper retinal image). Dark mode reduces *objective* fatigue only at night/low-light and in bright ambient light — but people *subjectively prefer* light even when dark helps physiologically. → This challenges our "default dark" choice; see Decision note below.
3. **Never pure-black-on-pure-white.** Use desaturated, reduced-brightness-contrast bases (Solarized "selective contrast": trade luminance contrast for hue contrast). Dark base should be gray-blue (≈ Solarized `base03 #002b36`), not `#000000`.
4. **Restrained palette ≤6 semantic colors.** Large controlled studies find **no reliable comprehension-accuracy benefit** from syntax highlighting. Its one robust benefit is comprehension *speed*, and mostly for **novices** — the effect shrinks with expertise. Reado's users are experienced → highlighting should be **subtle, not maximal**. This strongly validates the "few semantic colors, no Christmas tree" decision.
5. **Anchor the palette on the tokens readers actually fixate**: control-flow keywords first (dominant attention target), then definitions (function/type names), then strings. De-emphasize comments and punctuation.
6. **Build palettes in a perceptually-uniform space (OKLCH/CIELAB)** with fixed colorwheel hue relationships, equal lightness/chroma across accents, varying hue by fixed angular steps. Keep each semantic role at the **same perceptual position across themes**, but allow per-mode lightness/chroma tuning to hit WCAG AA in *both* (Solarized's flaw was reusing identical accents → AA failures in light mode).
7. **WCAG AA is the floor**, use APCA for fine-tuning. **Colorblind-safe**: separate accents on the *lightness* axis as well as hue (so they differ even under hue confusion); verify with a CVD simulator. Consider redundant non-color cues (weight/italic) for control-flow vs definition.
8. **Comment-annotation marker color lives OUTSIDE the syntax palette** — a distinct hue so it never collides with the six semantic roles. (Matches our existing decision.)

## Confirmed findings (with confidence + citations)

- **Avoid pure black-on-white; reduced-contrast hue-preserving bases** — *high* (3-0). Solarized: "Black text on white … is akin to reading a book in direct sunlight and tires the eye"; reduces brightness contrast but retains contrasting hues. Sources: ethanschoonover.com/solarized, github.com/altercation/solarized. ⚠️ The stronger claim that black-on-white *empirically causes measured fatigue over long sessions* was **refuted** (1-2) — value is the documented method, not proof of mechanism.
- **Construct in CIELAB/OKLCH with colorwheel hue relationships** — *high* (3-0). Solarized specifies all colors by exact L\*a\*b\* and translates colorwheel relations to CIELAB for perceptual uniformity. OKLCH is the modern CSS-native equivalent. Sources: solarized docs.
- **Same semantic role at same perceptual position across light/dark** — *high* (3-0). Solarized keeps "selective contrast relationships and overall feel" across modes via symmetric CIELAB lightness. Caveat: reusing identical accent hex across modes causes WCAG AA failures in light mode (selenized, solAArized critiques) → hold hue/role constant, tune lightness/chroma per mode.
- **Ship both light and dark** — *high* (3-0). Literature explicitly mixed (ACHI 2024 "conflicting evidence"; 2025 tablet study "no significant difference"; NN/g: light better for normal vision).
- **Positive polarity better for acuity/proofreading** — *high* (3-0). Piepenbrock, Mayr & Buchner 2014 (Ergonomics 57:11, PMID 25135324): smaller pupils, better proofreading with positive polarity; Buchner & Baumgartner (PMID 19562598): advantage vanishes when luminance equalized (luminance is the cause).
- **Dark theme justified for night/bright-ambient, with gray-blue base + moderate contrast** — *high* (3-0). Cao et al. 2021 (IEEE Access 9363189): dark mode reduced *objective* fatigue (blink rate, pupil accommodation) under low screen/ambient luminance; contrast *level* itself drives fatigue. ACHI 2024: significant Ambient×Polarity interaction (bright ambient → dark lower fatigue, p=0.004). ⚠️ In Cao 2021 *subjective* fatigue/preference favored LIGHT — dark's benefit is physiological, not perceived.
- **Restrained ≤6 palette; no accuracy benefit from highlighting** — *high* (3-0). Hannebauer, Hesenius & Gruhn 2018 (Empirical SE 23, n=390): "no evidence that syntax highlighting improves novices' ability to comprehend." Beelders & du Plessis: B&W metrics worse "but not significantly." Brown, Kölling et al. ICER 2023 (pre-registered): "no difference … in correctness or speed" despite intrusive coloring.
- **Highlighting helps SPEED, mainly NOVICES, diminishes with expertise** — *high* (3-0). Sarkar PPIG 2015 (eye-tracking, n=10): highlighted code lower completion time (median −8.4s, p=0.047); advantage correlates negatively with experience (r=−0.39, p=0.033). ⚠️ Broad claim that highlighting reduces comprehension *time* in general was **refuted** (0-3).
- **Anchor palette on control-flow headers** — *medium* (2-1). Turner, Falcone et al. HCII 2019 (N=17): control block headers are the dominant fixation target. Practical ≤6 mapping: (1) control-flow keywords, (2) other keywords/storage, (3) definitions, (4) strings, (5) numbers/constants, (6) comments (de-emphasized).
- **"Users will learn heavy coloring" is false** — *high* (3-0). ICER 2023: prior exposure to scope highlighting did not change (lack of) performance benefit.
- **WCAG AA floor + APCA + colorblind-safe ≤6 + comment marker out-of-palette** — *low* (synthesized engineering recommendation, not separately voted).

## Refuted under adversarial verification (do NOT rely on these)

- Pure black-on-white *empirically causes* prolonged-reading fatigue (1-2).
- Syntax highlighting *significantly reduces* comprehension time as a general fact (0-3).
- All eye-tracking effort metrics favor highlighted over B&W code (0-3).
- Program comprehension is broadly invariant to all presentation/styling (1-2).

## Caveats

There is essentially **no direct study of multi-hour code-reading fatigue by color scheme** — primary studies measure short proofreading/comprehension and physiological proxies. The polarity literature is genuinely condition-dependent. Highlighting samples are small (Sarkar n=10, HCII n=17) and "experts" often means grad students. Solarized claims are the designer's rationale, not independent validation — copy the *method*, not the exact values. Treat the ≤6 figure as a design heuristic, not an empirically-established threshold.

## Decision note for Reado

The user chose **default dark (gray-blue, low-fatigue)**. The research nuance: a well-tuned **light** theme is arguably the better *default* for daytime detail reading, with dark for night/bright-ambient. Recommendation to revisit with the user: ship both as first-class, pick the default by context (or follow system), keep the gray-blue dark base — don't go pure black, don't go maximal contrast in either mode.

## Key sources

- Solarized: https://ethanschoonover.com/solarized/ · https://github.com/altercation/solarized
- Piepenbrock et al. 2014 (Ergonomics): https://pubmed.ncbi.nlm.nih.gov/25135324/
- Cao et al. 2021 (IEEE Access): https://ieeexplore.ieee.org/document/9363189/
- ACHI 2024 (polarity × ambient): https://personales.upv.es/thinkmind/dl/conferences/achi/achi_2024/achi_2024_3_150_20069.pdf
- Sarkar PPIG 2015: https://ppig.org/files/2015-PPIG-26th-Sarkar1.pdf
- Hannebauer et al. 2018 (Empirical SE): https://link.springer.com/article/10.1007/s10664-017-9579-0
- Brown & Kölling ICER 2023 + Beelders & du Plessis (JEMR)
- Turner, Falcone et al. HCII 2019: https://link.springer.com/chapter/10.1007/978-3-030-22419-6_43
- Paul Tol colorblind-safe palettes: https://personal.sron.nl/~pault/
- OKLCH for design systems: https://medium.com/@solo_cube/from-hsl-to-oklch-and-betterlch-predictable-chroma-and-precise-contrast-for-design-systems-fc5235306145
- NN/g dark mode: https://www.nngroup.com/articles/dark-mode/
