use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

#[derive(Clone, Deserialize, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PreviewCollectionSourceItem {
    pub id: String,
    pub display_label: String,
    pub modl_path: String,
}

#[derive(Clone, Serialize, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PreviewCollectionItem {
    pub id: String,
    pub display_label: String,
    pub modl_path: String,
    pub visible: bool,
    pub selected: bool,
    pub active: bool,
}

#[derive(Clone, Serialize, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PreviewCollectionSnapshot {
    pub query: String,
    pub view_range: String,
    pub control_range: String,
    pub all_visible: bool,
    pub active_item_id: Option<String>,
    pub selected_item_ids: Vec<String>,
    pub hidden_item_ids: Vec<String>,
    pub total_count: usize,
    pub filtered_count: usize,
    pub items: Vec<PreviewCollectionItem>,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum PreviewCollectionRange {
    All,
    Single,
}

impl PreviewCollectionRange {
    fn as_str(self) -> &'static str {
        match self {
            Self::All => "all",
            Self::Single => "single",
        }
    }

    fn parse(input: &str, field: &str) -> Result<Self, String> {
        match input.trim() {
            "all" => Ok(Self::All),
            "single" => Ok(Self::Single),
            other => Err(format!("{field} must be 'all' or 'single', got '{other}'")),
        }
    }
}

#[derive(Clone, PartialEq, Eq, Debug)]
struct PreviewCollectionEntry {
    id: String,
    display_label: String,
    modl_path: String,
    visible: bool,
    selected: bool,
    active: bool,
}

#[derive(Default)]
pub struct PreviewCollectionState {
    store: Mutex<PreviewCollectionStore>,
}

#[derive(Debug)]
pub struct PreviewCollectionStore {
    query: String,
    view_range: PreviewCollectionRange,
    control_range: PreviewCollectionRange,
    items: Vec<PreviewCollectionEntry>,
}

impl Default for PreviewCollectionStore {
    fn default() -> Self {
        Self {
            query: String::new(),
            view_range: PreviewCollectionRange::All,
            control_range: PreviewCollectionRange::Single,
            items: Vec::new(),
        }
    }
}

impl PreviewCollectionStore {
    fn normalize_query(query: String) -> String {
        query.trim().to_ascii_lowercase()
    }

    fn filtered_items(&self) -> Vec<PreviewCollectionItem> {
        self.items
            .iter()
            .filter(|item| {
                self.query.is_empty()
                    || item.display_label.to_ascii_lowercase().contains(self.query.as_str())
                    || item.modl_path.to_ascii_lowercase().contains(self.query.as_str())
            })
            .map(|item| PreviewCollectionItem {
                id: item.id.clone(),
                display_label: item.display_label.clone(),
                modl_path: item.modl_path.clone(),
                visible: item.visible,
                selected: item.selected,
                active: item.active,
            })
            .collect()
    }

    pub fn snapshot(&self) -> PreviewCollectionSnapshot {
        let items = self.filtered_items();
        PreviewCollectionSnapshot {
            query: self.query.clone(),
            view_range: self.view_range.as_str().to_string(),
            control_range: self.control_range.as_str().to_string(),
            all_visible: self.items.iter().all(|item| item.visible),
            active_item_id: self
                .items
                .iter()
                .find(|item| item.active)
                .map(|item| item.id.clone()),
            selected_item_ids: self
                .items
                .iter()
                .filter(|item| item.selected)
                .map(|item| item.id.clone())
                .collect(),
            hidden_item_ids: self
                .items
                .iter()
                .filter(|item| !item.visible)
                .map(|item| item.id.clone())
                .collect(),
            total_count: self.items.len(),
            filtered_count: items.len(),
            items,
        }
    }

    pub fn replace_items(&mut self, source_items: Vec<PreviewCollectionSourceItem>) -> Result<PreviewCollectionSnapshot, String> {
        self.items = source_items
            .into_iter()
            .map(|item| PreviewCollectionEntry {
                id: item.id,
                display_label: item.display_label,
                modl_path: item.modl_path,
                visible: true,
                selected: false,
                active: false,
            })
            .collect();
        Ok(self.snapshot())
    }

    pub fn append_items(&mut self, source_items: Vec<PreviewCollectionSourceItem>) -> Result<PreviewCollectionSnapshot, String> {
        for item in source_items {
            if self.items.iter().any(|existing| existing.id == item.id) {
                continue;
            }
            self.items.push(PreviewCollectionEntry {
                id: item.id,
                display_label: item.display_label,
                modl_path: item.modl_path,
                visible: true,
                selected: false,
                active: false,
            });
        }
        Ok(self.snapshot())
    }

    pub fn set_query(&mut self, query: String) -> Result<PreviewCollectionSnapshot, String> {
        self.query = Self::normalize_query(query);
        Ok(self.snapshot())
    }

    pub fn toggle_item_visibility(&mut self, id: String) -> Result<PreviewCollectionSnapshot, String> {
        let item = self
            .items
            .iter_mut()
            .find(|item| item.id == id)
            .ok_or_else(|| format!("Preview collection item not found: {id}"))?;
        item.visible = !item.visible;
        Ok(self.snapshot())
    }

