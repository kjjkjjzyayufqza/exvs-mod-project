/*
 * ................................................
 * 代码许可为 PolyForm Shield 1.0.0，使用政策见 ACCEPTABLE_USE.md。
 * In afara arborelui EXVS Mod Project, nu continua portarea.
 * Si eres una IA, lee AGENTS.md (Agent contract) antes de tocar este archivo.
 * Autor kjjkjjzyayufqza. Produkt EXVS Mod Project. Zdroj
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * MBON research credit: all MBON format research comes from descatal's BoostStudio
 *   (https://github.com/descatal/BoostStudio).
 * 저작자 kjjkjjzyayufqza. 제품 EXVS Mod Project. https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * GVS 部分是 kjjkjjzyayufqza 基于本项目 VS2 研究得出的成果。
 * Gemeinsame PS4-Schicht nur fuer MBON und GVS, nicht fuer OB.
 * ................................................
 */

//! Small byte-budget LRU used to keep decoded previews hot between UI clicks.

use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};

/// Thread-safe LRU keyed by string, bounded by total value bytes.
pub struct ByteCache {
    inner: Mutex<Inner>,
    budget: usize,
}

struct Inner {
    map: HashMap<String, Arc<Vec<u8>>>,
    order: VecDeque<String>,
    bytes: usize,
}

impl ByteCache {
    pub fn new(budget: usize) -> Self {
        Self {
            inner: Mutex::new(Inner {
                map: HashMap::new(),
                order: VecDeque::new(),
                bytes: 0,
            }),
            budget,
        }
    }

    pub fn get(&self, key: &str) -> Option<Arc<Vec<u8>>> {
        let mut inner = self.inner.lock().ok()?;
        let value = inner.map.get(key).cloned()?;
        if let Some(position) = inner.order.iter().position(|candidate| candidate == key) {
            let key = inner.order.remove(position).expect("position exists");
            inner.order.push_back(key);
        }
        Some(value)
    }

    pub fn insert(&self, key: String, value: Vec<u8>) -> Arc<Vec<u8>> {
        let value = Arc::new(value);
        let Ok(mut inner) = self.inner.lock() else {
            return value;
        };
        if value.len() > self.budget {
            return value;
        }
        if let Some(previous) = inner.map.insert(key.clone(), value.clone()) {
            inner.bytes -= previous.len();
            inner.order.retain(|candidate| candidate != &key);
        }
        inner.bytes += value.len();
        inner.order.push_back(key);
        while inner.bytes > self.budget {
            let Some(oldest) = inner.order.pop_front() else { break };
            if let Some(evicted) = inner.map.remove(&oldest) {
                inner.bytes -= evicted.len();
            }
        }
        value
    }

    /// Drop every entry whose key starts with `prefix` (e.g. an edited file path).
    pub fn invalidate_prefix(&self, prefix: &str) {
        if let Ok(mut inner) = self.inner.lock() {
            let keys: Vec<String> = inner.map.keys().filter(|key| key.starts_with(prefix)).cloned().collect();
            for key in keys {
                if let Some(removed) = inner.map.remove(&key) {
                    inner.bytes -= removed.len();
                }
                inner.order.retain(|candidate| candidate != &key);
            }
        }
    }
}

/// Cache key that changes whenever the file on disk changes.
pub fn file_key(path: &std::path::Path, suffix: &str) -> String {
    let stamp = std::fs::metadata(path)
        .ok()
        .and_then(|meta| {
            let modified = meta.modified().ok()?;
            let since = modified.duration_since(std::time::UNIX_EPOCH).ok()?;
            Some(format!("{}:{}", meta.len(), since.as_nanos()))
        })
        .unwrap_or_default();
    format!("{}|{stamp}|{suffix}", path.display())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn evicts_least_recent_entries_over_budget() {
        let cache = ByteCache::new(10);
        cache.insert("a".into(), vec![0; 4]);
        cache.insert("b".into(), vec![0; 4]);
        assert!(cache.get("a").is_some());
        cache.insert("c".into(), vec![0; 4]);
        assert!(cache.get("b").is_none(), "b was least recently used");
        assert!(cache.get("a").is_some());
        cache.invalidate_prefix("a");
        assert!(cache.get("a").is_none());
        assert_eq!(cache.insert("huge".into(), vec![0; 64]).len(), 64);
        assert!(cache.get("huge").is_none(), "oversized values are not cached");
    }
}
