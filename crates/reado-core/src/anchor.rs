//! Anchoring: re-locating a comment's line range after the file changed. Pure —
//! the IO side is `store::reanchor_file`.

use crate::Context;

const FUZZY_THRESHOLD: f32 = 0.6;
// Snippet-alone matching (step 3) has no surrounding context to corroborate it,
// so it demands a higher bar than the context-guarded path. Otherwise two short,
// boilerplate-heavy lines (`export function …`, `return …`) from *different*
// functions clear 0.6 and a comment silently relocates onto a sibling instead of
// orphaning.
const FUZZY_SNIPPET_ONLY_THRESHOLD: f32 = 0.8;
const CONTEXT_LINES: usize = 3;

/// Capture an adaptive context snapshot for the 1-based inclusive range.
pub fn extract_context(content: &str, start: u32, end: u32) -> Context {
    let lines: Vec<&str> = content.lines().collect();
    let n = lines.len();
    let s = (start.max(1) as usize) - 1;
    let e = ((end.max(start).max(1) as usize) - 1).min(n.saturating_sub(1));
    if s >= n {
        return Context::default();
    }
    let join = |a: usize, b: usize| lines[a..=b.min(n - 1)].join("\n");
    Context {
        snippet: join(s, e),
        before: if s > 0 {
            join(s.saturating_sub(CONTEXT_LINES), s - 1)
        } else {
            String::new()
        },
        after: if e + 1 < n {
            join(e + 1, (e + CONTEXT_LINES).min(n - 1))
        } else {
            String::new()
        },
    }
}

/// Average bigram similarity of a window against a target block (both already
/// trimmed line-by-line), or `None` when the lengths preclude a comparison.
fn window_score(window: &[String], target: &[String]) -> f32 {
    if target.is_empty() {
        return 0.0;
    }
    window
        .iter()
        .zip(target)
        .map(|(a, b)| similarity(a, b))
        .sum::<f32>()
        / target.len() as f32
}

/// Best fuzzy position of `target` within `lines`, with its score. On tied
/// scores, prefer the window nearest `near` (the old 0-based position) — repeated
/// blocks otherwise snap to the last occurrence regardless of proximity.
fn best_fuzzy(lines: &[String], target: &[String], near: usize) -> Option<(usize, f32)> {
    let len = target.len();
    if len == 0 || lines.len() < len {
        return None;
    }
    let dist = |i: usize| (i as i64 - near as i64).abs();
    (0..=lines.len() - len)
        .map(|i| (i, window_score(&lines[i..i + len], target)))
        .max_by(|a, b| a.1.total_cmp(&b.1).then_with(|| dist(b.0).cmp(&dist(a.0))))
}

/// How well the lines surrounding an exact match at `i` (of `len` lines) agree
/// with the stored `before`/`after` context. `1.0` when there is no context to
/// check. Each side is aligned independently (before ends at `i`, after starts
/// after the snippet) and boundary-clamped, so a match near the file edge still
/// scores fairly.
fn ctx_score_at(
    lines: &[String],
    i: usize,
    len: usize,
    before: &[String],
    after: &[String],
) -> f32 {
    let mut sum = 0.0f32;
    let mut cnt = 0u32;
    if !before.is_empty() {
        let k = before.len().min(i);
        sum += if k == 0 {
            0.0
        } else {
            window_score(&lines[i - k..i], &before[before.len() - k..])
        };
        cnt += 1;
    }
    if !after.is_empty() {
        let k = after.len().min(lines.len().saturating_sub(i + len));
        sum += if k == 0 {
            0.0
        } else {
            window_score(&lines[i + len..i + len + k], &after[..k])
        };
        cnt += 1;
    }
    if cnt == 0 {
        1.0
    } else {
        sum / cnt as f32
    }
}

