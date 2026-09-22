//! The user's password manager, reached through its own CLI.
//!
//! The browser pane is a system webview: it has no extension host, so Bitwarden's
//! and 1Password's browser extensions cannot exist in it. What both vendors *do*
//! ship is a first-class CLI (`bw`, `op`) that talks to the same vault and unlocks
//! through the same desktop app — the interface they intend non-browser apps to
//! use. This module is that conversation, and nothing else: it never reads a
//! password manager's local database, browser profile, or credential store.
//!
//! Secrets are request-scoped. A password or one-time code is fetched at the
//! moment of the fill, handed back once, and dropped — nothing here caches,
//! persists, or logs a secret. The Bitwarden session token lives in process memory
//! for the app's lifetime and reaches `bw` through its environment, never on the
//! command line (argv is world-readable in `ps`).

use serde::Serialize;
use std::io::Write;
use std::process::Stdio;
use std::sync::Mutex;

/// The Bitwarden session token from `bw unlock`. In memory only: never written to
/// disk, to project files, or to settings, so quitting Reado re-locks the vault.
static SESSION: Mutex<Option<String>> = Mutex::new(None);

/// The 1Password session: the environment variable `op signin` names, and its
/// token. In memory only, exactly like the Bitwarden one.
///
/// Without it, `op` asks the 1Password app to authorize *every single
/// invocation* — and one fill is several invocations (list the logins, read each
/// one's username, fetch the password, fetch the code). That is the wall of
/// approval prompts; a session makes it one.
static OP_SESSION: Mutex<Option<(String, String)>> = Mutex::new(None);

/// Set once `op signin` has failed, so a vault that cannot hand out a session
/// (no account configured, sign-in declined) doesn't get asked again on every
/// call — which would *add* a prompt per command instead of removing them.
static OP_SIGNIN_FAILED: Mutex<bool> = Mutex::new(false);

/// The login list `op item list` prints, and when it was fetched.
///
/// Every `op` invocation is one approval prompt from the 1Password app, and this
/// list is the *same document* for every site — `op` is not asked to filter, the
/// matching happens here. Fetching it once and reusing it is the difference
/// between a prompt per page and a prompt per session. It holds titles, ids and
/// URLs — never a password, which is still fetched at the moment of the fill.
static OP_LIST: Mutex<Option<(std::time::Instant, String)>> = Mutex::new(None);

/// How long a cached login list stays good. Long enough that a sign-in walking
/// three origins asks once; short enough that a login added in the 1Password app
/// shows up without restarting Reado.
const OP_LIST_TTL: std::time::Duration = std::time::Duration::from_secs(300);

/// The CLI we drive, preferring 1Password when both are installed (it brokers its
/// own biometric unlock, so it needs no session handling from us).
///
/// Resolution goes through the *login-shell* PATH: a Finder-launched GUI inherits
/// a stripped PATH that misses every brew/npm-global install, which would make a
/// perfectly installed `op` invisible.
fn backend() -> Option<&'static str> {
    ["op", "bw"].into_iter().find(|b| crate::proc::on_path(b))
}

/// Which backend is available, and whether it needs unlocking before use.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultStatus {
    /// `"op"`, `"bw"`, or `None` when neither CLI is installed.
    pub backend: Option<String>,
    pub locked: bool,
}

/// A vault login, as offered to the user. Deliberately **carries no secret**: the
/// password and the one-time code are separate, per-use fetches.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultItem {
    pub id: String,
    pub title: String,
    pub username: String,
    pub has_otp: bool,
}

/// What one fill needs, read in a single CLI invocation. Request-scoped like
/// every secret here: handed back once and dropped, never cached.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultSecret {
    pub username: String,
    pub password: String,
    pub has_otp: bool,
}

