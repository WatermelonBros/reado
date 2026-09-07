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

/// Run a vault CLI and return its stdout, or its own stderr as the error — a
/// locked vault, a missing sign-in and a network failure all say so themselves,
/// and the user is better served by the CLI's wording than by ours.
fn run(program: &str, args: &[&str], stdin: Option<&str>) -> Result<String, String> {
    let mut cmd = crate::proc::command(program);
    cmd.args(args);
    // The Bitwarden session goes in the environment, never on argv.
    if program == "bw" {
        if let Some(s) = SESSION.lock().ok().and_then(|g| g.clone()) {
            cmd.env("BW_SESSION", s);
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

/// The ids of `op item list` entries whose stored URLs match the page, ranked.
fn op_matches(list_json: &str, page_host: &str) -> Vec<(u8, String, String)> {
    let items: Vec<serde_json::Value> = serde_json::from_str(list_json).unwrap_or_default();
    let mut out: Vec<(u8, String, String)> = items
        .iter()
        .filter_map(|it| {
            let id = it.get("id")?.as_str()?.to_string();
            let title = it
                .get("title")
                .and_then(|t| t.as_str())
                .unwrap_or("")
                .to_string();
            let r = best_rank(&op_urls(it), page_host)?;
            Some((r, id, title))
        })
        .collect();
    out.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.2.cmp(&b.2)));
    out
}

/// The username and whether a one-time-password field exists, from a full
/// `op item get --format json` document. The OTP *secret* is never read here —
/// only its presence, so the UI knows whether to offer the action.
fn op_detail(item_json: &str) -> (String, bool) {
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
            .and_then(|f| f.get("value"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string()
    };
    let has_otp = fields.iter().any(|f| {
        f.get("type")
            .and_then(|t| t.as_str())
            .is_some_and(|t| t.eq_ignore_ascii_case("OTP"))
    });
    (field("username"), has_otp)
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
            "op" => {
                let list = run(
                    "op",
                    &["item", "list", "--categories", "Login", "--format", "json"],
                    None,
                )?;
                op_matches(&list, &host)
                    .into_iter()
                    .map(|(_, id, title)| {
                        let detail = run("op", &["item", "get", &id, "--format", "json"], None)?;
                        let (username, has_otp) = op_detail(&detail);
                        Ok(VaultItem {
                            id,
                            title,
                            username,
                            has_otp,
                        })
                    })
                    .collect()
            }
            _ => Ok(bw_items(
                &run("bw", &["list", "items", "--url", &url], None)?,
                &host,
            )),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// One item's password, fetched at the moment of the fill.
#[tauri::command]
pub async fn vault_secret(id: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        match backend().ok_or("no password manager CLI found")? {
            "op" => {
                let out = run(
                    "op",
                    &["item", "get", &id, "--fields", "label=password", "--reveal"],
                    None,
                )?;
                Ok(out)
            }
            _ => run("bw", &["get", "password", &id], None),
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
            "op" => run("op", &["item", "get", &id, "--otp"], None),
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
                run(
                    "op",
                    &[
                        "item",
                        "create",
                        "--category=login",
                        &format!("--title={title}"),
                        &format!("--url={url}"),
                        &format!("username={username}"),
                        &format!("password={password}"),
                    ],
                    None,
                )?;
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
          {"id":"b","title":"Alpha","urls":[{"href":"https://example.com/login"}]},
          {"id":"c","title":"Other","urls":[{"href":"https://elsewhere.test"}]},
          {"id":"d","title":"Beta","overview":{"urls":[{"url":"https://example.com"}]}}
        ]"#;
        let m = op_matches(list, "example.com");
        let ids: Vec<&str> = m.iter().map(|(_, id, _)| id.as_str()).collect();
        // b and d are exact (ordered by title: Alpha, Beta), a is the subdomain
        // relation, c doesn't match at all.
        assert_eq!(ids, ["b", "d", "a"]);
    }

    #[test]
    fn op_detail_reads_the_username_and_spots_a_one_time_password() {
        let doc = r#"{"fields":[
          {"id":"username","value":"me@example.com"},
          {"id":"password","value":"s3cr3t"},
          {"id":"totp","label":"one-time password","type":"OTP","value":"otpauth://x"}
        ]}"#;
        assert_eq!(op_detail(doc), ("me@example.com".into(), true));
        let no_otp = r#"{"fields":[{"label":"username","value":"u"}]}"#;
        assert_eq!(op_detail(no_otp), ("u".into(), false));
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
