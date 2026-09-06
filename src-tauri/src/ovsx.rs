//! The extension marketplace: Open VSX as a source of *declarative* extensions.
//!
//! Reado runs no extension code, so it never needs an extension host — it needs
//! the data inside the package. A `.vsix` is a zip whose `extension/package.json`
//! declares what it contributes; themes, icon themes, snippets, language
//! configuration and TextMate grammars are all files listed there. Reado reads
//! those and ignores everything else, including any code entry point.
//!
//! Everything that touches the network or the archive happens here, in the
//! backend: the webview's content security policy stays closed, and a hostile
//! package meets the size caps and the path confinement below before a single
//! byte lands on disk. Nothing extracted is ever executed, marked executable, or
//! put on a PATH.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

use crate::error::{Error, Result};

/// The registry. Open VSX rather than Microsoft's marketplace: the latter's terms
/// restrict in-product acquisition to Visual Studio family products, and it has
/// been enforced against other editors.
const REGISTRY: &str = "https://open-vsx.org";

/// Largest `.vsix` Reado will pull down.
const MAX_DOWNLOAD: usize = 96 * 1024 * 1024;
/// Largest total size after inflation — the decompression-bomb ceiling.
const MAX_UNPACKED: u64 = 384 * 1024 * 1024;
/// Most entries one package may contain.
const MAX_ENTRIES: usize = 30_000;
/// Largest single contribution or manifest file Reado will read into memory.
const MAX_FILE: u64 = 16 * 1024 * 1024;
/// How many manifests to fetch at once while classifying a page of results.
const MANIFEST_CONCURRENCY: usize = 8;

fn client() -> &'static reqwest::Client {
    static C: OnceLock<reqwest::Client> = OnceLock::new();
    C.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent(concat!("Reado/", env!("CARGO_PKG_VERSION")))
            .connect_timeout(std::time::Duration::from_secs(10))
            .timeout(std::time::Duration::from_secs(120))
            .build()
            .expect("http client")
    })
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct SearchResponse {
    extensions: Vec<SearchEntry>,
    #[serde(rename = "totalSize", default)]
    total_size: u64,
}

#[derive(Deserialize)]
struct SearchEntry {
    namespace: String,
    name: String,
    version: String,
    #[serde(rename = "displayName")]
    display_name: Option<String>,
    description: Option<String>,
    #[serde(rename = "downloadCount", default)]
    download_count: u64,
    #[serde(default)]
    verified: bool,
    #[serde(default)]
    files: RegistryFiles,
}

#[derive(Deserialize, Default)]
struct RegistryFiles {
    icon: Option<String>,
    download: Option<String>,
    sha256: Option<String>,
    readme: Option<String>,
}

/// One catalogue entry, with the published manifest that says what it
/// contributes. Classification into "can Reado use this?" is the frontend's
/// call; this is the evidence it needs to make it.
///
/// `camelCase` on the wire: the webview reads `displayName`, and a snake_case
/// field silently arrives as `undefined` there rather than failing loudly.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Listing {
    id: String,
    namespace: String,
    name: String,
    version: String,
    display_name: String,
    description: String,
    download_count: u64,
    verified: bool,
    /// Registry-hosted icon. Left as a URL: the webview's existing policy already
    /// allows https images, so inlining every result's icon through the IPC
    /// channel would cost bandwidth and buy nothing.
    icon: Option<String>,
    /// The extension's published `package.json`, or null when it couldn't be
    /// read — an entry with no manifest can't be classified, so it isn't shown.
    manifest: Option<serde_json::Value>,
}

/// A page of catalogue results, each carrying its manifest.
#[derive(Serialize)]
pub struct SearchPage {
    items: Vec<Listing>,
    total: u64,
}

/// The published `package.json` for a specific version. The registry reports
/// this exact URL shape as `files.manifest`.
fn manifest_url(namespace: &str, name: &str, version: &str) -> String {
    format!("{REGISTRY}/api/{namespace}/{name}/{version}/file/package.json")
}

