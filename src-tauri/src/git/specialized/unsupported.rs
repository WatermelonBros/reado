use super::{DiffTool, SpecializedDiff};

pub(super) fn git_diff_tools(_root: String, _file: String) -> Result<Vec<DiffTool>, String> {
    Ok(Vec::new())
}

pub(super) fn git_specialized_diff(
    _root: String,
    _file: String,
    _base: String,
    _head: Option<String>,
    _id: String,
) -> Result<SpecializedDiff, String> {
    Err("diff-tool-unsupported".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unsupported_platform_offers_no_commands_without_inspecting_the_project() {
        let tools = git_diff_tools("missing-project".into(), "../tracked.txt".into()).unwrap();
        assert!(tools.is_empty());
    }

    #[test]
    fn unsupported_platform_rejects_direct_execution() {
        let error = git_specialized_diff(
            "missing-project".into(),
            "../tracked.txt".into(),
            "HEAD".into(),
            None,
            "unapproved-command".into(),
        )
        .unwrap_err();
        assert_eq!(error, "diff-tool-unsupported");
    }
}
