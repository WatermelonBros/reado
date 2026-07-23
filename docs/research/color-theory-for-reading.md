# Color theory for prolonged code reading — research findings

> **v2 (2026-07-22).** Deepens and re-verifies the v1 report (2026-06-19).
> Method: a 12-facet deep-research sweep (48 agents, 465 web searches, all primary
> sources fetched where reachable) followed by adversarial verification of every
> decision-relevant claim against the real source. Of 36 verified claims: **20
> CONFIRMED, 16 NUANCED, 0 refuted outright** — but the nuancing surfaced several
> **citation errors in v1** that are corrected below. Feeds the Reado theme system
> (`src/styles/tokens.css`) and the impeccable design guidelines (`.impeccable.md`).
>
> The single most important meta-finding is unchanged and now exhaustively
> confirmed: **there is still no direct, controlled, multi-hour study of
> code-reading fatigue by colour scheme.** Every "scheme X lets you code longer"
> claim traces to designer rationale. What follows is psychophysics + accessibility
> engineering + optics, applied to code — not proof that a palette reduces fatigue.

## 0. Corrections to v1 (verify these before trusting the old doc)

The adversarial pass caught v1 mis-attributing three of its load-bearing citations.
The *substance* mostly survived; the *sources and magnitudes* did not:

1. **"Cao et al. 2021" does not exist as cited.** The IEEE Access 2021 dark-mode
   study (doc 9363189) is **Xie, Song & Liu**, *Study on the Effects of Display
   Color Mode and Luminance Contrast on Visual Fatigue*. And its result *tempers*
   v1: within the tested range under **low absolute luminance**, objective fatigue
   *fell as the luminance-contrast ratio rose*, lowest at the **highest** contrast
   (0.969) in dark mode. So "moderate, not maximal, dark-mode contrast" rests on
   **absolute-luminance / halation** grounds, **not** on lowering the contrast ratio.
2. **"ACHI 2024" is Pathari, Nielsen, Andersen & Marentakis**, not "Sethi & Ziat"
   (that is a separate 2023 *Ergonomics* paper). And the numbers: the Ambient×Polarity
   interaction is **F(1,14)=7.13, p=0.016, η²=0.039 (~4% of variance — small)**;
   the **p=0.004** v1 quoted is the *bright-ambient pairwise* comparison, not the
   interaction. Dark mode lowered self-reported fatigue **only under bright ambient
   light**, not dim.
3. **The pre-registered ICER 2023 study (Park, Weill-Tessier, Brown, Sharif,
   Jensen & Kölling) is about *scope / background* highlighting, not syntax
   highlighting on/off** — both Java conditions kept syntax highlighting. It found
   background/scope styling shifts gaze but not comprehension, bounded by a **66%
   ceiling effect**. Still supports "no accuracy benefit," but not as a
   syntax-on-vs-off replication.
4. **The folk "syntax highlighting improves readability ~25% / boosts bug
   detection" figure is not about syntax colouring at all** — it traces to
   **Baecker 1988**, a typography/layout/pretty-printing study. Do not cite it for
   token colour.
5. **Say "OKLCH", not "OKLCH/CIELAB".** CIELAB is precisely the space whose
   blue→purple hue non-linearity makes hue-contrast trades unsafe; it should not be
   recommended alongside OKLCH as an authoring space.

## 1. TL;DR for Reado

1. **Ship BOTH a light and a dark theme.** The polarity advantage is *conditional*,
   and now confirmed conditional by the newest trials (2024–2025). Follow the OS /
   time-of-day; let the user override. Preference systematically *diverges* from
   measured load, so don't pick the default from preference telemetry.
2. **Light (positive polarity) is better for acuity/detail** in daytime — replicated
   in 2025 (Luzsa & Mayr) and *largest for small type*, exactly the code regime. The
   cause is **display luminance → pupil constriction → sharper retinal image**, not
   polarity per se (advantage vanishes at equalised luminance; Buchner). Dark's
   benefits are **objective-only, small, and ambient-gated** (bright rooms, night).
3. **Never pure white, never pure black.** Light base = a **warm off-white**
   (cream/peach), which reads measurably faster than a cool near-white at matched
   high contrast (Rello & Bigham, N=341). Dark base = a **gray-blue above pure
   black** (~Solarized `base03`), with **off-white, not #FFF, text** to avoid
   halation — ~**40% of adults are astigmatic** (Hashemi 2018).