/// Search the registry, returning each hit with its manifest.
///
/// `category` narrows the query to one of the registry's own categories (Themes,
/// Snippets, …), which is how a search for declarative extensions mostly avoids
/// pulling back extensions Reado can't use in the first place. `sort` of
/// `"downloads"` orders by installs, which is what makes browsing with no query
/// at all useful — you can't search for a theme whose name you don't know.
#[tauri::command]
pub async fn ovsx_search(
    query: String,
    category: Option<String>,
    offset: u32,
    size: u32,
    sort: Option<String>,
) -> Result<SearchPage> {
    let mut url = reqwest::Url::parse(&format!("{REGISTRY}/api/-/search")).map_err(Error::other)?;
    {
        let mut q = url.query_pairs_mut();
        q.append_pair("query", &query);
        q.append_pair("offset", &offset.to_string());
        q.append_pair("size", &size.clamp(1, 50).to_string());
        q.append_pair("includeAllVersions", "false");
        if let Some(c) = category.as_deref().filter(|c| !c.is_empty()) {
            q.append_pair("category", c);
        }
        if sort.as_deref() == Some("downloads") {
            q.append_pair("sortBy", "downloadCount");
            q.append_pair("sortOrder", "desc");
        }
    }
    let page: SearchResponse = client()
        .get(url)
        .send()
        .await
        .map_err(Error::other)?
        .error_for_status()
        .map_err(Error::other)?
        .json()
        .await
        .map_err(Error::other)?;

    // `buffered`, not `buffer_unordered`: the registry's relevance ordering is
    // the ranking, and it must survive the concurrent manifest fetches.
    use futures_util::StreamExt as _;
    let total = page.total_size;
    let items = futures_util::stream::iter(page.extensions.into_iter().map(|e| async move {
        // A manifest that can't be fetched leaves the entry unclassifiable, and
        // an unclassifiable entry is not offered.
        let manifest = fetch_manifest(&e.namespace, &e.name, &e.version).await.ok();
        Listing {
            id: format!("{}.{}", e.namespace, e.name),
            display_name: e.display_name.unwrap_or_else(|| e.name.clone()),
            description: e.description.unwrap_or_default(),
            namespace: e.namespace,
            name: e.name,
            version: e.version,
            download_count: e.download_count,
            verified: e.verified,
            icon: e.files.icon,
            manifest,
        }
    }))
    .buffered(MANIFEST_CONCURRENCY)
    .collect::<Vec<_>>()
    .await;

    Ok(SearchPage { items, total })
}

/// Manifests already fetched this session.
///
/// A published manifest for one version is immutable, so this is free
/// correctness-wise and removes most of the cost of the panel's fan-out: every
/// filter change re-searches, "Load more" overlaps pages, and an extension
/// listed under two categories comes back twice.
fn manifest_cache() -> &'static Mutex<HashMap<String, serde_json::Value>> {
    static CACHE: OnceLock<Mutex<HashMap<String, serde_json::Value>>> = OnceLock::new();
    CACHE.get_or_init(Default::default)
}

async fn fetch_manifest(namespace: &str, name: &str, version: &str) -> Result<serde_json::Value> {
    let key = format!("{namespace}.{name}@{version}");
    if let Some(hit) = manifest_cache()
        .lock()
        .ok()
        .and_then(|c| c.get(&key).cloned())
    {
        return Ok(hit);
    }
    let body = client()
        .get(manifest_url(namespace, name, version))
        .send()
        .await
        .map_err(Error::other)?
        .error_for_status()
        .map_err(Error::other)?
        .text()
        .await
        .map_err(Error::other)?;
    let parsed: serde_json::Value = serde_json::from_str(&body).map_err(Error::other)?;
    if let Ok(mut cache) = manifest_cache().lock() {
        cache.insert(key, parsed.clone());
    }
    Ok(parsed)
}

// ---------------------------------------------------------------------------
// Acquisition
// ---------------------------------------------------------------------------

/// An installed extension: where it lives, and what it declares.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Installed {
    id: String,
    namespace: String,
    name: String,
    version: String,
    display_name: String,
    manifest: serde_json::Value,
}

/// Registry ids are `[A-Za-z0-9._-]`; anything else is refused rather than
/// sanitised, so no crafted namespace can steer a path.
fn safe_segment(s: &str) -> Result<&str> {
    let ok = !s.is_empty()
        && s.len() <= 128
        && s != "."
        && s != ".."
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-'));
    ok.then_some(s)
        .ok_or_else(|| Error::other(format!("Refusing an extension with an unusable id: {s}")))
}