/// Run a vault CLI and return its stdout, or its own stderr as the error — a
/// locked vault, a missing sign-in and a network failure all say so themselves,
/// and the user is better served by the CLI's wording than by ours.
fn run(program: &str, args: &[&str], stdin: Option<&str>) -> Result<String, String> {
    let mut cmd = crate::proc::command(program);
    cmd.args(args);
    // Both sessions go in the environment, never on argv (which `ps` shows to
    // every process on the machine).
    if program == "bw" {
        if let Some(s) = SESSION.lock().ok().and_then(|g| g.clone()) {
            cmd.env("BW_SESSION", s);
        }
    }
    if program == "op" {
        if let Some((name, token)) = OP_SESSION.lock().ok().and_then(|g| g.clone()) {
            cmd.env(name, token);
        }
    }
    cmd.stdin(if stdin.is_some() {
        Stdio::piped()
    } else {
        Stdio::null()
    })
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("failed to run {program}: {e}"))?;
    if let Some(text) = stdin {
        child
            .stdin
            .as_mut()
            .ok_or("no stdin")?
            .write_all(text.as_bytes())
            .map_err(|e| e.to_string())?;
    }
    let out = child.wait_with_output().map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    } else {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        Err(if err.is_empty() {
            format!("{program} exited with status {}", out.status)
        } else {
            err
        })
    }
}

/// Parse the `export OP_SESSION_xyz="token"` line `op signin` prints.
///
/// The variable is read out of the output rather than assembled from an account
/// id: `op` names it after the account itself, and the shape of that name has
/// changed between CLI versions. Letting `op` say it means never guessing wrong —
/// and a line we can't parse simply leaves the session unset, which is exactly
/// how this behaved before there was one.
fn parse_op_session(out: &str) -> Option<(String, String)> {
    let line = out.lines().find(|l| l.contains("OP_SESSION"))?;
    let start = line.find("OP_SESSION")?;
    let rest = &line[start..];
    let eq = rest.find('=')?;
    let name = rest[..eq].trim().to_string();
    let value = rest[eq + 1..]
        .trim()
        .trim_matches(['"', '\'', ';'])
        .to_string();
    if name.len() <= "OP_SESSION_".len() || value.is_empty() {
        return None;
    }
    Some((name, value))
}

/// Whether an `op` failure means "your session is no longer good" — the one case
/// worth re-signing in and retrying for.
fn is_op_auth_error(err: &str) -> bool {
    let e = err.to_ascii_lowercase();
    e.contains("session")
        || e.contains("sign in")
        || e.contains("signed in")
        || e.contains("authoriz")
}

/// Run an `op` command with a session in place, so the 1Password app authorizes
/// Reado once instead of once per command.
///
/// The first call signs in (one approval prompt); later ones ride the token. When
/// it expires, `op` says so and this signs in again and retries — once, so a
/// genuinely failing command can't loop the user through prompts.
fn op_run(args: &[&str]) -> Result<String, String> {
    ensure_op_session();
    match run("op", args, None) {
        Err(e) if is_op_auth_error(&e) => {
            *OP_SESSION.lock().map_err(|e| e.to_string())? = None;
            *OP_SIGNIN_FAILED.lock().map_err(|e| e.to_string())? = false;
            ensure_op_session();
            run("op", args, None)
        }
        other => other,
    }
}

/// Get a session token if we don't have one. Best-effort: when `op` won't give
/// one (no account configured, the user declined), commands still run — they just
/// authorize one at a time, as they did before.
fn ensure_op_session() {
    if OP_SESSION.lock().is_ok_and(|g| g.is_some()) {
        return;
    }
    if OP_SIGNIN_FAILED.lock().is_ok_and(|f| *f) {
        return;
    }
    // `op signin` (not `--raw`) prints the assignment, naming its own variable.
    match run("op", &["signin"], None)
        .ok()
        .as_deref()
        .and_then(parse_op_session)
    {
        Some(session) => {
            if let Ok(mut g) = OP_SESSION.lock() {
                *g = Some(session);
            }
        }
        None => {
            if let Ok(mut f) = OP_SIGNIN_FAILED.lock() {
                *f = true;
            }
        }
    }
}

/// The host of a URL, lowercased — the unit origin matching works in.
fn host_of(url: &str) -> Option<String> {
    tauri::Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(|h| h.to_ascii_lowercase()))
}