4. **Contrast: moderate, not maximal — but keep a generous reserve.** Reading speed
   plateaus above ~10% Michelson contrast (Legge/Rubin, decades-robust); pushing to
   the ceiling buys nothing and high absolute luminance *adds* fatigue. But low-vision
   and older readers need ~**4× more** contrast reserve, so don't shave it thin.
5. **Restrained palette, ≤6 semantic roles.** No reliable *accuracy* benefit from
   syntax highlighting in the largest study (Hannebauer, n=390) or the pre-registered
   one (n=62). Its one robust benefit is *speed*, mainly for **novices**, shrinking
   with expertise (Sarkar, n=10, via reduced context-switching). Experts skim ~90%
   of a method, non-linearly. Highlighting is a **wayfinding / comfort / preference**
   aid, not a comprehension tool → subtle, not maximal.
6. **Anchor emphasis on landmarks, keep identifiers maximally legible.** Attention
   concentrates on **identifiers** and **signatures/declarations**, not on
   control-flow keywords (which are recognised near-instantly and often skipped).
   So don't let saturated keyword colour out-shout the identifiers where
   comprehension actually happens; spend the salience budget on structural wayfinding.
7. **Engineer accents in OKLCH; gate contrast with WCAG 2 AA (the legal floor) and
   tune with APCA.** APCA is **not a ratified standard** (removed from WCAG 3 in
   2023; WCAG 3 contrast "yet to be determined" as of April 2026) — use it as a
   perceptual heuristic *above* AA, never as the compliance basis. Target **Lc ≥ 90**
   (≥ 75 minimum) for code body text in both themes; comments/dimmed tokens ≥ Lc 60.
8. **Separate accents on the LIGHTNESS axis, not hue alone**, and keep **adjacent
   roles ≥ 3:1 in luminance from each other** (or add a weight/italic cue). This is
   the fix for Solarized's real flaw and the only thing that survives colour-vision
   deficiency (~8% of men) and grayscale.
9. **Desaturate; never abut saturated red and saturated blue.** Spectrally-extreme
   pairs destabilise accommodation (chromostereopsis / chromatic aberration). In dark
   mode, **pure saturated red is the worst foreground**; warm/desaturated is best.
10. **The comment/annotation marker hue lives OUTSIDE the six roles** — a distinct,
    muted hue that never collides and never grabs attention.
11. **A "night" / warm theme is comfort, not medicine.** Blue-light-as-eye-strain is
    debunked (AAO; Cochrane 2023). Evening blue light *does* affect the circadian
    system, but **warming colour temperature without lowering luminance barely helps
    melatonin** (Nagare 2019). The real lever is a genuinely **dim, low-luminance**
    night theme + OS brightness — don't market a warm accent shift as a sleep aid.

## 2. The base decision — polarity, luminance, and why "ship both"

- **Positive polarity (dark-on-light) is better for acuity/proofreading in daytime,
  and it replicates on modern hardware** — *high (CONFIRMED)*. Luzsa & Mayr 2025
  (*Ergonomics*, VR + video-see-through MR headset, 39 px/°): better proofreading and
  faster optotype ID under positive polarity, preferred for reading, **advantage grows
  linearly as character size shrinks** — the small-dense-type regime of code. Extends
  Piepenbrock, Mayr & Buchner 2014 (PMID 25135324): smaller pupils, better proofreading.
  **The cause is luminance, not polarity**: Buchner, Mayr & Brandt 2009 (PMID 19562598)
  — the advantage vanishes when luminance is equalised. (v1's author attribution
  "Luzsa, Buchner" was wrong; it is Luzsa & Mayr.)
- **Hue contrast cannot substitute for luminance contrast** — *high (CONFIRMED)*.
  Buchner & Baumgartner 2007 (PMID 17510822): the polarity advantage was independent
  of ambient light *and* chromaticity, and red-on-green colour contrast **could not
  compensate for a lack of luminance contrast**. → Solarized-style "selective
  contrast" works *only* because it keeps real L\* separation; hue is an **addition on
  top of** an adequate luminance floor, never a replacement. Corroborated for reading
  speed by Legge et al. 1990 (JOSA A, "Psychophysics of reading XI"): for normal
  vision colour contrast can drive reading as fast as luminance contrast, but **low-
  vision readers get no colour-contrast benefit** and need luminance.