/// The directory holding every installed extension.
fn extensions_root(app: &AppHandle) -> Result<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(Error::other)?
        .join("extensions");
    std::fs::create_dir_all(&dir).map_err(Error::other)?;
    Ok(dir)
}

/// One extension's own directory. A single directory per extension: an update
/// replaces it, so two versions can never both be live.
fn extension_dir(app: &AppHandle, namespace: &str, name: &str) -> Result<PathBuf> {
    Ok(extensions_root(app)?.join(format!(
        "{}.{}",
        safe_segment(namespace)?,
        safe_segment(name)?
    )))
}

/// Resolve `rel` inside `dir`, refusing anything that escapes it.
///
/// Extension manifests name their own files, and a manifest is untrusted input.
/// The check itself is `fs::ensure_within` — the project's one path-confinement
/// primitive, so a future hardening fix lands in a single place rather than in
/// whichever copy the author remembered.
fn confined(dir: &Path, rel: &str) -> Result<PathBuf> {
    crate::fs::ensure_within(dir, &dir.join(rel.trim_start_matches(['.', '/', '\\'])))
        .map_err(|_| Error::other(format!("Refusing to read outside the extension: {rel}")))
}

/// Download `url`, refusing anything over [`MAX_DOWNLOAD`]. The cap is enforced
/// as the body streams, not from the advertised length, which a server controls.
async fn download_capped(url: &str) -> Result<Vec<u8>> {
    let mut resp = client()
        .get(url)
        .send()
        .await
        .map_err(Error::other)?
        .error_for_status()
        .map_err(Error::other)?;
    let mut body = Vec::new();
    while let Some(chunk) = resp.chunk().await.map_err(Error::other)? {
        if body.len() + chunk.len() > MAX_DOWNLOAD {
            return Err(Error::Other(
                "This extension package is larger than Reado will install.".into(),
            ));
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

#[derive(Deserialize)]
struct VersionDetail {
    #[serde(default)]
    version: String,
    #[serde(default)]
    files: RegistryFiles,
}

/// The latest published version of each named extension.
///
/// Installed extensions are read from disk, so nothing on this machine knows an
/// update exists until someone asks the registry. Asked for all of them at once
/// rather than one row at a time: the panel wants the whole answer before it
/// draws, and a per-row fetch would be a request storm on a long list.
///
/// An extension the registry can't answer for is simply absent from the map —
/// unreachable and up-to-date must not look the same, and absent reads as "no
/// update offered" rather than as a version.
#[tauri::command]
pub async fn ovsx_latest(ids: Vec<String>) -> Result<HashMap<String, String>> {
    use futures_util::StreamExt as _;
    let pairs =
        futures_util::stream::iter(ids.into_iter().take(MAX_UPDATE_CHECK).map(|id| async move {
            let (ns, nm) = id.split_once('.')?;
            let (ns, nm) = (safe_segment(ns).ok()?, safe_segment(nm).ok()?);
            let detail: VersionDetail = client()
                .get(format!("{REGISTRY}/api/{ns}/{nm}"))
                .send()
                .await
                .ok()?
                .error_for_status()
                .ok()?
                .json()
                .await
                .ok()?;
            (!detail.version.is_empty()).then(|| (id.clone(), detail.version))
        }))
        .buffer_unordered(MANIFEST_CONCURRENCY)
        .filter_map(|r| async move { r })
        .collect::<Vec<_>>()
        .await;
    Ok(pairs.into_iter().collect())
}

/// A ceiling on one update check, so a corrupted install directory can't turn
/// opening the panel into hundreds of requests.
const MAX_UPDATE_CHECK: usize = 200;

/// Install an extension from the registry.
///
/// The caller names the extension; the download URL comes from the registry's
/// own answer, never from the webview — otherwise `ovsx_install` would be a
/// fetch-anything primitive.
#[tauri::command]
pub async fn ovsx_install(
    app: AppHandle,
    namespace: String,
    name: String,
    version: String,
) -> Result<Installed> {
    let (ns, nm, ver) = (
        safe_segment(&namespace)?.to_string(),
        safe_segment(&name)?.to_string(),
        safe_segment(&version)?.to_string(),
    );

    let detail: VersionDetail = client()
        .get(format!("{REGISTRY}/api/{ns}/{nm}/{ver}"))
        .send()
        .await
        .map_err(Error::other)?
        .error_for_status()
        .map_err(Error::other)?
        .json()
        .await
        .map_err(Error::other)?;
    let download = detail
        .files
        .download
        .ok_or_else(|| Error::Other("The registry has no package for this version.".into()))?;

    let bytes = download_capped(&download).await?;

    // Verify against the digest the registry publishes, when it publishes one.
    if let Some(sha_url) = detail.files.sha256 {
        if let Ok(expected) = client()
            .get(sha_url)
            .send()
            .await
            .map_err(Error::other)?
            .text()
            .await
        {
            let expected = expected.split_whitespace().next().unwrap_or("").to_string();
            let actual = format!("{:x}", Sha256::digest(&bytes));
            if !expected.is_empty() && !expected.eq_ignore_ascii_case(&actual) {
                return Err(Error::Other(
                    "The downloaded package didn't match the registry's checksum.".into(),
                ));
            }
        }
    }

    let dir = extension_dir(&app, &ns, &nm)?;
    let staging = dir.with_extension("installing");
    let manifest = tokio::task::spawn_blocking({
        let (staging, dir) = (staging.clone(), dir.clone());
        move || -> Result<serde_json::Value> {
            let _ = std::fs::remove_dir_all(&staging);
            std::fs::create_dir_all(&staging).map_err(Error::other)?;
            // Anything that fails leaves no half-installed extension behind.
            let result = unpack(&bytes, &staging).and_then(|()| read_manifest(&staging));
            if result.is_err() {
                let _ = std::fs::remove_dir_all(&staging);
                return result;
            }
            let _ = std::fs::remove_dir_all(&dir);
            std::fs::rename(&staging, &dir).map_err(Error::other)?;
            result
        }
    })
    .await
    .map_err(Error::other)??;

    crate::log::info(
        "ovsx",
        "installed",
        serde_json::json!({ "id": format!("{ns}.{nm}"), "version": ver }),
    );
    Ok(to_installed(&ns, &nm, manifest))
}

/// Unpack a `.vsix` into `dest`.
///
/// A `.vsix` keeps the extension itself under `extension/`, alongside packaging
/// metadata Reado has no use for; only that subtree is written, with its prefix
/// stripped. `enclosed_name` is what refuses absolute and `..` paths, and the
/// entry/size caps are what refuse a decompression bomb. Symlinks are dropped:
/// a link is a way out of the directory the rest of this guards.
fn unpack(bytes: &[u8], dest: &Path) -> Result<()> {
    let mut zip = zip::ZipArchive::new(std::io::Cursor::new(bytes)).map_err(Error::other)?;
    if zip.len() > MAX_ENTRIES {
        return Err(Error::Other(
            "This extension package contains too many files.".into(),
        ));
    }
    let mut written: u64 = 0;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(Error::other)?;
        let Some(path) = entry.enclosed_name() else {
            return Err(Error::Other(
                "This extension package contains an unsafe file path.".into(),
            ));
        };
        // A symlink can point anywhere; nothing declarative needs one.
        if entry
            .unix_mode()
            .is_some_and(|m| m & 0o170_000 == 0o120_000)
        {
            continue;
        }
        let Ok(rel) = path.strip_prefix("extension") else {
            continue; // packaging metadata, not the extension
        };
        let out = dest.join(rel);
        if entry.is_dir() {
            std::fs::create_dir_all(&out).map_err(Error::other)?;
            continue;
        }
        written += entry.size();
        if written > MAX_UNPACKED {
            return Err(Error::Other(
                "This extension package unpacks to more than Reado will store.".into(),
            ));
        }
        if let Some(parent) = out.parent() {
            std::fs::create_dir_all(parent).map_err(Error::other)?;
        }
        // Written with default (non-executable) permissions: the archive's own
        // mode bits are deliberately ignored.
        let mut file = std::fs::File::create(&out).map_err(Error::other)?;
        std::io::copy(&mut entry, &mut file).map_err(Error::other)?;
    }
    Ok(())
}

fn read_manifest(dir: &Path) -> Result<serde_json::Value> {
    let raw = std::fs::read_to_string(dir.join("package.json"))
        .map_err(|_| Error::Other("This package has no extension manifest.".into()))?;
    serde_json::from_str(&raw)
        .map_err(|e| Error::other(format!("This extension's manifest is unreadable: {e}")))
}

fn to_installed(namespace: &str, name: &str, manifest: serde_json::Value) -> Installed {
    let get = |k: &str| manifest.get(k).and_then(|v| v.as_str()).map(str::to_string);
    Installed {
        id: format!("{namespace}.{name}"),
        namespace: namespace.to_string(),
        name: name.to_string(),
        version: get("version").unwrap_or_default(),
        display_name: get("displayName").unwrap_or_else(|| name.to_string()),
        manifest,
    }
}

#[derive(Deserialize)]
struct ReadmeDetail {
    #[serde(default)]
    files: RegistryFiles,
}

/// The extension's README, as Markdown.
///
/// From disk when the extension is installed — that works offline and is what
/// the user actually has — and from the registry otherwise, so a listing can be
/// read before deciding to install it. The file names vary (`README.md`,
/// `readme.md`), so the installed copy is looked up case-insensitively rather
/// than guessed at.
#[tauri::command]
pub async fn ovsx_readme(
    app: AppHandle,
    namespace: String,
    name: String,
    version: Option<String>,
) -> Result<String> {
    let (ns, nm) = (safe_segment(&namespace)?, safe_segment(&name)?);
    if let Ok(dir) = extension_dir(&app, ns, nm) {
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let file = entry.file_name();
                let lower = file.to_string_lossy().to_lowercase();
                if lower == "readme.md" || lower == "readme" {
                    if let Ok(text) = std::fs::read_to_string(entry.path()) {
                        return Ok(text);
                    }
                }
            }
        }
    }

    let ver = version.as_deref().map(safe_segment).transpose()?;
    let url = match ver {
        Some(v) => format!("{REGISTRY}/api/{ns}/{nm}/{v}"),
        None => format!("{REGISTRY}/api/{ns}/{nm}"),
    };
    let detail: ReadmeDetail = client()
        .get(url)
        .send()
        .await
        .map_err(Error::other)?
        .error_for_status()
        .map_err(Error::other)?
        .json()
        .await
        .map_err(Error::other)?;
    let readme = detail
        .files
        .readme
        .ok_or_else(|| Error::Other("This extension has no README.".into()))?;
    let body = client()
        .get(readme)
        .send()
        .await
        .map_err(Error::other)?
        .error_for_status()
        .map_err(Error::other)?
        .text()
        .await
        .map_err(Error::other)?;
    // A README is displayed, not parsed; the same ceiling as any other file.
    Ok(body.chars().take(MAX_FILE as usize).collect())
}

