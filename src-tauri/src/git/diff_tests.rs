use super::*;
use std::path::Path;

#[derive(Clone, Copy, Debug)]
pub(crate) enum Driver {
    Textconv,
    External,
    Attribute,
}

pub(crate) const DRIVERS: [Driver; 3] = [Driver::Textconv, Driver::External, Driver::Attribute];

pub(crate) struct DiffRepo {
    dir: tempfile::TempDir,
}

impl DiffRepo {
    pub(crate) fn new(driver: Driver) -> Self {
        let repo = Self {
            dir: tempfile::Builder::new()
                .prefix("reado diff ")
                .tempdir()
                .unwrap(),
        };
        repo.git(&["init", "-q", "--initial-branch=main", "--template="]);
        repo.git(&["config", "user.name", "Test"]);
        repo.git(&["config", "user.email", "test@example.com"]);
        repo.git(&["config", "commit.gpgsign", "false"]);
        repo.git(&["config", "core.autocrlf", "false"]);
        repo.git(&["config", "color.ui", "false"]);
        repo.git(&["config", "color.diff", "false"]);
        repo.git(&["config", "core.hooksPath", "disabled-hooks"]);
        std::fs::write(
            repo.path().join(".gitattributes"),
            "tracked.txt diff=audit\n",
        )
        .unwrap();
        std::fs::write(repo.path().join("tracked.txt"), "one\ntwo\nthree\n").unwrap();
        repo.git(&["add", "."]);
        repo.git(&["commit", "-qm", "initial"]);
        let key = match driver {
            Driver::Textconv => "diff.audit.textconv",
            Driver::External => "diff.external",
            Driver::Attribute => "diff.audit.command",
        };
        repo.git(&["config", key, "printf ran > driver-ran; printf converted"]);
        std::fs::write(repo.path().join("tracked.txt"), "one\nchanged\nthree\n").unwrap();

        // Prove the fixture executes before testing Reado's protection.
        repo.git(&["diff", "HEAD", "--", "tracked.txt"]);
        assert!(repo.path().join("driver-ran").exists(), "{driver:?}");
        std::fs::remove_file(repo.path().join("driver-ran")).unwrap();
        repo
    }

    pub(crate) fn path(&self) -> &Path {
        self.dir.path()
    }

    pub(crate) fn root(&self) -> String {
        self.path().to_str().unwrap().to_string()
    }

    pub(crate) fn git(&self, args: &[&str]) -> String {
        let out = std::process::Command::new("git")
            .arg("-C")
            .arg(self.path())
            .args(args)
            .output()
            .unwrap();
        assert!(
            out.status.success(),
            "git {args:?}: {}",
            String::from_utf8_lossy(&out.stderr)
        );
        String::from_utf8(out.stdout).unwrap()
    }

    pub(crate) fn assert_driver_not_run(&self) {
        assert!(!self.path().join("driver-ran").exists());
    }
}

#[test]
fn working_diff_ignores_executable_drivers() {
    for driver in DRIVERS {
        let repo = DiffRepo::new(driver);
        let lines = git_working_diff_lines(repo.root(), "tracked.txt".into());
        repo.assert_driver_not_run();
        assert_eq!(lines, vec![[2, 2]], "{driver:?}");
    }
}

#[test]
fn revision_diff_ignores_executable_drivers() {
    for driver in DRIVERS {
        let repo = DiffRepo::new(driver);
        repo.git(&["add", "tracked.txt"]);
        repo.git(&["commit", "-qm", "change"]);
        let lines = git_diff_lines(
            repo.root(),
            "tracked.txt".into(),
            "HEAD~1".into(),
            "HEAD".into(),
        );
        repo.assert_driver_not_run();
        assert_eq!(lines, vec![[2, 2]], "{driver:?}");
    }
}

#[test]
fn hunk_diff_ignores_executable_drivers_and_remains_applicable() {
    for driver in DRIVERS {
        for staged in [false, true] {
            let repo = DiffRepo::new(driver);
            if staged {
                repo.git(&["add", "tracked.txt"]);
            }
            let hunks = git_file_hunks(repo.root(), "tracked.txt".into(), staged);
            repo.assert_driver_not_run();
            assert_eq!(hunks.len(), 1, "{driver:?}, staged={staged}");
            assert!(hunks[0].patch.contains("-two\n+changed\n"));
            git_apply_patch(repo.root(), hunks[0].patch.clone(), true, staged).unwrap();
            let index = repo.git(&["show", ":tracked.txt"]);
            assert_eq!(
                index,
                if staged {
                    "one\ntwo\nthree\n"
                } else {
                    "one\nchanged\nthree\n"
                }
            );
            assert_eq!(
                std::fs::read_to_string(repo.path().join("tracked.txt")).unwrap(),
                "one\nchanged\nthree\n"
            );
        }
    }
}

#[test]
fn shared_diff_reader_preserves_raw_output_without_running_drivers() {
    for driver in DRIVERS {
        let repo = DiffRepo::new(driver);
        let diff = run_git_raw(
            repo.path(),
            &["diff", "--unified=0", "HEAD", "--", "tracked.txt"],
        )
        .unwrap();
        repo.assert_driver_not_run();
        assert!(diff.contains("@@ -2 +2 @@"));
        assert!(diff.ends_with("-two\n+changed\n"));
        assert_eq!(
            git_changed_files(repo.root(), None),
            vec!["tracked.txt".to_string()]
        );
        repo.assert_driver_not_run();
    }
}