- **Dark mode's benefit is real but small, objective-only, and ambient-gated** —
  *high, but see corrections*. Xie, Song & Liu 2021 (IEEE Access): under low ambient,
  objective fatigue was lowest at the *highest* contrast in dark mode; **subjective
  preference favoured light**. Pathari et al. 2024 (ACHI): dark lowered self-reported
  fatigue **only in bright ambient** (interaction η²≈0.04, small). MDPI 2025 tablet
  crossover (N=30): **no subjective difference**, but CFF and dry-eye modestly favoured
  dark. ETRA 2025 (N=15 dashboards): dark lowered *perceived* workload yet *raised*
  pupil dilation — an objective/subjective dissociation attributed to the dim room.
- **Age moderates it** — *medium*. Sethi & Ziat 2023 (*Ergonomics*): older adults incur
  more load from dark mode in **bright** rooms; younger adults from dark mode in **dim**
  rooms. → no age-tuned default is justified; honour OS + let the user pick.
- **A genuinely new axis — refractive load / myopia** — *new, suggestive only*.
  Aleman, Wang & Schaeffel 2018 (Sci Rep, N=7, 60 min): black-on-white **thins** the
  choroid (a pro-myopia signal, ΔL −16 µm, p≈8×10⁻⁵); white-on-black **thickens** it
  (+10 µm). Acute biomarker, tiny N, not proof — but another reason to keep (not
  deprecate) dark mode.

**Net:** default by context (OS/time-of-day), keep the gray-blue dark base and a warm
off-white light base, moderate contrast in both. Neither polarity is universally "less
fatiguing."

## 3. Contrast — moderate, not maximal; WCAG floor, APCA tuning

- **Reading speed plateaus far below maximum contrast** — *high (CONFIRMED)*.
  Legge, Rubin & Luebker 1987 / Rubin & Legge 1989: reading rate is flat above ~10×
  the detection threshold (~0.1 Michelson) and only collapses near threshold. **But
  low-vision observers need ~3.9× more contrast reserve** (16 of 19 cases) — the
  plateau is for average vision, so keep the reserve generous.
- **High absolute luminance adds fatigue independent of contrast** — *high (NUANCED)*.
  Benedetto et al. 2014 (Comput. Human Behav., N=48, 1 h): high screen luminance
  reduced blink rate (more fatigue) — but as a **trade-off** (it also raised arousal,
  legibility, speed), with contrast held ~constant. Takeaway: prefer a not-too-bright
  default, especially in dim rooms; favour adaptive brightness.
- **APCA is the right tuning tool AND explicitly non-normative** — *high (CONFIRMED
  governance)*. WCAG 2's symmetric ratio **overstates contrast near black**, so a
  dark pairing can pass 4.5:1 yet be functionally unreadable → it "cannot be used to
  design dark mode." APCA fixes this: signed, polarity-aware **Lc** (0…±106),
  size/weight-aware. Practical thresholds: **Lc 90 preferred / Lc 75 minimum for body
  text; Lc 60 non-body; Lc 45 large; Lc 15 = invisibility**; Lc 90 is even a
  *suggested maximum* for very large/bold text (standards-body support for "max is not
  optimal"). **But APCA was removed from WCAG 3 in July 2023; as of April 2026 the
  WCAG 3 contrast algorithm is "yet to be determined"** (Roselli). → Keep **WCAG 2 AA
  as the compliance/legal floor**, APCA as an internal heuristic. Its empirical base
  is analytical (Waller 2022), not a powered reader trial.

## 4. The base surfaces — never pure white, never pure black

- **Warm off-white beats cool near-white for a light theme** — *high (NUANCED)*.
  Rello & Bigham 2017 (ASSETS, **N=341**, 89 dyslexic): among 10 black-on-light
  backgrounds (all ≥ WCAG AAA), **warm tints read fastest** (Peach 14.85 s, Orange,
  Yellow) and the **cool near-white "Blue-Grey" was slowest** (21.57 s, +45%),
  **despite its high contrast** — hue, not contrast magnitude, predicted speed. The
  pattern was near-identical for dyslexic and typical readers (ρ=0.96). Caveats: not
  iso-contrast, single 55-word paragraphs (speed, not multi-hour fatigue), positive
  polarity only, and the authors decline to *recommend* warm colours (stimulating over
  long sessions). → **Default the light theme to a warm off-white (cream/peach), not
  #FFF or cool grey; expose a background-warmth control.**
- **Avoid pure/near-white specifically** — corroborated by eye-tracking (black-on-cream
  gives the shortest fixation durations; Rello & Baeza-Yates 2015, n=92) and the
  **British Dyslexia Association style guide** (2023): "dark text on a light (not
  white) background", cream/soft pastel, "avoid over-high contrast", allow user colour
  choice. This is a professional-authority endorsement of *moderate contrast +
  individual choice*, not just designer taste.