/// Every installed extension, read from disk. There is no separate index to
/// fall out of step with what is actually there.
#[tauri::command]
pub fn ovsx_installed(app: AppHandle) -> Result<Vec<Installed>> {
    let root = extensions_root(&app)?;
    let mut out = Vec::new();
    for entry in std::fs::read_dir(&root).map_err(Error::other)?.flatten() {
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        let folder = entry.file_name().to_string_lossy().into_owned();
        let Some((ns, nm)) = folder.split_once('.') else {
            continue;
        };
        // A directory left behind by an interrupted install is not an extension.
        if folder.ends_with(".installing") {
            let _ = std::fs::remove_dir_all(&dir);
            continue;
        }
        match read_manifest(&dir) {
            Ok(manifest) => out.push(to_installed(ns, nm, manifest)),
            Err(e) => crate::log::warn(
                "ovsx",
                "skipping unreadable extension",
                serde_json::json!({ "id": folder, "error": e }),
            ),
        }
    }
    out.sort_by_key(|e| e.display_name.to_lowercase());
    Ok(out)
}

/// Remove an extension. Exact, unlike a language server installed by someone
/// else's package manager: this is a directory Reado owns.
#[tauri::command]
pub fn ovsx_uninstall(app: AppHandle, namespace: String, name: String) -> Result<()> {
    let dir = extension_dir(&app, &namespace, &name)?;
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(Error::other)?;
    }
    crate::log::info(
        "ovsx",
        "uninstalled",
        serde_json::json!({ "id": format!("{namespace}.{name}") }),
    );
    Ok(())
}

