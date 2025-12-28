use notify::{
    Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher,
};
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{channel, Receiver},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};
use tauri::{
    ipc::{InvokeBody, Response},
    AppHandle, Emitter, State,
};

#[tauri::command]
pub fn my_custom_command() {
    println!("I was invoked from JS!");
}

#[tauri::command]
pub fn read_file(path: &str) -> Response {
    match fs::read(path) {
        Ok(data) => {
            println!("File read succesfully");
            return Response::new(InvokeBody::Raw(data));
        }
        Err(e) => {
            println!("Error reading file: {:?}", e);
            return Response::new(InvokeBody::Raw(vec![]));
        }
    }
}

#[tauri::command]
pub fn exec_shell_command(command: &str) -> Result<String, String> {
    let output = if cfg!(target_os = "windows") {
        Command::new("cmd")
            .args(["/C", command])
            .output()
    } else {
        Command::new("sh")
            .arg("-c")
            .arg(command)
            .output()
    };

    match output {
        Ok(output) => {
            if output.status.success() {
                Ok(String::from_utf8_lossy(&output.stdout).to_string())
            } else {
                Err(String::from_utf8_lossy(&output.stderr).to_string())
            }
        }
        Err(e) => Err(e.to_string()),
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestTreeNode {
    pub id: String,
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<TestTreeNode>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderChangeOp {
    pub r#type: String,
    pub node: TestTreeNode,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderChangePayload {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub full_tree: Option<Vec<TestTreeNode>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ops: Option<Vec<FolderChangeOp>>,
}

#[derive(Default)]
pub struct WatcherState {
    pub active: Mutex<Option<ActiveWatcher>>,
}

pub struct ActiveWatcher {
    pub _watcher: RecommendedWatcher,
    pub stop: Arc<AtomicBool>,
    pub _handle: thread::JoinHandle<()>,
}

#[tauri::command]
pub async fn watch_folder(
    app: AppHandle,
    state: State<'_, WatcherState>,
    path: String,
) -> Result<Vec<TestTreeNode>, String> {
    let path_buf = PathBuf::from(&path);
    let canonical = fs::canonicalize(&path_buf).map_err(|e| e.to_string())?;

    if !canonical.is_dir() {
        return Err("Provided path is not a directory".into());
    }

    let initial_tree = build_tree(&canonical)?;

    // stop previous watcher if any
    if let Some(existing) = state.active.lock().unwrap().take() {
        existing.stop.store(true, Ordering::Relaxed);
    }

    let (tx, rx) = channel();
    let stop_flag = Arc::new(AtomicBool::new(false));
    let stop_flag_clone = stop_flag.clone();
    let app_handle = app.clone();

    let mut watcher = RecommendedWatcher::new(
        move |res| {
            let _ = tx.send(res);
        },
        Config::default(),
    )
    .map_err(|e| e.to_string())?;

    watcher
        .watch(&canonical, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    let handle = thread::spawn(move || watch_loop(app_handle, rx, stop_flag_clone));

    let active = ActiveWatcher {
        _watcher: watcher,
        stop: stop_flag,
        _handle: handle,
    };

    *state.active.lock().unwrap() = Some(active);

    Ok(initial_tree)
}

fn watch_loop(app: AppHandle, rx: Receiver<notify::Result<Event>>, stop: Arc<AtomicBool>) {
    while !stop.load(Ordering::Relaxed) {
        match rx.recv_timeout(Duration::from_millis(500)) {
            Ok(Ok(event)) => {
                if let Some(payload) = convert_event(&event) {
                    let _ = app.emit("test-editor:folder-change", payload);
                }
            }
            Ok(Err(err)) => {
                eprintln!("watch error: {err}");
            }
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => continue,
            Err(_) => break,
        }
    }
}

fn convert_event(event: &Event) -> Option<FolderChangePayload> {
    if event.paths.is_empty() {
        return None;
    }

    let mut ops: Vec<FolderChangeOp> = Vec::new();

    match &event.kind {
        EventKind::Create(_) => {
            for path in &event.paths {
                if let Some(op) = make_op("add", path) {
                    ops.push(op);
                }
            }
        }
        EventKind::Modify(notify::event::ModifyKind::Name(
            notify::event::RenameMode::Both,
        )) => {
            if event.paths.len() == 2 {
                // treat as remove old + add new
                let from = &event.paths[0];
                let to = &event.paths[1];
                let from_parent = from.parent().map(to_id);
                ops.push(FolderChangeOp {
                    r#type: "remove".into(),
                    node: TestTreeNode {
                        id: to_id(from),
                        name: file_name(from),
                        path: to_id(from),
                        is_dir: false,
                        children: None,
                    },
                    parent_id: from_parent,
                });
                if let Some(op) = make_op("add", to) {
                    ops.push(op);
                }
            }
        }
        EventKind::Modify(_) => {
            for path in &event.paths {
                if let Some(op) = make_op("modify", path) {
                    ops.push(op);
                }
            }
        }
        EventKind::Remove(remove_kind) => {
            let is_dir_hint = matches!(
                remove_kind,
                notify::event::RemoveKind::Folder | notify::event::RemoveKind::Other
            );
            for path in &event.paths {
                let id = to_id(path);
                let parent_id = path.parent().map(to_id);
                ops.push(FolderChangeOp {
                    r#type: "remove".into(),
                    node: TestTreeNode {
                        id: id.clone(),
                        name: file_name(path),
                        path: id.clone(),
                        is_dir: is_dir_hint,
                        children: None,
                    },
                    parent_id,
                });
            }
        }
        _ => {}
    }

    if ops.is_empty() {
        None
    } else {
        Some(FolderChangePayload {
            full_tree: None,
            ops: Some(ops),
        })
    }
}

fn make_op(kind: &str, path: &Path) -> Option<FolderChangeOp> {
    let meta = fs::metadata(path).ok()?;
    let is_dir = meta.is_dir();
    let id = to_id(path);
    let parent_id = path.parent().map(to_id);
    Some(FolderChangeOp {
        r#type: kind.to_string(),
        node: TestTreeNode {
            id: id.clone(),
            name: file_name(path),
            path: id.clone(),
            is_dir,
            children: None,
        },
        parent_id,
    })
}

fn build_tree(path: &Path) -> Result<Vec<TestTreeNode>, String> {
    let mut children: Vec<TestTreeNode> = Vec::new();
    let entries = fs::read_dir(path).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let entry_path = entry.path();
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let is_dir = meta.is_dir();
        let mut node = TestTreeNode {
            id: to_id(&entry_path),
            name: file_name(&entry_path),
            path: to_id(&entry_path),
            is_dir,
            children: None,
        };
        if is_dir {
            node.children = Some(build_tree(&entry_path)?);
        }
        children.push(node);
    }

    // Sort to mimic common explorer ordering: folders first, then files; case-insensitive name.
    children.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(children)
}

fn to_id(path: &Path) -> String {
    normalize_path(path)
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned())
}

fn normalize_path(path: &Path) -> String {
    let raw = path.to_string_lossy().into_owned();
    if raw.starts_with(r"\\?\") {
        raw.trim_start_matches(r"\\?\").to_string()
    } else {
        raw
    }
}