/// How well a vault entry's stored URL matches the page: `Some(0)` for the same
/// host, `Some(1)` when one is a dotted suffix of the other (so `app.example.com`
/// finds the `example.com` entry, and vice versa), `None` for no relation.
///
/// The suffix test requires a dot boundary, so `notexample.com` never matches
/// `example.com`, and requires the shorter side to have a dot of its own, so a
/// bare TLD entry can't match the world.
fn rank(stored: &str, page_host: &str) -> Option<u8> {
    let stored_host = host_of(stored).or_else(|| host_of(&format!("https://{stored}")))?;
    if stored_host == page_host {
        return Some(0);
    }
    let suffix_of =
        |long: &str, short: &str| short.contains('.') && long.ends_with(&format!(".{short}"));
    if suffix_of(page_host, &stored_host) || suffix_of(&stored_host, page_host) {
        return Some(1);
    }
    None
}

/// The best rank across an entry's stored URLs.
fn best_rank(stored: &[String], page_host: &str) -> Option<u8> {
    stored.iter().filter_map(|s| rank(s, page_host)).min()
}

/// Exact-host matches first, then suffix matches, each group by title — so the
/// user reads a stable, predictable list.
fn sort_items(items: &mut [(u8, VaultItem)]) {
    items.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.title.cmp(&b.1.title)));
}

/// URLs stored on a 1Password item, from either shape `op` emits (`urls` on the
/// item, or the older `overview.urls`).
fn op_urls(item: &serde_json::Value) -> Vec<String> {
    item.get("urls")
        .or_else(|| item.get("overview").and_then(|o| o.get("urls")))
        .and_then(|u| u.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|u| {
                    u.get("href")
                        .or_else(|| u.get("url"))
                        .and_then(|h| h.as_str())
                        .map(str::to_string)
                })
                .collect()
        })
        .unwrap_or_default()
}

/// The full login list, fetched at most once per [`OP_LIST_TTL`].
fn op_list() -> Result<String, String> {
    let cached = OP_LIST.lock().ok().and_then(|g| {
        g.as_ref()
            .filter(|(at, _)| at.elapsed() < OP_LIST_TTL)
            .map(|(_, json)| json.clone())
    });
    if let Some(json) = cached {
        return Ok(json);
    }
    let json = op_run(&["item", "list", "--categories", "Login", "--format", "json"])?;
    if let Ok(mut g) = OP_LIST.lock() {
        *g = Some((std::time::Instant::now(), json.clone()));
    }
    Ok(json)
}

/// Forget the cached list, so an item saved a moment ago is offered by the next
/// lookup instead of five minutes from now.
fn op_forget_list() {
    if let Ok(mut g) = OP_LIST.lock() {
        *g = None;
    }
}

/// The `op item list` entries whose stored URLs match the page, ranked.
///
/// Everything the list shows comes out of that one document: `op item list`
/// already carries the account name as `additional_information`, which is what
/// 1Password itself prints under the title. Reading each match with its own
/// `op item get` is what turned one fill into a wall of approval prompts —
/// whether an item also holds a one-time code is learned from the fill, which
/// reads the item anyway.
fn op_items(list_json: &str, page_host: &str) -> Vec<VaultItem> {
    let items: Vec<serde_json::Value> = serde_json::from_str(list_json).unwrap_or_default();
    let mut ranked: Vec<(u8, VaultItem)> = items
        .iter()
        .filter_map(|it| {
            let r = best_rank(&op_urls(it), page_host)?;
            Some((
                r,
                VaultItem {
                    id: it.get("id")?.as_str()?.to_string(),
                    title: str_at(it, "title"),
                    username: str_at(it, "additional_information"),
                    has_otp: false,
                },
            ))
        })
        .collect();
    sort_items(&mut ranked);
    ranked.into_iter().map(|(_, i)| i).collect()
}

/// A string field of a JSON object, or "" when it is absent or isn't a string.
fn str_at(v: &serde_json::Value, key: &str) -> String {
    v.get(key)
        .and_then(|x| x.as_str())
        .unwrap_or_default()
        .to_string()
}

