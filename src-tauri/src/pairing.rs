//! Paired-device credentials for Reado Anywhere.
//!
//! Anywhere used to hand every phone the same session token: revoking one meant
//! revoking all, nothing survived a restart, and a token was valid forever. This
//! module holds the trust model instead.
//!
//! Each phone gets **its own** secret, minted when it pairs and stored only as a
//! SHA-256 hash — the config file leaking is not the same as a device being
//! cloned. Pairing is bounded: the QR carries a single-use secret that expires,
//! so a photographed QR stops being useful once it is spent or stale. A
//! credential expires on its own too, after an idle stretch or an absolute age.
//!
//! Failed authentication is rate-limited per peer address, so a phone on the LAN
//! (or anything else that reached the port) can't grind through the keyspace.

use std::collections::HashMap;
use std::net::IpAddr;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Default idle lifetime: a phone unseen for this long must pair again.
pub const DEFAULT_IDLE_DAYS: i64 = 30;
/// Default absolute lifetime, regardless of use.
pub const DEFAULT_MAX_DAYS: i64 = 90;
/// How long a pairing secret stays usable. Short: the QR is on screen, and the
/// phone scans it within seconds.
pub const PAIRING_TTL: Duration = Duration::from_secs(300);

/// Failures from one address before it is locked out at all.
const FAIL_GRACE: u32 = 5;
/// Longest lockout, however many failures pile up.
const MAX_LOCKOUT: Duration = Duration::from_secs(300);

/// A paired device as stored on disk. The secret itself is never kept — only its
/// hash — so this file cannot be replayed against the server.
#[derive(Clone, Serialize, Deserialize)]
pub struct Device {
    pub id: String,
    pub name: String,
    /// SHA-256 of the device secret, lowercase hex.
    pub secret_hash: String,
    /// Unix seconds.
    pub created: i64,
    pub last_seen: i64,
}

/// A device as the desktop UI sees it — deliberately without the hash, so the
/// credential material has no path to the webview.
#[derive(Clone, Serialize)]
pub struct DeviceInfo {
    pub id: String,
    pub name: String,
    pub created: i64,
    pub last_seen: i64,
}

impl From<&Device> for DeviceInfo {
    fn from(d: &Device) -> Self {
        DeviceInfo {
            id: d.id.clone(),
            name: d.name.clone(),
            created: d.created,
            last_seen: d.last_seen,
        }
    }
}

/// Everything Anywhere persists between runs: who is paired, how long a
/// credential lives, which interface to bind, and whether to advertise.
#[derive(Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Config {
    pub devices: Vec<Device>,
    /// Idle lifetime in days; 0 disables the idle check.
    pub idle_days: i64,
    /// Absolute lifetime in days; 0 disables the age check.
    pub max_days: i64,
    /// Address to bind, or `None` for the machine's LAN address.
    pub bind: Option<String>,
    /// Advertise over mDNS so a paired phone can find the desk without the QR.
    pub mdns: bool,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            devices: Vec::new(),
            idle_days: DEFAULT_IDLE_DAYS,
            max_days: DEFAULT_MAX_DAYS,
            bind: None,
            mdns: false,
        }
    }
}

/// Why a presented credential was refused. The caller logs it; the phone only
/// ever learns "unauthorized" (distinguishing them would be an oracle).
#[derive(Debug, PartialEq, Eq)]
pub enum Denied {
    /// No device carries that secret.
    Unknown,
    /// Matched a device, but the credential is past its idle or absolute life.
    Expired,
    /// The peer is locked out after repeated failures.
    RateLimited,
}