- **Avoid pure black + pure-white-on-black (halation)** — *medium/high*. Astigmatism
  affects **~40% of adults** (Hashemi 2018, pooled 40.4%, 95% CI 34–47); a dilated
  dark-mode pupil admits oblique rays that smear bright glyphs into halos. The
  causal *legibility* penalty for astigmats lacks an RCT, but the prevalence is solid.
  → gray-blue base **above** #000, **off-white (not #FFF) text**, avoid thin weights.
- **Colored overlays / Irlen "syndrome" are NOT evidence-based** — *high (CONFIRMED)*.
  Griffiths et al. 2016 systematic review: effects "small and/or similar to placebo",
  overlays "cannot be endorsed"; Ritchie et al. 2011 (double-masked): no benefit;
  AAP/AAO/AAPOS joint statement: tinted filters/lenses unsupported, "vision problems
  are not the cause of primary dyslexia." → **Never frame any Reado colour feature as
  a dyslexia treatment or build a "diagnostic tint" picker.** The honest, supported
  claim is: *a warm background + a user-chosen comfortable tint improves readability
  for everyone* — and precise per-person "magic colours" add nothing over a generic
  comfortable tint (Evans & Allen; 2024 crossover). → a lightweight user background-
  warmth / line-highlight control, not an auto-diagnostic engine.

## 5. Syntax highlighting — what it does and doesn't do

- **No reliable accuracy benefit** — *high (CONFIRMED)*. Hannebauer, Hesenius & Gruhn
  2018 (Empirical SE, **n=390**): "no evidence that syntax highlighting improves
  novices' ability to comprehend." Park/Kölling et al. 2023 (ICER, pre-registered,
  n=62): no interface effect on correctness or time (bounded by a 66% ceiling) — but
  note this manipulates **scope/background** styling, not syntax on/off.
- **It helps SPEED, mainly NOVICES, shrinking with expertise** — *high (CONFIRMED)*.
  Sarkar 2015 (PPIG, n=10): highlighted code faster (median −8.4 s, p=0.047) via
  **fewer prompt↔code context switches** (not faster/fewer fixations); benefit
  correlates *negatively* with experience (r=−0.39). Small n, speed-only.
- **The "~25% readability" claim is misattributed** (§0.4 — Baecker 1988 typography).
  And Gilmore & Green 1988: a colour cue helps **only when it matches what the reader
  is hunting** — supporting a small, role-matched palette over maximal colouring.

## 6. Where the eye goes — anchoring the palette

- **Identifiers are the attention sink** — *medium (NUANCED)*. Busjahn, Bednarik &
  Schulte 2014 (ETRA, n=15): dwell concentrates on identifiers, operators, keywords
  **and literals together**, with separators/punctuation least (partly a
  length/frequency effect). Corrected reading: keep **identifier text maximally
  legible**, safely **de-emphasise punctuation** — but keywords are *not* low-attention
  scaffolding, they sit in the same high group.
- **High-frequency keywords are recognised near-instantly** — *high (NUANCED)*.
  Al Madi et al. 2020 (EMIP): token frequency drives *gaze duration* (r²≈0.92) but not
  *first-fixation* duration in code — if/for/public are identified fast and often
  skipped. → don't spend the strongest colour on the cheapest-to-read tokens.
- **Reading is non-linear and skim-heavy, more so with expertise** — *high (CONFIRMED)*.
  Busjahn et al. 2015 (ICPC): experts cover ~41% of elements vs novices ~52%, longer
  saccades, follow **execution order** over story order. Rodeghero & McMillan 2015
  (ESEM, n=10): programmers thoroughly read only ~10% of a method, "disorderly", with
  no top-to-bottom bias, and **favour the signature over the body**. → colour's job is
  **landmarking/wayfinding** for a handful of token classes (a restrained ≤6 set),
  plus possibly a distinct **declaration/signature** emphasis — not per-token decoration.
- **Beacons are an expert feature; comments chunk but don't grab** — *medium*. Keep the
  comment/annotation hue outside the syntax roles and non-attention-grabbing.
  Genuine tension the literature leaves open: *anchor on control-flow keywords*
  (Turner/Falcone; expert execution-order beacons) **vs** *summarisation attention on
  signatures/identifiers* (Rodeghero). No study compares colour-on-keywords vs
  colour-on-declarations directly.

## 7. The accent palette — OKLCH engineering, CVD safety, adjacency

