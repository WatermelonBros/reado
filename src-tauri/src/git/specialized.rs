use crate::proc::command;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::sync::mpsc::{self, Receiver};
use std::time::{Duration, Instant};

const MAX_INPUT: u64 = 64 * 1024 * 1024;
const MAX_OUTPUT: usize = 2 * 1024 * 1024;
const TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum DiffToolKind {
    Textconv,
    External,
}

#[derive(Debug, Serialize)]
pub struct DiffTool {
    pub id: String,
    pub kind: DiffToolKind,
    pub source: String,
    pub command: String,
}

#[derive(Debug, Serialize)]
pub struct SpecializedDiff {
    pub text: String,
    pub truncated: bool,
}

fn checked_file(root: &str, file: &str) -> Result<PathBuf, String> {
    if file.is_empty()
        || Path::new(file)
            .components()
            .any(|c| !matches!(c, Component::Normal(_)))
    {
        return Err("invalid diff path".into());
    }
    let root = Path::new(root).canonicalize().map_err(|e| e.to_string())?;
    let path = root.join(file);
    let anchor = path
        .ancestors()
        .find(|p| p.exists())
        .ok_or("invalid diff path")?;
    let resolved = anchor.canonicalize().map_err(|e| e.to_string())?;
    if !resolved.starts_with(&root) {
        return Err("invalid diff path".into());
    }
    if path.exists() && !resolved.is_file() {
        return Err("not a file".into());
    }
    Ok(if path.exists() { resolved } else { path })
}

fn git_output(root: &Path, args: &[&str]) -> Result<Output, String> {
    command("git")
        .arg("--literal-pathspecs")
        .arg("-C")
        .arg(root)
        .args(args)
        .output()
        .map_err(|e| e.to_string())
}

fn config(root: &Path, key: &str) -> Result<Option<String>, String> {
    let out = git_output(root, &["config", "--null", "--get", key])?;
    if out.status.code() == Some(1) {
        return Ok(None);
    }
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).into_owned());
    }
    let value = String::from_utf8(out.stdout).map_err(|e| e.to_string())?;
    Ok(Some(value.trim_end_matches('\0').to_string()).filter(|v| !v.trim().is_empty()))
}

#[tauri::command(async)]
pub fn git_diff_tools(root: String, file: String) -> Result<Vec<DiffTool>, String> {
    checked_file(&root, &file)?;
    let root = Path::new(&root).canonicalize().map_err(|e| e.to_string())?;
    if !git_output(&root, &["rev-parse", "--is-inside-work-tree"])?
        .status
        .success()
    {
        return Ok(Vec::new());
    }
    let attr = git_output(&root, &["check-attr", "-z", "diff", "--", &file])?;
    if !attr.status.success() {
        return Err(String::from_utf8_lossy(&attr.stderr).into_owned());
    }
    let attr = String::from_utf8(attr.stdout).map_err(|e| e.to_string())?;
    let driver = attr
        .split('\0')
        .nth(2)
        .filter(|v| !v.is_empty() && !matches!(*v, "set" | "unset" | "unspecified"));
    let mut tools = Vec::new();
    let mut add = |source: String, kind, program: String| -> Result<(), String> {
        let identity = serde_json::to_vec(&(&root, &file, &source, &program, kind))
            .map_err(|e| e.to_string())?;
        tools.push(DiffTool {
            id: format!("{:x}", Sha256::digest(identity)),
            kind,
            source,
            command: program,
        });
        Ok(())
    };
    let mut external = None;
    if let Some(driver) = driver {
        let key = format!("diff.{driver}.textconv");
        if let Some(program) = config(&root, &key)? {
            add(key, DiffToolKind::Textconv, program)?;
        }
        let key = format!("diff.{driver}.command");
        if let Some(program) = config(&root, &key)? {
            external = Some((key, program));
        }
    }
    if external.is_none() {
        external = std::env::var("GIT_EXTERNAL_DIFF")
            .ok()
            .filter(|v| !v.trim().is_empty())
            .map(|v| ("GIT_EXTERNAL_DIFF".to_string(), v));
    }
    if external.is_none() {
        external = config(&root, "diff.external")?.map(|v| ("diff.external".to_string(), v));
    }
    if let Some((key, program)) = external {
        add(key, DiffToolKind::External, program)?;
    }
    Ok(tools)
}