/// Recompute a comment's 1-based line range against new file content, using the
/// full anchored context (before + snippet + after). Returns `None` when the
/// anchor can no longer be located (orphan).
///
/// Strategy, most-precise first:
///   1. Exact match of the snippet block (closest to the old position).
///   2. **Context window** — slide `before + snippet + after` and take the
///      snippet sub-range of the best match. This survives edits to the snippet
///      itself, as long as the surrounding lines are stable, which is the common
///      case the plain snippet match would orphan.
///   3. Fuzzy match of the snippet alone.
pub fn relocate(old_start: u32, context: &Context, new_content: &str) -> Option<(u32, u32)> {
    let trim = |s: &str| -> Vec<String> { s.lines().map(|l| l.trim().to_string()).collect() };
    let snip = trim(&context.snippet);
    if snip.is_empty() {
        return None;
    }
    let lines = trim(new_content);
    let len = snip.len();
    if lines.is_empty() {
        return None;
    }
    let before = trim(&context.before);
    let after = trim(&context.after);
    let has_ctx = !before.is_empty() || !after.is_empty();
    let near = (old_start as usize).saturating_sub(1);

    // 1. Exact snippet block. With surrounding context, only accept an exact
    //    match the context corroborates — otherwise a byte-identical *duplicate*
    //    elsewhere would steal the comment from an edited original. Among the
    //    accepted matches, take the one nearest the old line.
    let dist = |i: usize| ((i as i64 + 1) - old_start as i64).abs();
    let exact: Vec<usize> = (0..=lines.len().saturating_sub(len))
        .filter(|&i| lines.get(i..i + len).is_some_and(|w| w == snip.as_slice()))
        .collect();
    if has_ctx {
        if let Some(&i) = exact
            .iter()
            .filter(|&&i| ctx_score_at(&lines, i, len, &before, &after) >= FUZZY_THRESHOLD)
            .min_by_key(|&&i| dist(i))
        {
            return Some(((i + 1) as u32, (i + len) as u32));
        }
        // No exact match is context-corroborated → fall through to the context
        // window, which follows an edited original with stable surroundings.
    } else if let Some(&i) = exact.iter().min_by_key(|&&i| dist(i)) {
        return Some(((i + 1) as u32, (i + len) as u32));
    }

    // 2. Context window: anchor by the surrounding lines so an edited snippet
    //    still follows. Only worthwhile when there is real context to lean on.
    if has_ctx {
        let blen = before.len();
        let window: Vec<String> = before.iter().chain(&snip).chain(&after).cloned().collect();
        if let Some((i, score)) = best_fuzzy(&lines, &window, near.saturating_sub(blen)) {
            // Weight context fully but require the surrounding lines to be a
            // strong match, so we don't drag an anchor onto unrelated code.
            let ctx_only: Vec<String> = before.iter().chain(&after).cloned().collect();
            let ctx_window: Vec<String> = lines[i..i + window.len()]
                .iter()
                .enumerate()
                .filter(|(k, _)| *k < blen || *k >= blen + len)
                .map(|(_, l)| l.clone())
                .collect();
            let ctx_score = window_score(&ctx_window, &ctx_only);
            if score >= FUZZY_THRESHOLD && ctx_score >= FUZZY_THRESHOLD {
                let s = i + blen;
                return Some(((s + 1) as u32, (s + len) as u32));
            }
        }
    }

    // 3. Fuzzy snippet alone — stricter bar, no context to lean on.
    match best_fuzzy(&lines, &snip, near) {
        Some((i, score)) if score >= FUZZY_SNIPPET_ONLY_THRESHOLD => {
            Some(((i + 1) as u32, (i + len) as u32))
        }
        _ => None,
    }
}