- **Author in OKLCH (a hue-linear space), not CIELAB/HSL** — *high (CONFIRMED)*.
  CIELAB rotates blue→purple along a "constant-hue" chroma line (Ottosson: hue RMS
  0.49 vs CIELAB 0.69; lightness 0.20 vs 1.70); W3C adopted OKLCH into CSS Color 4 for
  exactly this. Only a hue-linear space makes hue-contrast trades safe.
- **OKLCH is APPEARANCE-uniform, not DISCRIMINATION-uniform** — *medium (new)*.
  Oklab Euclidean ΔE poorly predicts *perceived difference* (STRESS 47.4 vs CIEDE2000
  29.1 on COMBVD). → build even lightness/hue ramps in OKLCH, but **judge minimum
  distinguishability / equal-emphasis with CIEDE2000**, not Oklab distance. (Preprint,
  not yet peer-reviewed; validated only for chroma < 0.20.)
- **Gamut geometry forces per-mode tuning** — *high*. Max chroma depends on **both**
  hue and lightness, so holding a role at one hue across light/dark forces different
  L/C per mode (exactly Solarized's flaw). Out-of-sRGB colours must be **chroma-reduced
  or ΔE-mapped, never naively clipped**. (P3 has ~37% more headroom than sRGB — a
  possible future accent variant, benefit unproven.)
- **Separate accents on the LIGHTNESS axis, not hue alone** — *high (CONFIRMED)*.
  Zeileis & Murrell 2023 (R Journal): "the easiest approach to a colorblind-safe
  palette is a monotonic change in luminance." Paul Tol's SRON schemes order the
  high/medium-contrast sets by **luminance** and verify every scheme under simulated
  red/green-blind vision; colour-blind-safe categorical sets top out at ~7–9 (Bright 7,
  Vibrant 7, Muted 9) — so **6 roles + a separate comment hue** sits safely under the
  ceiling. Red-green CVD ≈ **8% of men / 0.4% of women**; **deuteranomaly (~5% of men)
  is the dominant case** to validate against (Birch 2012). It materialises in real
  developer pools (ICER 2023: 3.2% red-green).
- **Reference sets & tools.** Categorical roles → an **Okabe-Ito or Tol subset**
  (designer-validated via CVD *simulation*, not reading trials). Continuous overlays
  (heatmap/minimap/diff/blame-age) → **cividis** (CVD-safe sequential; also
  model-validated, no user study). **Validation pipeline**: run the accent set through
  a **Machado-2009** simulator for deutan/protan/tritan and assert a minimum pairwise
  CIEDE2000 distance (e.g. `colorblindcheck`), **in both themes** — and add a
  **grayscale-survives** check (if it works in grayscale it works for all CVD).
- **Adjacency rule: ≥3:1 luminance between roles a reader must tell apart** — *high*.
  WCAG 1.4.1 (informative) treats a hue difference as an adequate additional cue only
  if the two colours also reach **3:1 relative-luminance contrast**; a role whose
  *specific* colour carries meaning needs a non-colour cue **regardless**. v1 only
  tracked contrast vs background; this is the pairwise, between-accent constraint.
- **Desaturate; never abut saturated red + saturated blue** — *medium (new)*.
  Jiménez et al. 2020 (Vision Research, n=20): spectrally-extreme text/background pairs
  (blue-on-red) heighten and destabilise accommodation via longitudinal chromatic
  aberration; chromostereopsis (textbook optics) gives saturated red+blue a
  depth/"vibration" percept, diminished by desaturating or by an achromatic border.
  → moderate-chroma accents; if two roles use opposite spectral ends, separate them by
  luminance/spacing or mute one.
- **Solarized's real flaw, quantified** — *high*. Selenized (Warchol) measured
  Solarized-**dark** WCAG ratios: body 4.75:1 (barely AA), highlighted-bg 4.11:1
  (below AA), **comments 2.79:1 (fails badly)**, darkest red 3.25:1 (below AA). Its
  fix is a directly adoptable engineering rule: **CIELAB-lightness Δ between every
  accent and the background ≥ 33; spread between darkest and brightest accents ≤ 20**.
  (Author-asserted, no derivation — treat as a strong heuristic.) An independent AA
  fork (solAArized) exists purely to fix Solarized's contrast — consensus the gap is
  real. Selective contrast (hue over luminance) is *also* the exact mechanism that
  breaks CVD accessibility — so lightness-axis separation is the **fix**, not polish.

## 8. Blue light, colour temperature & the night theme (honesty)

- **Blue light from screens is NOT an established cause of eye strain** — *high
  (CONFIRMED)*. AAO (2021): "no scientific evidence that blue light from digital
  devices causes damage", strain is dry-eye from reduced blinking; skip blue-blocking
  glasses. Cochrane 2023 (17 RCTs, 619 pp.): blue-light-filtering lenses give **no**
  eye-strain benefit (MD +9.76, CI crosses 0), no acuity effect. → **Never frame a
  warm theme as eye protection.**
- **Evening blue light DOES affect the circadian system** — *high (NUANCED)*.
  Chang et al. 2015 (PNAS, N=12): 4 h evening light-emitting eReader vs print
  suppressed melatonin ~55%, delayed onset ~1.5 h, worsened next-morning alertness.
  Real effect, distinct from the eye-strain myth. (Single-condition, so not itself
  "dose-response"; the "<2000 K negligible" line is from separate lighting research.)
- **BUT warming CCT without lowering luminance barely helps melatonin** — *high
  (NUANCED)*. Nagare, Plitnick & Figueiro 2019 (N=12, fixed max brightness): Night
  Shift warm (2837 K) 12% vs cool (5997 K) 19% suppression — **not significantly
  different**; both still suppressed. "Changing spectral composition without changing
  brightness may be insufficient." **Intensity, not hue, is the dominant circadian
  lever.** And consumer screen-warming / blue-blockers show **no reliable sleep
  benefit** in controlled trials (Frontiers 2025 meta-analysis; Cochrane indeterminate).
- **Therefore:** a night/warm theme is a **comfort + glare-reduction + modest-alerting**
  feature, not a validated sleep or eye-protection intervention. The circadian-relevant
  property of a dark base is that it is **low-luminance**, not that it is bluish. Offer
  a genuinely **dim, warm-toned** night theme (+ prompt OS/monitor brightness down),
  and a **neutral/cooler** day theme (blue-enriched light mildly increases alertness —
  Chellappa 2011) — as ergonomics, never as a medical claim. Large inter-individual
  ipRGC-sensitivity variance (~50×) argues for **user-configurable** brightness/CCT.

## 9. Fatigue mechanism & behaviour — the highest-leverage levers aren't hue

- **Digital eye strain / CVS is driven by reduced blink rate, sustained
  accommodation, and dry eye — not colour** — *high (NUANCED source)*. Prevalence is
  high (Anbesu & Lema 2023 meta-analysis: pooled ~66%, heterogeneous); the *mechanism*
  is Rosenfield 2011 / Portello & Rosenfield 2013 (blink suppression → tear-film
  instability; accommodative/vergence stress). → colour/polarity is a **secondary
  modulator** of a physiological problem; this bounds how much any palette can reduce
  multi-hour fatigue, and explains why direct colour-scheme effects are small.
- **The 20-20-20 rule: mixed, not settled; blink-retraining has better support** —
  *medium (NUANCED)*. Johnson & Rosenfield 2023 (N=30): varying break frequency did
  **not** change symptoms/speed/accuracy (no support for the exact 20-min/20-s dose);
  Talens-Estarelles et al. 2023 (2-week field, N=29): 20-20-20 *reminders* **did** cut
  dry-eye/strain short-term. A blink-optimisation RCT (Sadhwani 2024) significantly cut
  CVS-Q symptoms and improved tear break-up time. → a bare timed "look away" nudge is
  weakly evidenced; a **blink/rest reminder** has better support. (Outside colour, but
  the strongest fatigue lever the evidence actually validates.)
- **Match display luminance to ambient; auto/adaptive theme is justified** — *high
  (CONFIRMED)*. ISO 9241-303: ~100–150 cd/m² screen at 500 lx ambient; surround
  luminance ratio ≤ ~1:3. Optimum screen luminance **rises with ambient** (Applied Sci.
  2021). Comfort polarity flips with ambient (dim → dark, bright → light). → an
  **ambient-/time-of-day-aware theme + adaptive brightness** is better justified than
  any single fixed base colour.
- **Dark-mode foreground colour matters** — *medium (NUANCED)*. Wei et al. 2024
  (*Sensors*, N=50, light-on-black prose): comfort ranked **Yellow > White > Blue >
  Green > Red**, red clearly worst; **~10 lux ambient beat pitch-black (0 lux)** on
  ocular markers. Caveat: colours were **not** iso-luminant (contrast 3.0 red → 19.6
  yellow), so it may be a luminance-contrast effect, and stimuli were Chinese prose,
  not code. → **avoid pure saturated red as a primary dark-mode foreground**; prefer
  warm/high-luminance text; advise users not to code in a pitch-black room.

## 10. Secondary axes & rendering caveats

- **Emissive vs reflective**: LCD reading is more fatiguing than e-ink/paper over ~1 h
  (Benedetto 2013, N=12) — but the driver is **luminance / image quality**, not
  "emissive per se" (Kretzschmar 2013: with contrast/quality controlled, device type
  didn't matter). → a well-tuned, moderate-luminance emissive IDE is not doomed to
  fatigue.
- **Sub-pixel (ClearType) fringing** — *low*. At ~12–13 px on ~92-PPI 1080p panels,
  coloured glyphs interact with sub-pixel AA to produce colour fringes that compete
  with intentional syntax hues; grayscale AA removes them at some sharpness cost;
  HiDPI hides them; macOS dropped sub-pixel AA in 2018. → don't ship a default that
  depends on hue distinctions at tiny sizes on low-PPI screens; keep a comfortable
  default size.
- **Redundant non-colour cues (weight/italic)** — *medium (NUANCED)*. Nothelfer,
  Gleicher & Franconeri 2017 (JEP:HPP): redundant colour+shape encoding raised
  segmentation accuracy to ~88% vs ~71% for the better single channel — a real
  accuracy/grouping gain, **not merely a colourblindness fallback**. But it buys
  *accuracy/robustness, not scanning speed* (Ergonomics 2003), and glyph *weight* is a
  weaker channel than glyph *shape*, so expect a smaller effect for bold/italic on
  monospace. In APCA terms, **size/weight dominate perceived contrast more than hue**:
  at small code sizes you cannot substitute hue for luminance — to make a token "quiet",
  **drop its weight, not just its Lc**, and keep Lc ≥ 75 for anything meant to be read
  fluently.

## 11. Concrete engineering rules for the Reado palette

A checklist distilled from the above — heuristics, not proven optima:

1. **Two first-class themes**, default from OS/time-of-day; user override wins. Don't
   choose defaults from preference telemetry (preference ≠ measured load).
2. **Light base**: warm off-white (cream/peach), **not** #FFF or cool grey. Optional
   background-warmth slider.
3. **Dark base**: gray-blue **above** #000 (~`base03`); **off-white text, not #FFF**
   (halation). Avoid thin weights on dark.
4. **Body code text**: target **APCA Lc ≥ 90** (≥ 75 minimum) against its background
   in **both** themes; comments/dimmed ≥ **Lc 60**. Always also clear **WCAG 2 AA
   (4.5:1)** as the hard floor. "Quiet" = lower **weight**, not sub-Lc-75 dimming.
5. **≤ 6 semantic roles** + a separate comment/annotation hue outside them.
6. **Accents in OKLCH**, per-mode L/C tuning to hold each role at the same perceptual
   position across themes; chroma-reduce (don't clip) out-of-gamut.
7. **Separate roles on lightness**: Selenized-style **accent↔background CIELAB-ΔL ≥ 33,
   inter-accent spread ≤ 20**; **adjacent roles ≥ 3:1 luminance** from each other, or
   add weight/italic.
8. **Desaturate** accents; never abut saturated red + saturated blue; **no pure
   saturated red foreground in dark mode**.
9. **CVD gate in CI**: Machado-2009 sim (deutan/protan/tritan) + min pairwise CIEDE2000
   + grayscale-survives, both themes. Judge distinguishability with CIEDE2000, not
   Oklab ΔE.
10. **Emphasis on landmarks**: maximal identifier legibility, de-emphasised punctuation,
    consider a distinct declaration/signature emphasis, subtle control-flow beacons —
    not a Christmas tree.
11. **Night theme = dim + warm** (comfort/circadian-via-luminance), **day theme =
    neutral/cool**; never marketed as sleep/eye-protection. Prefer adaptive brightness.

## 12. The persistent gap & caveats

Every facet's open questions converge on the same hole: **no controlled, multi-hour,
code-specific study ranks colour schemes by fatigue or comprehension.** Direct fatigue
trials use prose/gaming/dashboards, ≤ 1 h; highlighting studies measure short-task
comprehension; attention studies constrain *which tokens* matter, not *what colour*
they should be; palette "safety" is simulation/model-based, not reader-validated; APCA's
thresholds are practitioner guidance, not ratified science. Sample sizes are small
(Sarkar n=10, HCII n=17, Rodeghero n=10, Aleman n=7). Solarized/Selenized are designer
rationale. **Treat every specific number here as a design heuristic, expose the knobs
(warmth, brightness, contrast, size) to the user, and don't over-claim.**

## 13. Decision note for Reado

The v1 direction stands and is now better grounded: **ship both, default by context,
gray-blue dark base + warm off-white light base, moderate contrast, restrained
lightness-separated OKLCH accents, comment hue apart.** What v2 adds:

- A **warm** off-white light base is now *evidence-backed* (Rello, N=341), not just
  "not pure white".
- The **night theme is comfort, not medicine** — dim/low-luminance is the lever; drop
  the blue-light-protection framing entirely.
- **APCA governs the *tuning*, WCAG 2 AA governs the *floor*** — never invert them.
- Add **pairwise adjacency (≥3:1)**, **desaturation / no red+blue**, **no pure-red dark
  foreground**, and a **CVD CI gate** as concrete, auditable rules.
- Consider **ambient-/time-of-day-aware** theming and **adaptive brightness** as
  higher-leverage than any fixed base colour, and a **blink/rest** nudge as the
  strongest validated *fatigue* lever (which is not a colour feature at all).

## 14. Key sources (verified)

**Polarity / luminance** — Luzsa & Mayr 2025 (Ergonomics, PMID 39918051) · Piepenbrock,
Mayr & Buchner 2014 (PMID 25135324) · Buchner & Baumgartner 2007 (PMID 17510822) ·
Buchner, Mayr & Brandt 2009 (PMID 19562598) · Xie, Song & Liu 2021 (IEEE Access 9363189)
· Pathari, Nielsen, Andersen & Marentakis, ACHI 2024 · MDPI IJERPH 2025 (PMC12027292) ·
Ettling et al., ETRA 2025 (10.1145/3715669.3725879) · Sethi & Ziat 2023 (Ergonomics
66(12):1814) · Tai, Yang, Larson & Sheedy 2013 (J. Vision).
**Contrast** — Legge, Rubin & Luebker 1987 / Rubin & Legge 1989 (Vision Research) ·
Legge et al. 1990 (JOSA A "XI") · Benedetto et al. 2014 (Comput. Human Behav.) · APCA
"in a Nutshell" / "Why APCA" (apcacontrast.com) · Roselli, "WCAG3 Contrast as of April
2026" · Waller 2022 (Cambridge).
**Highlighting / attention** — Hannebauer, Hesenius & Gruhn 2018 (Empirical SE) ·
Park/Kölling et al., ICER 2023 · Sarkar, PPIG 2015 · Busjahn et al. 2014 (ETRA) & 2015
(ICPC) · Al Madi et al. 2020 (EMIP) · Rodeghero & McMillan 2015 (ESEM) · Turner/Falcone
et al. 2019 (HCII).
**Colour surfaces / dyslexia** — Rello & Bigham 2017 (ASSETS) · Rello & Baeza-Yates 2015
(UAIS) · British Dyslexia Association Style Guide 2023 · Griffiths et al. 2016 (Ophthalmic
Physiol Opt) · Ritchie et al. 2011 (Pediatrics) · AAP/AAO/AAPOS 2009 · Hashemi et al.
2018 (PMID 29564404).
**Colour space / CVD** — Ottosson, Oklab 2020 · Lilley, W3C WCG/HDR 2021 · "Oklch+"
arXiv 2026 · Zeileis & Murrell 2023 (R Journal RJ-2023-071) · Paul Tol, SRON Colour
Schemes 2021 · Birch 2012 (JOSA A) · Machado, Oliveira & Fernandes 2009 (IEEE TVCG) ·
Okabe-Ito / Wong 2011 (Nature Methods) · Nuñez et al. 2018 (cividis, PLOS ONE).
**Blue light / circadian / fatigue** — AAO 2021 · Cochrane 2023 (CD013244.pub2) · Chang
et al. 2015 (PNAS) · Nagare, Plitnick & Figueiro 2019 (Light Res Technol) · Chellappa et
al. 2011 · Anbesu & Lema 2023 (Sci Rep) · Rosenfield 2011 · Johnson & Rosenfield 2023 /
Talens-Estarelles 2023 · Sadhwani 2024 (Cureus) · ISO 9241-303.
**Solarized lineage / redundancy / rendering** — Schoonover, Solarized · Warchol,
Selenized · Pederson, solAArized · Nothelfer, Gleicher & Franconeri 2017 (JEP:HPP) ·
Jiménez et al. 2020 (Vision Research) · Aleman, Wang & Schaeffel 2018 (Sci Rep) ·
Benedetto et al. 2013 (PLOS ONE) · WCAG 2.1 Understanding SC 1.4.1.