fn snapshot_at(root: &Path, file: &str, revision: &str) -> Result<Option<Vec<u8>>, String> {
    let revision = if revision.is_empty() {
        "HEAD"
    } else {
        revision
    };
    let out = git_output(
        root,
        &[
            "rev-parse",
            "--verify",
            "--end-of-options",
            &format!("{revision}^{{commit}}"),
        ],
    )?;
    if !out.status.success() {
        return Err("invalid diff revision".into());
    }
    let commit = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let tree = git_output(root, &["ls-tree", "-z", &commit, "--", file])?;
    if !tree.status.success() {
        return Err(String::from_utf8_lossy(&tree.stderr).into_owned());
    }
    if tree.stdout.is_empty() {
        return Ok(None);
    }
    let tree = String::from_utf8(tree.stdout).map_err(|e| e.to_string())?;
    let header = tree.split('\t').next().ok_or("invalid tree entry")?;
    let mut fields = header.split_whitespace();
    let _mode = fields.next();
    if fields.next() != Some("blob") {
        return Err("not a blob".into());
    }
    let oid = fields.next().ok_or("missing blob")?;
    let size = git_output(root, &["cat-file", "-s", oid])?;
    let size: u64 = String::from_utf8_lossy(&size.stdout)
        .trim()
        .parse()
        .map_err(|_| "invalid blob size")?;
    if size > MAX_INPUT {
        return Err("diff-tool-too-large".into());
    }
    let out = git_output(root, &["cat-file", "blob", oid])?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).into_owned());
    }
    Ok(Some(out.stdout))
}

fn quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

fn private_git(root: &Path) -> Command {
    let mut cmd = command("git");
    cmd.arg("-C")
        .arg(root)
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GIT_CONFIG_GLOBAL", root.join("empty-config"))
        .env("GIT_CONFIG_COUNT", "0")
        .env("GIT_ATTR_NOSYSTEM", "1");
    for key in [
        "GIT_CONFIG",
        "GIT_CONFIG_PARAMETERS",
        "GIT_DIR",
        "GIT_WORK_TREE",
        "GIT_COMMON_DIR",
        "GIT_INDEX_FILE",
        "GIT_OBJECT_DIRECTORY",
        "GIT_ALTERNATE_OBJECT_DIRECTORIES",
        "GIT_EXTERNAL_DIFF",
        "GIT_EXTERNAL_DIFF_TRUST_EXIT_CODE",
        "GIT_ATTR_SOURCE",
    ] {
        cmd.env_remove(key);
    }
    cmd
}

fn pipe<R: Read + Send + 'static>(mut source: R) -> Receiver<Result<(Vec<u8>, bool), String>> {
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let result = (|| {
            let mut bytes = Vec::new();
            let mut truncated = false;
            let mut buffer = [0; 8192];
            loop {
                let n = source.read(&mut buffer).map_err(|e| e.to_string())?;
                if n == 0 {
                    break;
                }
                let keep = n.min(MAX_OUTPUT - bytes.len());
                bytes.extend_from_slice(&buffer[..keep]);
                truncated |= keep < n;
            }
            Ok((bytes, truncated))
        })();
        let _ = tx.send(result);
    });
    rx
}

fn run(mut cmd: Command, timeout: Duration) -> Result<SpecializedDiff, String> {
    #[cfg(windows)]
    super::process_job::suspend(&mut cmd);
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    let mut child = cmd
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    #[cfg(windows)]
    let job = match super::process_job::ProcessJob::attach(&child) {
        Ok(job) => job,
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }
    };
    let out = pipe(child.stdout.take().ok_or("missing stdout")?);
    let err = pipe(child.stderr.take().ok_or("missing stderr")?);
    let deadline = Instant::now() + timeout;
    let result = (|| {
        let status = loop {
            if Instant::now() >= deadline {
                return Err("diff-tool-timeout".into());
            }
            if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
                break status;
            }
            std::thread::sleep(Duration::from_millis(10));
        };
        let (stdout, truncated) = out
            .recv_timeout(deadline.saturating_duration_since(Instant::now()))
            .map_err(|_| "diff-tool-timeout")??;
        let (stderr, _) = err
            .recv_timeout(deadline.saturating_duration_since(Instant::now()))
            .map_err(|_| "diff-tool-timeout")??;
        if !status.success() && status.code() != Some(1) {
            return Err(String::from_utf8_lossy(&stderr).into_owned());
        }
        Ok(SpecializedDiff {
            text: String::from_utf8_lossy(&stdout).into_owned(),
            truncated,
        })
    })();
    #[cfg(unix)]
    // SAFETY: this child was started in its own process group.
    unsafe {
        libc::kill(-(child.id() as i32), libc::SIGKILL);
    }
    #[cfg(windows)]
    drop(job);
    if result.is_err() {
        let _ = child.kill();
        let _ = child.wait();
    }
    result
}

