use serde::Serialize;
use std::collections::HashSet;
use std::sync::Mutex;
use tauri::State;

#[cfg(unix)]
mod unix;
#[cfg(any(not(unix), test))]
mod unsupported;

#[cfg(unix)]
use unix as platform;
#[cfg(not(unix))]
use unsupported as platform;

#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(not(unix), allow(dead_code))]
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

#[derive(Default)]
pub struct DiffToolApprovals(Mutex<HashSet<String>>);

impl DiffToolApprovals {
    fn confirm(&self, root: String, file: String, id: String) -> Result<(), String> {
        if !platform::git_diff_tools(root, file)?
            .iter()
            .any(|tool| tool.id == id)
        {
            return Err("diff-tool-changed".into());
        }
        self.0
            .lock()
            .map_err(|_| "diff-tool-approval-unavailable")?
            .insert(id);
        Ok(())
    }

    fn run(
        &self,
        root: String,
        file: String,
        base: String,
        head: Option<String>,
        id: String,
    ) -> Result<SpecializedDiff, String> {
        if !self
            .0
            .lock()
            .map_err(|_| "diff-tool-approval-unavailable")?
            .remove(&id)
        {
            return Err("diff-tool-not-approved".into());
        }
        platform::git_specialized_diff(root, file, base, head, id)
    }
}

#[tauri::command(async)]
pub fn git_diff_tools(root: String, file: String) -> Result<Vec<DiffTool>, String> {
    platform::git_diff_tools(root, file)
}

#[tauri::command(async)]
pub fn git_confirm_diff_tool(
    approvals: State<DiffToolApprovals>,
    root: String,
    file: String,
    id: String,
) -> Result<(), String> {
    approvals.confirm(root, file, id)
}

#[tauri::command(async)]
pub fn git_specialized_diff(
    approvals: State<DiffToolApprovals>,
    root: String,
    file: String,
    base: String,
    head: Option<String>,
    id: String,
) -> Result<SpecializedDiff, String> {
    approvals.run(root, file, base, head, id)
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use crate::git::diff_tests::{DiffRepo, Driver};

    fn tool_id(repo: &DiffRepo) -> String {
        git_diff_tools(repo.root(), "tracked.txt".into())
            .unwrap()
            .remove(0)
            .id
    }

    fn preview(
        approvals: &DiffToolApprovals,
        repo: &DiffRepo,
        id: &str,
    ) -> Result<SpecializedDiff, String> {
        approvals.run(
            repo.root(),
            "tracked.txt".into(),
            "HEAD".into(),
            None,
            id.into(),
        )
    }

    #[test]
    fn inspection_does_not_authorize_execution() {
        let repo = DiffRepo::new(Driver::Attribute);
        let result = preview(&DiffToolApprovals::default(), &repo, &tool_id(&repo));
        assert_eq!(result.unwrap_err(), "diff-tool-not-approved");
        repo.assert_driver_not_run();
    }

    #[test]
    fn confirmation_allows_only_one_execution() {
        let repo = DiffRepo::new(Driver::Attribute);
        let id = tool_id(&repo);
        let approvals = DiffToolApprovals::default();
        approvals
            .confirm(repo.root(), "tracked.txt".into(), id.clone())
            .unwrap();
        repo.assert_driver_not_run();
        assert_eq!(preview(&approvals, &repo, &id).unwrap().text, "converted");
        std::fs::remove_file(repo.path().join("driver-ran")).unwrap();
        assert_eq!(
            preview(&approvals, &repo, &id).unwrap_err(),
            "diff-tool-not-approved"
        );
        repo.assert_driver_not_run();
    }

    #[test]
    fn execution_rechecks_the_confirmed_command() {
        let repo = DiffRepo::new(Driver::Attribute);
        let id = tool_id(&repo);
        let approvals = DiffToolApprovals::default();
        approvals
            .confirm(repo.root(), "tracked.txt".into(), id.clone())
            .unwrap();
        repo.git(&[
            "config",
            "diff.audit.command",
            "printf changed > driver-ran",
        ]);
        assert_eq!(
            approvals
                .confirm(repo.root(), "tracked.txt".into(), id.clone())
                .unwrap_err(),
            "diff-tool-changed"
        );
        assert_eq!(
            preview(&approvals, &repo, &tool_id(&repo)).unwrap_err(),
            "diff-tool-not-approved"
        );
        assert_eq!(
            preview(&approvals, &repo, &id).unwrap_err(),
            "diff-tool-changed"
        );
        assert_eq!(
            preview(&approvals, &repo, &id).unwrap_err(),
            "diff-tool-not-approved"
        );
        repo.assert_driver_not_run();
    }
}