/// Lowercase-hex SHA-256, the one-way form every secret is stored in.
pub fn hash_secret(secret: &str) -> String {
    Sha256::digest(secret.as_bytes())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// A fresh secret: 192 random bits as hex. Used for both device credentials and
/// the single-use pairing secret.
pub fn mint_secret() -> String {
    let mut bytes = [0u8; 24];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Compare two hex digests without an early return, so how *much* of a wrong
/// credential was right doesn't leak through timing. Belt and braces — these are
/// hashes — but it costs five lines.
fn constant_time_eq(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn now() -> i64 {
    chrono::Utc::now().timestamp()
}

/// Per-address failure tracking. Not persisted: a restart is a fresh start, and
/// an attacker who can restart the desktop has already won.
#[derive(Default)]
pub struct RateLimiter {
    /// address → (consecutive failures, locked out until).
    peers: HashMap<IpAddr, (u32, Option<Instant>)>,
}

impl RateLimiter {
    /// Whether this address may attempt authentication at all right now.
    pub fn allowed(&self, peer: IpAddr) -> bool {
        match self.peers.get(&peer) {
            Some((_, Some(until))) => Instant::now() >= *until,
            _ => true,
        }
    }

    /// Record a failure and extend the lockout. The first `FAIL_GRACE` attempts
    /// are free (a phone with a stale credential retries a few times), then the
    /// wait doubles per failure up to `MAX_LOCKOUT`.
    pub fn fail(&mut self, peer: IpAddr) {
        let entry = self.peers.entry(peer).or_insert((0, None));
        entry.0 = entry.0.saturating_add(1);
        if entry.0 > FAIL_GRACE {
            let steps = (entry.0 - FAIL_GRACE).min(16);
            let wait = Duration::from_secs(1u64 << (steps - 1)).min(MAX_LOCKOUT);
            entry.1 = Some(Instant::now() + wait);
        }
    }

    /// A success clears the address: an honest phone is never punished for a
    /// credential it has since fixed.
    pub fn succeed(&mut self, peer: IpAddr) {
        self.peers.remove(&peer);
    }
}

/// The paired-device store, backed by a JSON file in the app's config dir.
pub struct Store {
    path: PathBuf,
    config: Config,
}

impl Store {
    /// Load the store, treating a missing or unreadable file as empty — a
    /// corrupt config must not stop Anywhere from starting; it just means
    /// nobody is paired yet.
    pub fn load(path: &Path) -> Store {
        let config = std::fs::read_to_string(path)
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default();
        Store {
            path: path.to_path_buf(),
            config,
        }
    }

    pub fn config(&self) -> &Config {
        &self.config
    }

    /// Persist. Errors are returned so callers can log them; a failed write
    /// leaves the in-memory state authoritative for this run.
    pub fn save(&self) -> std::io::Result<()> {
        if let Some(dir) = self.path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let text = serde_json::to_string_pretty(&self.config)?;
        std::fs::write(&self.path, text)
    }

    /// The paired devices, without their credential hashes.
    pub fn devices(&self) -> Vec<DeviceInfo> {
        self.config.devices.iter().map(DeviceInfo::from).collect()
    }

    /// Whether a credential has outlived its idle or absolute limit. A limit of
    /// 0 turns that check off.
    fn expired(&self, device: &Device, at: i64) -> bool {
        let day = 86_400;
        let idle = self.config.idle_days;
        let max = self.config.max_days;
        (idle > 0 && at - device.last_seen > idle * day)
            || (max > 0 && at - device.created > max * day)
    }

    /// Check a presented secret. On success the device's `last_seen` moves up
    /// and its id is returned; the caller persists.
    pub fn verify(&mut self, secret: &str) -> Result<String, Denied> {
        let presented = hash_secret(secret);
        let at = now();
        // Scan every device even after a match would be found, so the position
        // of a device in the list isn't observable through response timing.
        let mut found: Option<usize> = None;
        for (i, device) in self.config.devices.iter().enumerate() {
            if constant_time_eq(&device.secret_hash, &presented) {
                found = Some(i);
            }
        }
        let Some(i) = found else {
            return Err(Denied::Unknown);
        };
        if self.expired(&self.config.devices[i], at) {
            return Err(Denied::Expired);
        }
        let device = &mut self.config.devices[i];
        device.last_seen = at;
        Ok(device.id.clone())
    }

    /// Register a freshly paired device and return the secret to hand it. The
    /// secret is returned once and never stored in the clear.
    pub fn pair(&mut self, name: &str) -> String {
        let secret = mint_secret();
        let at = now();
        let name = sanitize_name(name);
        self.config.devices.push(Device {
            id: mint_secret()[..16].to_string(),
            name,
            secret_hash: hash_secret(&secret),
            created: at,
            last_seen: at,
        });
        secret
    }

    /// Revoke one device. Returns whether it was there.
    pub fn revoke(&mut self, id: &str) -> bool {
        let before = self.config.devices.len();
        self.config.devices.retain(|d| d.id != id);
        self.config.devices.len() != before
    }

    /// Revoke every device at once — the "I lost the phone and I'm not sure
    /// which one it was" action. Returns how many were dropped.
    pub fn revoke_all(&mut self) -> usize {
        let count = self.config.devices.len();
        self.config.devices.clear();
        count
    }

    /// Drop every credential whose lifetime has run out. Called on start so the
    /// device list doesn't show phones that would be refused anyway.
    pub fn prune(&mut self) -> usize {
        let at = now();
        let expired: Vec<String> = self
            .config
            .devices
            .iter()
            .filter(|d| self.expired(d, at))
            .map(|d| d.id.clone())
            .collect();
        for id in &expired {
            self.config.devices.retain(|d| &d.id != id);
        }
        expired.len()
    }

    /// Update the credential lifetimes (0 disables a check).
    pub fn set_lifetimes(&mut self, idle_days: i64, max_days: i64) {
        self.config.idle_days = idle_days.max(0);
        self.config.max_days = max_days.max(0);
    }

    /// Set the interface to bind (`None` = the machine's LAN address).
    pub fn set_bind(&mut self, bind: Option<String>) {
        self.config.bind = bind.filter(|b| !b.trim().is_empty());
    }

    pub fn set_mdns(&mut self, on: bool) {
        self.config.mdns = on;
    }
}

/// Keep a device name short, single-line and free of control characters — it is
/// proposed by the phone, so it is untrusted text that the desktop renders.
fn sanitize_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .filter(|c| !c.is_control())
        .take(60)
        .collect::<String>()
        .trim()
        .to_string();
    if cleaned.is_empty() {
        "Phone".to_string()
    } else {
        cleaned
    }
}

/// The single-use secret a QR carries. Spent on the first successful pairing and
/// dead once its TTL passes, so a photographed QR has a short useful life.
pub struct PairingSecret {
    hash: String,
    expires: Instant,
}

impl PairingSecret {
    /// Mint one, returning it alongside the clear secret for the QR.
    pub fn mint() -> (PairingSecret, String) {
        let secret = mint_secret();
        (
            PairingSecret {
                hash: hash_secret(&secret),
                expires: Instant::now() + PAIRING_TTL,
            },
            secret,
        )
    }

    /// Whether this secret matches and is still live.
    pub fn accepts(&self, presented: &str) -> bool {
        Instant::now() < self.expires && constant_time_eq(&self.hash, &hash_secret(presented))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store() -> Store {
        Store {
            path: PathBuf::from("/nonexistent/anywhere.json"),
            config: Config::default(),
        }
    }

    #[test]
    fn secrets_are_unique_hex() {
        let (a, b) = (mint_secret(), mint_secret());
        assert_ne!(a, b);
        assert_eq!(a.len(), 48); // 24 bytes
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn the_secret_itself_is_never_stored() {
        let mut s = store();
        let secret = s.pair("Phone");
        let stored = &s.config.devices[0];
        assert_ne!(stored.secret_hash, secret);
        assert_eq!(stored.secret_hash, hash_secret(&secret));
        // And the hash is not reversible to the wire format the phone sends.
        assert!(s.verify(&stored.secret_hash.clone()).is_err());
    }

    #[test]
    fn a_paired_device_authenticates() {
        let mut s = store();
        let secret = s.pair("Phone");
        assert!(s.verify(&secret).is_ok());
    }

    #[test]
    fn an_unknown_secret_is_refused() {
        let mut s = store();
        s.pair("Phone");
        assert_eq!(s.verify(&mint_secret()), Err(Denied::Unknown));
    }

    #[test]
    fn revoking_one_device_leaves_the_others() {
        let mut s = store();
        let keep = s.pair("Keeper");
        let drop = s.pair("Goner");
        let goner = s.config.devices[1].id.clone();
        assert!(s.revoke(&goner));
        assert_eq!(s.verify(&drop), Err(Denied::Unknown));
        assert!(s.verify(&keep).is_ok(), "the other device stays paired");
    }

    #[test]
    fn revoke_all_drops_every_device() {
        let mut s = store();
        let a = s.pair("A");
        let b = s.pair("B");
        assert_eq!(s.revoke_all(), 2);
        assert_eq!(s.verify(&a), Err(Denied::Unknown));
        assert_eq!(s.verify(&b), Err(Denied::Unknown));
        assert!(s.devices().is_empty());
    }

    #[test]
    fn revoke_all_on_an_empty_store_is_a_no_op() {
        let mut s = store();
        assert_eq!(s.revoke_all(), 0);
    }

    #[test]
    fn revoking_an_unknown_id_reports_it() {
        let mut s = store();
        assert!(!s.revoke("nobody"));
    }

    #[test]
    fn an_idle_credential_expires() {
        let mut s = store();
        let secret = s.pair("Phone");
        s.config.devices[0].last_seen = now() - (DEFAULT_IDLE_DAYS + 1) * 86_400;
        assert_eq!(s.verify(&secret), Err(Denied::Expired));
    }

    #[test]
    fn an_old_credential_expires_even_when_used() {
        let mut s = store();
        let secret = s.pair("Phone");
        s.config.devices[0].created = now() - (DEFAULT_MAX_DAYS + 1) * 86_400;
        s.config.devices[0].last_seen = now(); // in daily use, still too old
        assert_eq!(s.verify(&secret), Err(Denied::Expired));
    }

    #[test]
    fn a_zero_lifetime_disables_that_check() {
        let mut s = store();
        let secret = s.pair("Phone");
        s.config.devices[0].last_seen = now() - 3650 * 86_400;
        s.set_lifetimes(0, 0);
        assert!(s.verify(&secret).is_ok());
    }

    #[test]
    fn use_moves_the_idle_deadline() {
        let mut s = store();
        let secret = s.pair("Phone");
        s.config.devices[0].last_seen = now() - (DEFAULT_IDLE_DAYS - 1) * 86_400;
        assert!(s.verify(&secret).is_ok());
        assert!(
            s.config.devices[0].last_seen >= now() - 1,
            "last_seen moved"
        );
    }

    #[test]
    fn prune_drops_only_the_expired() {
        let mut s = store();
        let live = s.pair("Live");
        s.pair("Stale");
        s.config.devices[1].last_seen = now() - (DEFAULT_IDLE_DAYS + 1) * 86_400;
        assert_eq!(s.prune(), 1);
        assert_eq!(s.config.devices.len(), 1);
        assert!(s.verify(&live).is_ok());
    }

    #[test]
    fn device_info_carries_no_credential_material() {
        let mut s = store();
        let secret = s.pair("Phone");
        let json = serde_json::to_string(&s.devices()).unwrap();
        assert!(!json.contains(&secret));
        assert!(!json.contains(&hash_secret(&secret)));
        assert!(!json.contains("secret"));
    }

    #[test]
    fn names_from_the_phone_are_sanitized() {
        assert_eq!(sanitize_name("  Matteo's iPhone \n"), "Matteo's iPhone");
        assert_eq!(sanitize_name(""), "Phone");
        assert_eq!(sanitize_name("\u{7}\u{1b}"), "Phone");
        assert_eq!(sanitize_name(&"x".repeat(200)).len(), 60);
    }

    #[test]
    fn a_pairing_secret_matches_only_itself() {
        let (pairing, secret) = PairingSecret::mint();
        assert!(pairing.accepts(&secret));
        assert!(!pairing.accepts(&mint_secret()));
    }

    #[test]
    fn an_expired_pairing_secret_is_refused() {
        let (mut pairing, secret) = PairingSecret::mint();
        pairing.expires = Instant::now() - Duration::from_secs(1);
        assert!(!pairing.accepts(&secret));
    }

    #[test]
    fn constant_time_eq_still_compares_correctly() {
        assert!(constant_time_eq("abc", "abc"));
        assert!(!constant_time_eq("abc", "abd"));
        assert!(!constant_time_eq("abc", "ab"));
        assert!(constant_time_eq("", ""));
    }

    #[test]
    fn the_rate_limiter_allows_a_few_failures_then_locks_out() {
        let mut limiter = RateLimiter::default();
        let peer: IpAddr = "192.168.1.5".parse().unwrap();
        for _ in 0..FAIL_GRACE {
            limiter.fail(peer);
            assert!(limiter.allowed(peer), "the grace attempts stay allowed");
        }
        limiter.fail(peer);
        assert!(!limiter.allowed(peer), "past the grace, it is locked out");
    }

    #[test]
    fn a_success_clears_the_lockout() {
        let mut limiter = RateLimiter::default();
        let peer: IpAddr = "192.168.1.5".parse().unwrap();
        for _ in 0..FAIL_GRACE + 1 {
            limiter.fail(peer);
        }
        assert!(!limiter.allowed(peer));
        limiter.succeed(peer);
        assert!(limiter.allowed(peer));
    }

    #[test]
    fn one_peers_failures_do_not_lock_out_another() {
        let mut limiter = RateLimiter::default();
        let bad: IpAddr = "192.168.1.5".parse().unwrap();
        let good: IpAddr = "192.168.1.6".parse().unwrap();
        for _ in 0..FAIL_GRACE + 3 {
            limiter.fail(bad);
        }
        assert!(!limiter.allowed(bad));
        assert!(limiter.allowed(good));
    }

    #[test]
    fn the_lockout_is_capped() {
        let mut limiter = RateLimiter::default();
        let peer: IpAddr = "192.168.1.5".parse().unwrap();
        for _ in 0..200 {
            limiter.fail(peer);
        }
        let until = limiter.peers[&peer].1.unwrap();
        assert!(until <= Instant::now() + MAX_LOCKOUT);
    }

    #[test]
    fn a_missing_config_file_loads_as_empty() {
        let s = Store::load(Path::new("/nonexistent/anywhere.json"));
        assert!(s.devices().is_empty());
        assert_eq!(s.config().idle_days, DEFAULT_IDLE_DAYS);
    }

    #[test]
    fn a_corrupt_config_file_loads_as_empty_rather_than_failing() {
        let dir = std::env::temp_dir().join("reado-pairing-test");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("corrupt.json");
        std::fs::write(&path, "{ not json").unwrap();
        let s = Store::load(&path);
        assert!(s.devices().is_empty());
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn devices_survive_a_save_and_reload() {
        let dir = std::env::temp_dir().join("reado-pairing-test");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("roundtrip.json");
        std::fs::remove_file(&path).ok();

        let mut s = Store::load(&path);
        let secret = s.pair("Matteo's iPhone");
        s.set_lifetimes(7, 14);
        s.set_bind(Some("192.168.1.10".into()));
        s.set_mdns(true);
        s.save().unwrap();

        let mut reloaded = Store::load(&path);
        assert_eq!(reloaded.devices().len(), 1);
        assert_eq!(reloaded.devices()[0].name, "Matteo's iPhone");
        assert!(
            reloaded.verify(&secret).is_ok(),
            "still paired after restart"
        );
        assert_eq!(reloaded.config().idle_days, 7);
        assert_eq!(reloaded.config().bind.as_deref(), Some("192.168.1.10"));
        assert!(reloaded.config().mdns);
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn an_empty_bind_is_treated_as_unset() {
        let mut s = store();
        s.set_bind(Some("   ".into()));
        assert!(s.config().bind.is_none());
    }
}