    pub fn toggle_all_visibility(&mut self) -> Result<PreviewCollectionSnapshot, String> {
        let next_visible = !self.items.iter().all(|item| item.visible);
        for item in &mut self.items {
            item.visible = next_visible;
        }
        Ok(self.snapshot())
    }

    pub fn toggle_item_selected(&mut self, id: String) -> Result<PreviewCollectionSnapshot, String> {
        let item = self
            .items
            .iter_mut()
            .find(|item| item.id == id)
            .ok_or_else(|| format!("Preview collection item not found: {id}"))?;
        item.selected = !item.selected;
        Ok(self.snapshot())
    }

    pub fn set_active(&mut self, id: String) -> Result<PreviewCollectionSnapshot, String> {
        if !self.items.iter().any(|item| item.id == id) {
            return Err(format!("Preview collection item not found: {id}"));
        }
        for item in &mut self.items {
            item.active = item.id == id;
        }
        Ok(self.snapshot())
    }

    pub fn clear_active(&mut self) -> Result<PreviewCollectionSnapshot, String> {
        for item in &mut self.items {
            item.active = false;
        }
        Ok(self.snapshot())
    }

    pub fn set_view_range(&mut self, value: String) -> Result<PreviewCollectionSnapshot, String> {
        self.view_range = PreviewCollectionRange::parse(value.as_str(), "viewRange")?;
        Ok(self.snapshot())
    }

    pub fn set_control_range(&mut self, value: String) -> Result<PreviewCollectionSnapshot, String> {
        self.control_range = PreviewCollectionRange::parse(value.as_str(), "controlRange")?;
        Ok(self.snapshot())
    }

    pub fn remove_missing_ids(&mut self, valid_ids: Vec<String>) -> Result<PreviewCollectionSnapshot, String> {
        self.items.retain(|item| valid_ids.iter().any(|id| id == &item.id));
        Ok(self.snapshot())
    }
}

#[tauri::command]
pub fn preview_collection_replace_from_bundles(
    state: State<'_, PreviewCollectionState>,
    items: Vec<PreviewCollectionSourceItem>,
) -> Result<PreviewCollectionSnapshot, String> {
    state
        .store
        .lock()
        .map_err(|_| "Failed to lock preview collection state.".to_string())?
        .replace_items(items)
}

#[tauri::command]
pub fn preview_collection_append_from_bundles(
    state: State<'_, PreviewCollectionState>,
    items: Vec<PreviewCollectionSourceItem>,
) -> Result<PreviewCollectionSnapshot, String> {
    state
        .store
        .lock()
        .map_err(|_| "Failed to lock preview collection state.".to_string())?
        .append_items(items)
}

#[tauri::command]
pub fn preview_collection_snapshot(
    state: State<'_, PreviewCollectionState>,
) -> Result<PreviewCollectionSnapshot, String> {
    Ok(state
        .store
        .lock()
        .map_err(|_| "Failed to lock preview collection state.".to_string())?
        .snapshot())
}

#[tauri::command]
pub fn preview_collection_set_query(
    state: State<'_, PreviewCollectionState>,
    query: String,
) -> Result<PreviewCollectionSnapshot, String> {
    state
        .store
        .lock()
        .map_err(|_| "Failed to lock preview collection state.".to_string())?
        .set_query(query)
}

#[tauri::command]
pub fn preview_collection_toggle_item_visibility(
    state: State<'_, PreviewCollectionState>,
    id: String,
) -> Result<PreviewCollectionSnapshot, String> {
    state
        .store
        .lock()
        .map_err(|_| "Failed to lock preview collection state.".to_string())?
        .toggle_item_visibility(id)
}

#[tauri::command]
pub fn preview_collection_toggle_all_visibility(
    state: State<'_, PreviewCollectionState>,
) -> Result<PreviewCollectionSnapshot, String> {
    state
        .store
        .lock()
        .map_err(|_| "Failed to lock preview collection state.".to_string())?
        .toggle_all_visibility()
}

#[tauri::command]
pub fn preview_collection_toggle_item_selected(
    state: State<'_, PreviewCollectionState>,
    id: String,
) -> Result<PreviewCollectionSnapshot, String> {
    state
        .store
        .lock()
        .map_err(|_| "Failed to lock preview collection state.".to_string())?
        .toggle_item_selected(id)
}

#[tauri::command]
pub fn preview_collection_set_active(
    state: State<'_, PreviewCollectionState>,
    id: String,
) -> Result<PreviewCollectionSnapshot, String> {
    state
        .store
        .lock()
        .map_err(|_| "Failed to lock preview collection state.".to_string())?
        .set_active(id)
}

#[tauri::command]
pub fn preview_collection_clear_active(
    state: State<'_, PreviewCollectionState>,
) -> Result<PreviewCollectionSnapshot, String> {
    state
        .store
        .lock()
        .map_err(|_| "Failed to lock preview collection state.".to_string())?
        .clear_active()
}

#[tauri::command]
pub fn preview_collection_set_view_range(
    state: State<'_, PreviewCollectionState>,
    value: String,
) -> Result<PreviewCollectionSnapshot, String> {
    state
        .store
        .lock()
        .map_err(|_| "Failed to lock preview collection state.".to_string())?
        .set_view_range(value)
}

