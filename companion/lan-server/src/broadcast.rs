use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

#[derive(Debug, Clone)]
pub struct BroadcastSnapshot {
    pub sequence: u64,
    pub listener_count: usize,
    pub state_json: String,
}

struct HubInner {
    sequence: u64,
    listener_count: usize,
    state_json: String,
    closed: bool,
}

/// Thread-safe Listening Party SSE broadcast hub with RAII listener counting and immediate condvar wakeup.
#[derive(Clone)]
pub struct BroadcastHub {
    inner: Arc<(Mutex<HubInner>, Condvar)>,
}

pub struct ListenerGuard {
    hub: BroadcastHub,
}

impl Drop for ListenerGuard {
    fn drop(&mut self) {
        self.hub.decrement_listener();
    }
}

impl Default for BroadcastHub {
    fn default() -> Self {
        Self::new()
    }
}

impl BroadcastHub {
    pub fn new() -> Self {
        Self {
            inner: Arc::new((
                Mutex::new(HubInner {
                    sequence: 0,
                    listener_count: 0,
                    state_json: r#"{"status":"stopped","track":null,"positionSeconds":0,"playbackRate":1,"listenerCount":0,"sequence":0}"#.to_string(),
                    closed: false,
                }),
                Condvar::new(),
            )),
        }
    }

    pub fn register_listener(&self) -> ListenerGuard {
        let (lock, cvar) = &*self.inner;
        if let Ok(mut guard) = lock.lock() {
            guard.listener_count += 1;
            guard.sequence += 1;
            cvar.notify_all();
        }
        ListenerGuard { hub: self.clone() }
    }

    fn decrement_listener(&self) {
        let (lock, cvar) = &*self.inner;
        if let Ok(mut guard) = lock.lock() {
            guard.listener_count = guard.listener_count.saturating_sub(1);
            guard.sequence += 1;
            cvar.notify_all();
        }
    }

    pub fn update_state(&self, raw_json: &str) -> BroadcastSnapshot {
        let (lock, cvar) = &*self.inner;
        let mut guard = lock.lock().unwrap();
        guard.sequence += 1;
        guard.state_json = raw_json.trim().to_string();
        let snap = BroadcastSnapshot {
            sequence: guard.sequence,
            listener_count: guard.listener_count,
            state_json: inject_listener_count(&guard.state_json, guard.listener_count, guard.sequence),
        };
        cvar.notify_all();
        snap
    }

    pub fn current_snapshot(&self) -> BroadcastSnapshot {
        let (lock, _) = &*self.inner;
        let guard = lock.lock().unwrap();
        BroadcastSnapshot {
            sequence: guard.sequence,
            listener_count: guard.listener_count,
            state_json: inject_listener_count(&guard.state_json, guard.listener_count, guard.sequence),
        }
    }

    /// Waits up to `timeout` for a sequence newer than `last_seq`, returning `None` if closed or unchanged.
    pub fn wait_for_update(&self, last_seq: u64, timeout: Duration) -> Option<BroadcastSnapshot> {
        let (lock, cvar) = &*self.inner;
        let guard = lock.lock().unwrap();
        if guard.closed {
            return None;
        }
        if guard.sequence > last_seq {
            return Some(BroadcastSnapshot {
                sequence: guard.sequence,
                listener_count: guard.listener_count,
                state_json: inject_listener_count(&guard.state_json, guard.listener_count, guard.sequence),
            });
        }
        let (next_guard, _) = cvar.wait_timeout(guard, timeout).unwrap();
        if next_guard.closed || next_guard.sequence <= last_seq {
            return None;
        }
        Some(BroadcastSnapshot {
            sequence: next_guard.sequence,
            listener_count: next_guard.listener_count,
            state_json: inject_listener_count(&next_guard.state_json, next_guard.listener_count, next_guard.sequence),
        })
    }

    pub fn close(&self) {
        let (lock, cvar) = &*self.inner;
        if let Ok(mut guard) = lock.lock() {
            guard.closed = true;
            cvar.notify_all();
        }
    }

    pub fn is_closed(&self) -> bool {
        let (lock, _) = &*self.inner;
        lock.lock().map(|g| g.closed).unwrap_or(true)
    }
}

/// Produces an SSE `sync` event frame ready to write to a `text/event-stream` socket.
pub fn format_sse_sync_frame(snap: &BroadcastSnapshot) -> String {
    format!(
        "id: {}\nevent: sync\ndata: {}\n\n",
        snap.sequence, snap.state_json
    )
}

fn inject_listener_count(json: &str, count: usize, seq: u64) -> String {
    let trimmed = json.trim();
    if let Some(body) = trimmed.strip_suffix('}') {
        // Strip any trailing listenerCount/sequence we don't want duplicated by wrapping cleanly
        if body.contains("\"listenerCount\"") {
            return replace_numeric_field(
                &replace_numeric_field(trimmed, "listenerCount", count as u64),
                "sequence",
                seq,
            );
        }
        return format!("{body},\"listenerCount\":{count},\"sequence\":{seq}}}");
    }
    format!(r#"{{"listenerCount":{count},"sequence":{seq}}}"#)
}

fn replace_numeric_field(json: &str, key: &str, new_value: u64) -> String {
    let needle = format!(r#""{key}":"#);
    let Some(start) = json.find(&needle) else {
        return json.to_string();
    };
    let val_start = start + needle.len();
    let bytes = json.as_bytes();
    let mut val_end = val_start;
    while val_end < bytes.len() && bytes[val_end].is_ascii_digit() {
        val_end += 1;
    }
    format!("{}{}{}", &json[..val_start], new_value, &json[val_end..])
}