#[tauri::command(async)]
pub fn git_specialized_diff(
    root: String,
    file: String,
    base: String,
    head: Option<String>,
    id: String,
) -> Result<SpecializedDiff, String> {
    specialized_diff(&root, &file, &base, head.as_deref(), &id)
}

fn specialized_diff(
    root: &str,
    file: &str,
    base: &str,
    head: Option<&str>,
    id: &str,
) -> Result<SpecializedDiff, String> {
    let tool = git_diff_tools(root.into(), file.into())?
        .into_iter()
        .find(|tool| tool.id == id)
        .ok_or("diff-tool-changed")?;
    let root = Path::new(root).canonicalize().map_err(|e| e.to_string())?;
    let before = snapshot_at(&root, file, base)?;
    let after = match head {
        Some(head) => snapshot_at(&root, file, head)?,
        None => {
            let path = checked_file(root.to_str().ok_or("invalid root")?, file)?;
            if !path.exists() {
                None
            } else {
                let input = std::fs::File::open(path).map_err(|e| e.to_string())?;
                if input.metadata().map_err(|e| e.to_string())?.len() > MAX_INPUT {
                    return Err("diff-tool-too-large".into());
                }
                let mut bytes = Vec::new();
                input
                    .take(MAX_INPUT + 1)
                    .read_to_end(&mut bytes)
                    .map_err(|e| e.to_string())?;
                if bytes.len() as u64 > MAX_INPUT {
                    return Err("diff-tool-too-large".into());
                }
                Some(bytes)
            }
        }
    };
    let dir = tempfile::tempdir().map_err(|e| e.to_string())?;
    std::fs::write(dir.path().join("empty-config"), "").map_err(|e| e.to_string())?;
    let init = private_git(dir.path())
        .args(["init", "-q", "--template="])
        .output()
        .map_err(|e| e.to_string())?;
    if !init.status.success() {
        return Err(String::from_utf8_lossy(&init.stderr).into_owned());
    }
    std::fs::create_dir_all(dir.path().join(".git/info")).map_err(|e| e.to_string())?;
    std::fs::write(
        dir.path().join(".git/info/attributes"),
        "* diff=reado-approved\n",
    )
    .map_err(|e| e.to_string())?;
    let name = Path::new(file).file_name().ok_or("missing filename")?;
    let mut paths = Vec::new();
    for (side, bytes) in [("before", before), ("after", after)] {
        let Some(bytes) = bytes else {
            paths.push(PathBuf::from("/dev/null"));
            continue;
        };
        std::fs::create_dir(dir.path().join(side)).map_err(|e| e.to_string())?;
        let path = dir.path().join(side).join(name);
        std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
        paths.push(path);
    }
    let cwd = root.to_str().ok_or("invalid root")?.to_string();
    #[cfg(windows)]
    let cwd = windows_shell_cwd(&cwd);
    let pinned = format!("cd {} && {}", quote(cwd.as_str()), tool.command);
    let key = match tool.kind {
        DiffToolKind::Textconv => "diff.reado-approved.textconv",
        DiffToolKind::External => "diff.reado-approved.command",
    };
    let mut cmd = private_git(dir.path());
    cmd.args([
        "-c",
        &format!("{key}={pinned}"),
        "-c",
        "core.attributesfile=empty-config",
        "-c",
        "diff.reado-approved.trustExitCode=true",
        "diff",
        "--no-index",
        "--no-color",
    ]);
    match tool.kind {
        DiffToolKind::Textconv => {
            cmd.args(["--textconv", "--no-ext-diff"]);
        }
        DiffToolKind::External => {
            cmd.args(["--no-textconv", "--ext-diff"]);
        }
    }
    cmd.arg("--").args(&paths);
    let mut result = run(cmd, TIMEOUT)?;
    let prefix = dir.path().to_string_lossy();
    result.text = result.text.replace(prefix.as_ref(), "");
    #[cfg(windows)]
    {
        result.text = result.text.replace(&windows_shell_cwd(&prefix), "");
    }
    Ok(result)
}

