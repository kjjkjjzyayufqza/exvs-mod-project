use serde::{Deserialize, Serialize};
use std::process::Command;

use crate::read_updater_github_token;

const GITHUB_LATEST_RELEASE_URL: &str =
    "https://api.github.com/repos/kjjkjjzyayufqza/exvs-mod-project/releases/latest";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GithubLatestRelease {
    pub tag_name: String,
    pub name: Option<String>,
    pub body: Option<String>,
    pub html_url: String,
}

#[derive(Deserialize)]
struct GithubLatestReleaseResponse {
    tag_name: String,
    name: Option<String>,
    body: Option<String>,
    html_url: String,
}

fn empty_to_none(value: Option<String>) -> Option<String> {
    value.and_then(|text| {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

#[tauri::command]
pub fn fetch_github_latest_release() -> Result<GithubLatestRelease, String> {
    let curl = if cfg!(windows) { "curl.exe" } else { "curl" };
    let mut command = Command::new(curl);
    command.args([
        "-sS",
        "-f",
        "--max-time",
        "20",
        "-H",
        "Accept: application/vnd.github+json",
        "-H",
        "User-Agent: exvs-mod-project-updater",
        "-H",
        "X-GitHub-Api-Version: 2022-11-28",
    ]);
    if let Some(token) = read_updater_github_token() {
        command.args(["-H", &format!("Authorization: Bearer {token}")]);
    }
    command.arg(GITHUB_LATEST_RELEASE_URL);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let output = command
        .output()
        .map_err(|error| format!("GitHub release request failed: {error}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "GitHub latest release request failed with {}: {stderr}",
            output.status
        ));
    }
    let payload: GithubLatestReleaseResponse = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("GitHub release JSON was invalid: {error}"))?;
    Ok(GithubLatestRelease {
        tag_name: payload.tag_name,
        name: empty_to_none(payload.name),
        body: empty_to_none(payload.body),
        html_url: payload.html_url,
    })
}