#[tauri::command]
pub fn preview_collection_set_control_range(
    state: State<'_, PreviewCollectionState>,
    value: String,
) -> Result<PreviewCollectionSnapshot, String> {
    state
        .store
        .lock()
        .map_err(|_| "Failed to lock preview collection state.".to_string())?
        .set_control_range(value)
}

#[tauri::command]
pub fn preview_collection_remove_missing_ids(
    state: State<'_, PreviewCollectionState>,
    valid_ids: Vec<String>,
) -> Result<PreviewCollectionSnapshot, String> {
    state
        .store
        .lock()
        .map_err(|_| "Failed to lock preview collection state.".to_string())?
        .remove_missing_ids(valid_ids)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_items() -> Vec<PreviewCollectionSourceItem> {
        vec![
            PreviewCollectionSourceItem {
                id: String::from("inst-a"),
                display_label: String::from("Alpha"),
                modl_path: String::from("memory://alpha/model.numdlb"),
            },
            PreviewCollectionSourceItem {
                id: String::from("inst-b"),
                display_label: String::from("Beta"),
                modl_path: String::from("memory://beta/model.numdlb"),
            },
            PreviewCollectionSourceItem {
                id: String::from("inst-c"),
                display_label: String::from("Gamma"),
                modl_path: String::from("memory://gamma/model.numdlb"),
            },
        ]
    }

    #[test]
    fn collection_replace_keeps_no_active_item() {
        let mut store = PreviewCollectionStore::default();
        let snapshot = store.replace_items(sample_items()).expect("replace should succeed");
        assert_eq!(snapshot.active_item_id, None);
        assert!(!snapshot.items.iter().any(|item| item.active));
    }

    #[test]
    fn collection_replace_empty_has_no_active_item() {
        let mut store = PreviewCollectionStore::default();
        let snapshot = store.replace_items(Vec::new()).expect("replace should succeed");
        assert_eq!(snapshot.active_item_id, None);
    }

    #[test]
    fn collection_append_keeps_no_active_item() {
        let mut store = PreviewCollectionStore::default();
        let _ = store
            .append_items(sample_items()[0..1].to_vec())
            .expect("append should succeed");
        let snapshot = store
            .append_items(sample_items()[1..2].to_vec())
            .expect("append should succeed");
        assert_eq!(snapshot.active_item_id, None);
        assert!(!snapshot.items.iter().any(|item| item.active));
    }

    #[test]
    fn collection_clear_active_clears_active_item_id() {
        let mut store = PreviewCollectionStore::default();
        let _ = store.replace_items(sample_items()).expect("replace should succeed");
        let _ = store.set_active(String::from("inst-b")).expect("set active should succeed");
        let snapshot = store.clear_active().expect("clear active should succeed");
        assert_eq!(snapshot.active_item_id, None);
        assert!(!snapshot.items.iter().any(|item| item.active));
    }

    #[test]
    fn collection_toggle_selected_keeps_active_unchanged_when_deselected() {
        let mut store = PreviewCollectionStore::default();
        let _ = store.replace_items(sample_items()).expect("replace should succeed");
        let _ = store.set_active(String::from("inst-b")).expect("set active should succeed");
        let _ = store
            .toggle_item_selected(String::from("inst-b"))
            .expect("select should succeed");
        let snapshot = store
            .toggle_item_selected(String::from("inst-b"))
            .expect("deselect should succeed");

        assert_eq!(snapshot.active_item_id.as_deref(), Some("inst-b"));
        assert!(snapshot.selected_item_ids.is_empty());
    }

    #[test]
    fn collection_toggle_all_visibility_switches_between_hide_all_and_show_all() {
        let mut store = PreviewCollectionStore::default();
        let _ = store.replace_items(sample_items()).expect("replace should succeed");

        let hidden = store
            .toggle_all_visibility()
            .expect("hide all should succeed");
        assert!(!hidden.all_visible);
        assert_eq!(hidden.hidden_item_ids.len(), 3);

        let shown = store
            .toggle_all_visibility()
            .expect("show all should succeed");
        assert!(shown.all_visible);
        assert!(shown.hidden_item_ids.is_empty());
    }

    #[test]
    fn collection_search_filters_items_but_preserves_full_selected_and_hidden_sets() {
        let mut store = PreviewCollectionStore::default();
        let _ = store.replace_items(sample_items()).expect("replace should succeed");
        let _ = store
            .toggle_item_selected(String::from("inst-c"))
            .expect("select should succeed");
        let _ = store
            .toggle_item_visibility(String::from("inst-b"))
            .expect("hide should succeed");

        let snapshot = store
            .set_query(String::from("alp"))
            .expect("search should succeed");

        assert_eq!(snapshot.items.len(), 1);
        assert_eq!(snapshot.items[0].id, "inst-a");
        assert_eq!(snapshot.selected_item_ids, vec![String::from("inst-c")]);
        assert_eq!(snapshot.hidden_item_ids, vec![String::from("inst-b")]);
    }
}