#[cfg(any(windows, test))]
fn windows_shell_cwd(path: &str) -> String {
    let path = path.strip_prefix(r"\\?\").unwrap_or(path);
    let path = path
        .strip_prefix(r"UNC\")
        .map_or_else(|| path.to_string(), |p| format!("//{p}"));
    path.replace('\\', "/")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::diff_tests::{DiffRepo, Driver, DRIVERS};

    #[test]
    fn windows_shell_paths_remove_verbatim_prefixes() {
        assert_eq!(
            windows_shell_cwd(r"\\?\C:\Project files"),
            "C:/Project files"
        );
        assert_eq!(
            windows_shell_cwd(r"\\?\UNC\server\share\project"),
            "//server/share/project"
        );
    }

    #[test]
    fn added_pr_files_can_be_previewed_without_checkout() {
        let repo = DiffRepo::new(Driver::Textconv);
        repo.git(&["config", "diff.audit.textconv", "cat"]);
        std::fs::write(repo.path().join(".gitattributes"), "*.txt diff=audit\n").unwrap();
        std::fs::write(repo.path().join("added.txt"), "new PR file\n").unwrap();
        repo.git(&["add", "."]);
        repo.git(&["commit", "-qm", "add PR file"]);
        std::fs::remove_file(repo.path().join("added.txt")).unwrap();
        let tool = git_diff_tools(repo.root(), "added.txt".into())
            .unwrap()
            .remove(0);
        let result =
            specialized_diff(&repo.root(), "added.txt", "HEAD~1", Some("HEAD"), &tool.id).unwrap();
        assert!(result.text.contains("+new PR file"));
        assert!(!repo.path().join("added.txt").exists());
    }

    #[test]
    fn absent_versions_are_not_sent_to_a_binary_converter_as_empty_files() {
        let repo = DiffRepo::new(Driver::Textconv);
        repo.git(&["config", "diff.audit.textconv", "test -s \"$1\" && cat"]);
        std::fs::write(repo.path().join(".gitattributes"), "*.txt diff=audit\n").unwrap();
        std::fs::write(repo.path().join("added.txt"), "new document\n").unwrap();
        let tool = git_diff_tools(repo.root(), "added.txt".into())
            .unwrap()
            .remove(0);
        let result = specialized_diff(&repo.root(), "added.txt", "HEAD", None, &tool.id).unwrap();
        assert!(result.text.contains("+new document"));
    }

    #[test]
    fn other_configured_commands_do_not_run_in_an_approved_preview() {
        let repo = DiffRepo::new(Driver::Textconv);
        repo.git(&["config", "diff.audit.textconv", "cat"]);
        repo.git(&[
            "config",
            "diff.audit.command",
            "printf forbidden > forbidden-ran",
        ]);
        repo.git(&[
            "config",
            "diff.external",
            "printf forbidden > forbidden-ran",
        ]);
        let tool = git_diff_tools(repo.root(), "tracked.txt".into())
            .unwrap()
            .into_iter()
            .find(|tool| tool.kind == DiffToolKind::Textconv)
            .unwrap();
        let result = specialized_diff(&repo.root(), "tracked.txt", "HEAD", None, &tool.id).unwrap();
        assert!(result.text.contains("-two\n+changed\n"));
        assert!(!repo.path().join("forbidden-ran").exists());
    }

    #[cfg(unix)]
    #[test]
    fn a_preview_timeout_stops_the_process_group() {
        let mut cmd = Command::new("/bin/sh");
        cmd.args(["-c", "sleep 5"]);
        let result = run(cmd, Duration::from_millis(100));
        assert_eq!(result.unwrap_err(), "diff-tool-timeout");
    }

    #[cfg(unix)]
    #[test]
    fn successful_previews_do_not_leave_background_children() {
        let dir = tempfile::tempdir().unwrap();
        let script = "(sleep 0.2; printf orphan > orphan) >/dev/null 2>&1 & printf result";
        Command::new("/bin/sh")
            .args(["-c", script])
            .current_dir(dir.path())
            .output()
            .unwrap();
        std::thread::sleep(Duration::from_millis(300));
        assert!(dir.path().join("orphan").exists());
        std::fs::remove_file(dir.path().join("orphan")).unwrap();
        let mut cmd = Command::new("/bin/sh");
        cmd.args(["-c", script]).current_dir(dir.path());
        assert_eq!(run(cmd, TIMEOUT).unwrap().text, "result");
        std::thread::sleep(Duration::from_millis(300));
        assert!(!dir.path().join("orphan").exists());
    }

    #[cfg(unix)]
    #[test]
    fn output_is_capped_while_the_process_is_drained() {
        let mut cmd = Command::new("/bin/sh");
        cmd.args(["-c", "awk 'BEGIN { for(i=0;i<2200000;i++) printf \"x\" }'"]);
        let result = run(cmd, TIMEOUT).unwrap();
        assert_eq!(result.text.len(), MAX_OUTPUT);
        assert!(result.truncated);
    }

    #[test]
    fn inspection_reports_commands_without_executing_them() {
        for driver in DRIVERS {
            let repo = DiffRepo::new(driver);
            let tools = git_diff_tools(repo.root(), "tracked.txt".into()).unwrap();
            repo.assert_driver_not_run();
            assert_eq!(tools.len(), 1, "{driver:?}");
            assert_eq!(
                tools[0].command,
                "printf ran > driver-ran; printf converted"
            );
        }
    }

    #[test]
    fn builtin_drivers_need_no_execution_permission() {
        let repo = DiffRepo::new(Driver::Textconv);
        repo.git(&["config", "--unset", "diff.audit.textconv"]);
        std::fs::write(repo.path().join(".gitattributes"), "*.txt diff=rust\n").unwrap();
        assert!(git_diff_tools(repo.root(), "tracked.txt".into())
            .unwrap()
            .is_empty());
        repo.assert_driver_not_run();
    }

    #[test]
    fn approval_is_bound_to_the_command_file_and_project() {
        let repo = DiffRepo::new(Driver::Textconv);
        let tool = git_diff_tools(repo.root(), "tracked.txt".into())
            .unwrap()
            .remove(0);
        repo.git(&[
            "config",
            "diff.audit.textconv",
            "printf changed > driver-ran",
        ]);
        assert!(specialized_diff(&repo.root(), "tracked.txt", "HEAD", None, &tool.id).is_err());
        repo.assert_driver_not_run();

        repo.git(&["config", "diff.audit.textconv", &tool.command]);
        std::fs::write(repo.path().join("other.txt"), "other\n").unwrap();
        assert!(specialized_diff(&repo.root(), "other.txt", "HEAD", None, &tool.id).is_err());
        let other = DiffRepo::new(Driver::Textconv);
        assert!(specialized_diff(&other.root(), "tracked.txt", "HEAD", None, &tool.id).is_err());
        repo.assert_driver_not_run();
        other.assert_driver_not_run();
    }

    #[test]
    fn approved_external_diff_runs_once_without_enabling_automatic_diffs() {
        let repo = DiffRepo::new(Driver::Attribute);
        let tool = git_diff_tools(repo.root(), "tracked.txt".into())
            .unwrap()
            .remove(0);
        let result = specialized_diff(&repo.root(), "tracked.txt", "HEAD", None, &tool.id).unwrap();
        assert!(repo.path().join("driver-ran").exists());
        assert_eq!(result.text, "converted");
        std::fs::remove_file(repo.path().join("driver-ran")).unwrap();
        assert_eq!(
            crate::git::git_working_diff_lines(repo.root(), "tracked.txt".into()),
            vec![[2, 2]]
        );
        repo.assert_driver_not_run();
    }

    #[test]
    fn textconv_preview_compares_converted_snapshots() {
        let repo = DiffRepo::new(Driver::Textconv);
        repo.git(&["config", "diff.audit.textconv", "cat"]);
        let tool = git_diff_tools(repo.root(), "tracked.txt".into())
            .unwrap()
            .remove(0);
        let result = specialized_diff(&repo.root(), "tracked.txt", "HEAD", None, &tool.id).unwrap();
        assert!(result.text.contains("-two\n+changed\n"));
        assert!(!result.truncated);
        repo.assert_driver_not_run();
    }

    #[test]
    fn preview_reads_the_pr_head_instead_of_the_working_tree() {
        let repo = DiffRepo::new(Driver::Textconv);
        repo.git(&["config", "diff.audit.textconv", "cat"]);
        repo.git(&["add", "tracked.txt"]);
        repo.git(&["commit", "-qm", "PR"]);
        std::fs::write(repo.path().join("tracked.txt"), "unrelated working copy\n").unwrap();
        let tool = git_diff_tools(repo.root(), "tracked.txt".into())
            .unwrap()
            .remove(0);
        let result = specialized_diff(
            &repo.root(),
            "tracked.txt",
            "HEAD~1",
            Some("HEAD"),
            &tool.id,
        )
        .unwrap();
        assert!(result.text.contains("-two\n+changed\n"));
        assert!(!result.text.contains("unrelated"));
    }

    #[test]
    fn inspection_rejects_paths_outside_the_project() {
        let repo = DiffRepo::new(Driver::Textconv);
        for file in ["../tracked.txt", "/etc/passwd", ""] {
            assert!(git_diff_tools(repo.root(), file.into()).is_err());
        }
        repo.assert_driver_not_run();
    }
}
