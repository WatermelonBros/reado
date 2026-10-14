use serde::Serialize;

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

#[tauri::command(async)]
pub fn git_diff_tools(root: String, file: String) -> Result<Vec<DiffTool>, String> {
    platform::git_diff_tools(root, file)
}

#[tauri::command(async)]
pub fn git_specialized_diff(
    root: String,
    file: String,
    base: String,
    head: Option<String>,
    id: String,
) -> Result<SpecializedDiff, String> {
    platform::git_specialized_diff(root, file, base, head, id)
}