/// Read a text file an extension contributes (a theme, a grammar, a snippet
/// set), confined to that extension's directory.
#[tauri::command]
pub fn ext_read(app: AppHandle, namespace: String, name: String, path: String) -> Result<String> {
    let dir = extension_dir(&app, &namespace, &name)?;
    let file = confined(&dir, &path)?;
    if file.metadata().map_err(Error::other)?.len() > MAX_FILE {
        return Err(Error::other(format!("{path} is too large to read.")));
    }
    std::fs::read_to_string(&file).map_err(Error::other)
}

/// Read a binary asset an extension contributes (an icon, a font) as a `data:`
/// URL — the same confinement, and a form the webview's policy already allows.
#[tauri::command]
pub fn ext_asset(app: AppHandle, namespace: String, name: String, path: String) -> Result<String> {
    let dir = extension_dir(&app, &namespace, &name)?;
    let file = confined(&dir, &path)?;
    if file.metadata().map_err(Error::other)?.len() > MAX_FILE {
        return Err(Error::other(format!("{path} is too large to read.")));
    }
    let bytes = std::fs::read(&file).map_err(Error::other)?;
    let mime = match file
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        _ => "application/octet-stream",
    };
    // `fs::base64_encode` already exists and its own comment says it is there to
    // avoid a crate for one use; adding the crate anyway would leave two.
    Ok(format!(
        "data:{mime};base64,{}",
        crate::fs::base64_encode(&bytes)
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write as _;
    use zip::write::SimpleFileOptions;

    /// Build a `.vsix`-shaped zip from (path, contents) pairs.
    fn vsix(entries: &[(&str, &str)]) -> Vec<u8> {
        let mut buf = Vec::new();
        {
            let mut w = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));
            for (path, body) in entries {
                w.start_file(*path, SimpleFileOptions::default()).unwrap();
                w.write_all(body.as_bytes()).unwrap();
            }
            w.finish().unwrap();
        }
        buf
    }

    #[test]
    fn unpacks_only_the_extension_subtree() {
        let dir = tempfile::tempdir().unwrap();
        let zip = vsix(&[
            ("extension.vsixmanifest", "<xml/>"),
            ("[Content_Types].xml", "<xml/>"),
            ("extension/package.json", r#"{"name":"x"}"#),
            ("extension/themes/a.json", "{}"),
        ]);
        unpack(&zip, dir.path()).unwrap();
        assert!(dir.path().join("package.json").is_file());
        assert!(dir.path().join("themes/a.json").is_file());
        // Packaging metadata is not part of the extension and isn't written.
        assert!(!dir.path().join("extension.vsixmanifest").exists());
    }

    #[test]
    fn refuses_a_path_that_escapes_the_extension_directory() {
        // The whole point of the confinement: an archive that tries to write
        // over something outside its own directory must abort the install.
        let dir = tempfile::tempdir().unwrap();
        let zip = vsix(&[("extension/../../evil.json", "{}")]);
        let err = unpack(&zip, dir.path()).unwrap_err().to_string();
        assert!(err.contains("unsafe file path"), "got: {err}");
        assert!(!dir.path().parent().unwrap().join("evil.json").exists());
    }

    #[test]
    fn refuses_a_package_with_too_many_entries() {
        let dir = tempfile::tempdir().unwrap();
        let names: Vec<String> = (0..MAX_ENTRIES + 1)
            .map(|i| format!("extension/f{i}.txt"))
            .collect();
        let pairs: Vec<(&str, &str)> = names.iter().map(|n| (n.as_str(), "x")).collect();
        let err = unpack(&vsix(&pairs), dir.path()).unwrap_err().to_string();
        assert!(err.contains("too many files"), "got: {err}");
    }

    #[test]
    fn a_missing_manifest_is_a_clear_failure() {
        let dir = tempfile::tempdir().unwrap();
        let err = read_manifest(dir.path()).unwrap_err().to_string();
        assert!(err.contains("no extension manifest"), "got: {err}");
    }

    #[test]
    fn confinement_refuses_traversal_but_allows_the_extension_s_own_files() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("themes")).unwrap();
        std::fs::write(dir.path().join("themes/a.json"), "{}").unwrap();
        assert!(confined(dir.path(), "themes/a.json").is_ok());
        assert!(confined(dir.path(), "./themes/a.json").is_ok());
        // A manifest is untrusted input; these are the shapes it can try.
        assert!(confined(dir.path(), "../../../etc/hosts").is_err());
        assert!(confined(dir.path(), "/etc/hosts").is_err());
    }

    #[test]
    fn ids_that_could_steer_a_path_are_refused() {
        assert!(safe_segment("PKief").is_ok());
        assert!(safe_segment("material-icon-theme").is_ok());
        assert!(safe_segment("1.0.6").is_ok());
        assert!(safe_segment("..").is_err());
        assert!(safe_segment("a/b").is_err());
        assert!(safe_segment("a\\b").is_err());
        assert!(safe_segment("").is_err());
    }

    /// Recorded from the live registry. Field names are the one part of this
    /// module a compiler can't check: rename one and search silently returns
    /// entries with empty names and no download URL.
    #[test]
    fn deserialises_a_real_search_response() {
        let raw = include_str!("../tests/fixtures/ovsx-search.json");
        let page: SearchResponse = serde_json::from_str(raw).expect("search response");
        assert!(page.total_size > 0);
        let entry = page.extensions.first().expect("at least one extension");
        assert!(!entry.namespace.is_empty());
        assert!(!entry.name.is_empty());
        assert!(!entry.version.is_empty());
        assert!(entry.display_name.is_some());
        assert!(entry.download_count > 0);
        assert!(entry.files.download.is_some());
        assert!(entry.files.sha256.is_some());
        // The URL install derives for the manifest must match what the registry
        // reports for the same version.
        assert!(entry
            .files
            .download
            .as_deref()
            .unwrap()
            .starts_with(&format!(
                "{REGISTRY}/api/{}/{}/{}/file/",
                entry.namespace, entry.name, entry.version
            )));
    }

    #[test]
    fn the_wire_field_names_are_the_ones_the_interface_reads() {
        // The bug this pins: `display_name` serialised as-is arrives in the
        // webview as `undefined`, and the marketplace renders a blank name (or
        // crashes on it). Nothing in either language's type system catches a
        // mismatch across the IPC boundary, so it is asserted here.
        let listing = Listing {
            id: "Pub.thing".into(),
            namespace: "Pub".into(),
            name: "thing".into(),
            version: "1.0.0".into(),
            display_name: "Thing".into(),
            description: String::new(),
            download_count: 7,
            verified: true,
            icon: None,
            manifest: None,
        };
        let json = serde_json::to_value(&listing).unwrap();
        for key in [
            "id",
            "namespace",
            "name",
            "version",
            "displayName",
            "description",
            "downloadCount",
            "verified",
            "icon",
            "manifest",
        ] {
            assert!(json.get(key).is_some(), "listing is missing `{key}`");
        }
        assert!(json.get("display_name").is_none(), "must not be snake_case");

        let installed = to_installed("Pub", "thing", serde_json::json!({"version": "1.0.0"}));
        let json = serde_json::to_value(&installed).unwrap();
        for key in [
            "id",
            "namespace",
            "name",
            "version",
            "displayName",
            "manifest",
        ] {
            assert!(json.get(key).is_some(), "installed is missing `{key}`");
        }

        // Single-word fields are unaffected by the rename, but the page and the
        // formatter status cross the same boundary — assert them too.
        let page = serde_json::to_value(SearchPage {
            items: vec![],
            total: 0,
        })
        .unwrap();
        assert!(page.get("items").is_some() && page.get("total").is_some());
    }

    #[test]
    fn deserialises_a_real_version_response() {
        let raw = include_str!("../tests/fixtures/ovsx-version.json");
        let detail: VersionDetail = serde_json::from_str(raw).expect("version response");
        assert!(
            detail.files.download.is_some(),
            "install needs a package URL"
        );
        assert!(
            detail.files.sha256.is_some(),
            "install verifies the checksum"
        );
    }

    #[test]
    fn the_manifest_url_matches_what_the_registry_publishes() {
        // Derived rather than fetched from the detail endpoint, so it has to
        // match the shape the registry reports as `files.manifest`.
        assert_eq!(
            manifest_url("Telokis", "theme-dracula-at-dusk", "1.0.6"),
            "https://open-vsx.org/api/Telokis/theme-dracula-at-dusk/1.0.6/file/package.json"
        );
    }
}