/// What a fill needs, out of one `op item get --format json --reveal`: the
/// account name, the password, and whether a one-time-password field exists. The
/// OTP *secret* is not read here — `vault_otp` asks `op` for the current code at
/// the moment the user asks for it.
fn op_secret(item_json: &str) -> VaultSecret {
    let doc: serde_json::Value = serde_json::from_str(item_json).unwrap_or_default();
    let fields = doc
        .get("fields")
        .and_then(|f| f.as_array())
        .cloned()
        .unwrap_or_default();
    let field = |want: &str| {
        fields
            .iter()
            .find(|f| {
                [f.get("id"), f.get("label")]
                    .iter()
                    .flatten()
                    .filter_map(|v| v.as_str())
                    .any(|v| v.eq_ignore_ascii_case(want))
            })
            .map(|f| str_at(f, "value"))
            .unwrap_or_default()
    };
    VaultSecret {
        username: field("username"),
        password: field("password"),
        has_otp: fields.iter().any(|f| {
            f.get("type")
                .and_then(|t| t.as_str())
                .is_some_and(|t| t.eq_ignore_ascii_case("OTP"))
        }),
    }
}

/// The same three things out of a `bw get item` document.
fn bw_secret(item_json: &str) -> VaultSecret {
    let doc: serde_json::Value = serde_json::from_str(item_json).unwrap_or_default();
    let login = doc.get("login").cloned().unwrap_or_default();
    VaultSecret {
        username: str_at(&login, "username"),
        password: str_at(&login, "password"),
        has_otp: !str_at(&login, "totp").is_empty(),
    }
}

/// `bw list items --url …` already filters by URI, but its matching is looser than
/// ours and it returns the whole item — so we re-rank against the page host and
/// drop every secret before the list leaves this function.
fn bw_items(list_json: &str, page_host: &str) -> Vec<VaultItem> {
    let items: Vec<serde_json::Value> = serde_json::from_str(list_json).unwrap_or_default();
    let mut ranked: Vec<(u8, VaultItem)> = items
        .iter()
        .filter_map(|it| {
            let login = it.get("login")?;
            let urls: Vec<String> = login
                .get("uris")
                .and_then(|u| u.as_array())
                .map(|a| {
                    a.iter()
                        .filter_map(|u| u.get("uri").and_then(|v| v.as_str()).map(str::to_string))
                        .collect()
                })
                .unwrap_or_default();
            let r = best_rank(&urls, page_host)?;
            Some((
                r,
                VaultItem {
                    id: it.get("id")?.as_str()?.to_string(),
                    title: it
                        .get("name")
                        .and_then(|n| n.as_str())
                        .unwrap_or("")
                        .to_string(),
                    username: login
                        .get("username")
                        .and_then(|u| u.as_str())
                        .unwrap_or("")
                        .to_string(),
                    has_otp: login
                        .get("totp")
                        .is_some_and(|t| !t.is_null() && t.as_str().is_some_and(|s| !s.is_empty())),
                },
            ))
        })
        .collect();
    sort_items(&mut ranked);
    ranked.into_iter().map(|(_, i)| i).collect()
}

/// The Bitwarden item document for a new login, ready to be base64-encoded for
/// `bw create item` (which takes its input encoded, not as a file).
fn bw_new_item(url: &str, title: &str, username: &str, password: &str) -> String {
    serde_json::json!({
        "type": 1,
        "name": title,
        "favorite": false,
        "login": {
            "username": username,
            "password": password,
            "uris": [{ "match": null, "uri": url }],
        },
    })
    .to_string()
}

/// A generated password: 20 characters over an unambiguous alphabet (no `l`/`1`,
/// `O`/`0`), with punctuation sites accept. Generated here rather than by the CLI
/// so both backends behave the same.
fn generate_password() -> String {
    use rand::Rng;
    const CHARS: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*-_=+";
    let mut rng = rand::thread_rng();
    (0..20)
        .map(|_| CHARS[rng.gen_range(0..CHARS.len())] as char)
        .collect()
}

/// Which password manager Reado can talk to, and whether it is locked.
#[tauri::command]
pub async fn vault_status() -> VaultStatus {
    tauri::async_runtime::spawn_blocking(|| {
        let Some(b) = backend() else {
            return VaultStatus {
                backend: None,
                locked: false,
            };
        };
        // `op` brokers its own unlock through the 1Password app, so it is never
        // "locked" from our side; `bw` says so itself.
        let locked = b == "bw"
            && run("bw", &["status"], None)
                .ok()
                .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
                .and_then(|v| v.get("status").and_then(|s| s.as_str()).map(String::from))
                .is_none_or(|s| s != "unlocked");
        VaultStatus {
            backend: Some(b.to_string()),
            locked,
        }
    })
    .await
    .unwrap_or(VaultStatus {
        backend: None,
        locked: false,
    })
}