/// Sørensen–Dice similarity of two strings over character bigrams (0.0–1.0).
fn similarity(a: &str, b: &str) -> f32 {
    if a == b {
        return 1.0;
    }
    let bigrams = |s: &str| -> Vec<[char; 2]> {
        let chars: Vec<char> = s.chars().collect();
        chars.windows(2).map(|w| [w[0], w[1]]).collect()
    };
    let mut ba = bigrams(a);
    let bb = bigrams(b);
    if ba.is_empty() || bb.is_empty() {
        return 0.0;
    }
    let (total_a, total_b) = (ba.len(), bb.len());
    let mut shared = 0usize;
    for bigram in bb {
        if let Some(pos) = ba.iter().position(|&x| x == bigram) {
            ba.swap_remove(pos);
            shared += 1;
        }
    }
    2.0 * shared as f32 / (total_a + total_b) as f32
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx(snippet: &str) -> Context {
        Context {
            snippet: snippet.into(),
            before: String::new(),
            after: String::new(),
        }
    }

    #[test]
    fn relocate_follows_lines_inserted_above() {
        let snippet = "fn compute(x: i32) -> i32 {\n    x * 2\n}";
        let new = "// new\n// lines\n// here\nfn compute(x: i32) -> i32 {\n    x * 2\n}\n";
        assert_eq!(relocate(1, &ctx(snippet), new), Some((4, 6)));
    }

    #[test]
    fn relocate_fuzzy_tolerates_a_small_edit() {
        let snippet = "let total = items.iter().sum();\nreturn total;";
        let new = "let total = items.iter().copied().sum();\nreturn total;\n";
        assert_eq!(relocate(1, &ctx(snippet), new), Some((1, 2)));
    }

    #[test]
    fn relocate_orphans_when_gone() {
        let snippet = "this exact code\nno longer exists anywhere";
        let new = "completely\ndifferent\ncontent\n";
        assert_eq!(relocate(1, &ctx(snippet), new), None);
    }

    #[test]
    fn relocate_orphans_rather_than_jumping_to_a_boilerplate_sibling() {
        // The commented function is deleted; only a structurally similar sibling
        // remains. Shared boilerplate ("export function …", "return …") must not
        // be enough to drag the comment onto the wrong function — orphan instead.
        let snippet = "export function greet(name) {\n  return `Hi, ${name}!`;";
        let new = "// header line A\n\nexport function add(a, b) {\n  return a + b;\n}\n";
        assert_eq!(relocate(1, &ctx(snippet), new), None);
    }

    #[test]
    fn relocate_follows_an_edited_snippet_via_context() {
        // The commented line itself is rewritten *and* a line is inserted above.
        // Snippet-only fuzzy would orphan; the stable before/after carry it.
        let context = Context {
            before: "fn outer() {\n  let a = 1;".into(),
            snippet: "  let b = compute(a);".into(),
            after: "  return b;\n}".into(),
        };
        let new = "// header\nfn outer() {\n  let a = 1;\n  let b = compute(a, opts) ?? fallback;\n  return b;\n}\n";
        assert_eq!(relocate(3, &context, new), Some((4, 4)));
    }

    #[test]
    fn relocate_prefers_edited_original_over_untouched_duplicate() {
        // A block is duplicated elsewhere with different surroundings. The
        // commented ORIGINAL is edited (its snippet no longer matches exactly);
        // the far duplicate is byte-identical. The exact match at the duplicate
        // must NOT steal the comment — the stable before/after keep it on the
        // edited original.
        let context = Context {
            before: "fn original() {".into(),
            snippet: "    let v = compute(x);".into(),
            after: "    return v;\n}".into(),
        };
        let new = "fn original() {\n    let v = compute(x, opts);\n    return v;\n}\n\nmod other {\n    let v = compute(x);\n    log(v);\n}\n";
        assert_eq!(relocate(2, &context, new), Some((2, 2)));
    }

    #[test]
    fn relocate_context_does_not_drag_onto_unrelated_code() {
        // Snippet gone and the surrounding context also absent → orphan, not a
        // false match somewhere else.
        let context = Context {
            before: "specific anchor line one\nspecific anchor line two".into(),
            snippet: "the body that vanished".into(),
            after: "specific tail line one\nspecific tail line two".into(),
        };
        let new = "totally\nunrelated\nfile\ncontents\nhere\n";
        assert_eq!(relocate(2, &context, new), None);
    }
}