/// Unlock Bitwarden. The master password goes to `bw` on **stdin** and the session
/// it returns is kept in memory for this run only.
#[tauri::command]
pub async fn vault_unlock(password: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let session = run("bw", &["unlock", "--raw"], Some(&format!("{password}\n")))?;
        if session.is_empty() {
            return Err("bw returned no session".into());
        }
        *SESSION.lock().map_err(|e| e.to_string())? = Some(session);
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// The logins matching `url`'s origin, best match first — ids and usernames only.
#[tauri::command]
pub async fn vault_lookup(url: String) -> Result<Vec<VaultItem>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let host = host_of(&url).ok_or("not a URL")?;
        match backend().ok_or("no password manager CLI found")? {
            "op" => Ok(op_items(&op_list()?, &host)),
            _ => Ok(bw_items(
                &run("bw", &["list", "items", "--url", &url], None)?,
                &host,
            )),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// One item's account name and password, fetched at the moment of the fill —
/// one invocation, so one approval prompt. The one-time code is not in it: a
/// code fetched before it is asked for has expired by the time it is used.
#[tauri::command]
pub async fn vault_secret(id: String) -> Result<VaultSecret, String> {
    tauri::async_runtime::spawn_blocking(move || {
        match backend().ok_or("no password manager CLI found")? {
            "op" => Ok(op_secret(&op_run(&[
                "item", "get", &id, "--format", "json", "--reveal",
            ])?)),
            _ => Ok(bw_secret(&run("bw", &["get", "item", &id], None)?)),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// One item's current one-time code. Requested when asked for, never stored.
#[tauri::command]
pub async fn vault_otp(id: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        match backend().ok_or("no password manager CLI found")? {
            "op" => op_run(&["item", "get", &id, "--otp"]),
            _ => run("bw", &["get", "totp", &id], None),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Save a new login for `url` and return the generated password, so the caller can
/// fill the signup form with the value the vault now holds. A failed save is an
/// error: the user must never be left with a credential that exists only in a page.
#[tauri::command]
pub async fn vault_create(url: String, title: String, username: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let password = generate_password();
        match backend().ok_or("no password manager CLI found")? {
            "op" => {
                op_run(&[
                    "item",
                    "create",
                    "--category=login",
                    &format!("--title={title}"),
                    &format!("--url={url}"),
                    &format!("username={username}"),
                    &format!("password={password}"),
                ])?;
                // The list this came from is now one item out of date.
                op_forget_list();
            }
            _ => {
                let doc = bw_new_item(&url, &title, &username, &password);
                let encoded = crate::fs::base64_encode(doc.as_bytes());
                run("bw", &["create", "item", &encoded], None)?;
            }
        }
        Ok(password)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_session_variable_op_names_for_itself() {
        let out = "export OP_SESSION_my_account=\"abc123\"\n";
        assert_eq!(
            parse_op_session(out),
            Some(("OP_SESSION_my_account".into(), "abc123".into()))
        );
        // Shell-flavoured variants: a trailing semicolon, no quotes, no `export`.
        assert_eq!(
            parse_op_session("OP_SESSION_x=tok;"),
            Some(("OP_SESSION_x".into(), "tok".into()))
        );
        // Nothing to parse leaves the session unset rather than inventing one.
        assert_eq!(parse_op_session("please sign in"), None);
        assert_eq!(parse_op_session("export OP_SESSION_x=\"\""), None);
    }

    #[test]
    fn retries_only_on_a_session_failure() {
        assert!(is_op_auth_error("session expired"));
        assert!(is_op_auth_error("You are not currently signed in"));
        assert!(!is_op_auth_error("item not found"));
    }

    #[test]
    fn ranks_exact_host_above_a_subdomain_relation() {
        assert_eq!(rank("https://example.com", "example.com"), Some(0));
        assert_eq!(rank("https://example.com", "app.example.com"), Some(1));
        assert_eq!(rank("https://app.example.com", "example.com"), Some(1));
    }

    #[test]
    fn refuses_a_host_that_merely_ends_the_same_way() {
        assert_eq!(rank("https://example.com", "notexample.com"), None);
        // A bare TLD entry must not match every site under it.
        assert_eq!(rank("https://com", "example.com"), None);
    }

    #[test]
    fn accepts_a_stored_url_with_no_scheme() {
        assert_eq!(rank("example.com", "example.com"), Some(0));
    }

    #[test]
    fn op_items_are_matched_by_url_and_ordered_exact_first() {
        let list = r#"[
          {"id":"a","title":"Zeta","urls":[{"href":"https://app.example.com"}]},
          {"id":"b","title":"Alpha","additional_information":"me@example.com",
            "urls":[{"href":"https://example.com/login"}]},
          {"id":"c","title":"Other","urls":[{"href":"https://elsewhere.test"}]},
          {"id":"d","title":"Beta","overview":{"urls":[{"url":"https://example.com"}]}}
        ]"#;
        let m = op_items(list, "example.com");
        let ids: Vec<&str> = m.iter().map(|i| i.id.as_str()).collect();
        // b and d are exact (ordered by title: Alpha, Beta), a is the subdomain
        // relation, c doesn't match at all.
        assert_eq!(ids, ["b", "d", "a"]);
        // The account name rides along in the list — no second `op` call for it.
        assert_eq!(m[0].username, "me@example.com");
    }

    #[test]
    fn op_secret_reads_the_login_and_spots_a_one_time_password() {
        let doc = r#"{"fields":[
          {"id":"username","value":"me@example.com"},
          {"id":"password","value":"s3cr3t"},
          {"id":"totp","label":"one-time password","type":"OTP","value":"otpauth://x"}
        ]}"#;
        assert_eq!(
            op_secret(doc),
            VaultSecret {
                username: "me@example.com".into(),
                password: "s3cr3t".into(),
                has_otp: true,
            }
        );
        let no_otp = r#"{"fields":[{"label":"username","value":"u"}]}"#;
        assert_eq!(
            op_secret(no_otp),
            VaultSecret {
                username: "u".into(),
                password: String::new(),
                has_otp: false,
            }
        );
    }

    #[test]
    fn bw_secret_reads_the_login_from_one_item_document() {
        let doc = r#"{"id":"1","login":{"username":"u","password":"p","totp":"seed"}}"#;
        assert_eq!(
            bw_secret(doc),
            VaultSecret {
                username: "u".into(),
                password: "p".into(),
                has_otp: true,
            }
        );
        // No login section at all (a note, a card) is empty, not a panic.
        assert_eq!(bw_secret("{}"), VaultSecret::default());
    }

    #[test]
    fn bw_items_carry_no_secret_and_report_otp_presence() {
        let list = r#"[
          {"id":"1","name":"Example","login":{"username":"u","password":"p","totp":"seed",
            "uris":[{"uri":"https://example.com"}]}},
          {"id":"2","name":"Nope","login":{"username":"x","password":"p","totp":null,
            "uris":[{"uri":"https://other.test"}]}}
        ]"#;
        let items = bw_items(list, "example.com");
        assert_eq!(
            items,
            vec![VaultItem {
                id: "1".into(),
                title: "Example".into(),
                username: "u".into(),
                has_otp: true,
            }]
        );
        // The password never rides along in the list payload.
        assert!(!serde_json::to_string(&items).unwrap().contains("\"p\""));
    }

    #[test]
    fn bw_new_item_is_a_login_with_the_page_url() {
        let doc: serde_json::Value =
            serde_json::from_str(&bw_new_item("https://example.com", "Example", "u", "pw"))
                .unwrap();
        assert_eq!(doc["type"], 1);
        assert_eq!(doc["login"]["username"], "u");
        assert_eq!(doc["login"]["password"], "pw");
        assert_eq!(doc["login"]["uris"][0]["uri"], "https://example.com");
    }

    #[test]
    fn generated_passwords_are_long_and_not_repeated() {
        let a = generate_password();
        assert_eq!(a.chars().count(), 20);
        assert_ne!(a, generate_password());
        // The ambiguous characters are left out on purpose.
        assert!(!a.contains(['l', '1', 'O', '0']));
    }
}
