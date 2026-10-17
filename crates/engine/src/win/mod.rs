//! Windows platform layer: hooks, SendInput, timers, foreground app.

pub mod hook;
pub mod send;
pub mod sys;
pub mod timer;

use std::sync::Arc;

use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
use windows_sys::Win32::System::Threading::{CreateEventW, ResetEvent, SetEvent};

use crate::engine::{Foreground, HookHandle, Platform};
use crate::gate::Shared;
use crate::model::TimingMode;
use crate::runner::Output;
use crate::timing::Waiter;

/// A manual-reset Win32 event (used to wake a waiting run instantly on stop).
pub struct Event(pub(crate) HANDLE);

// SAFETY: an event handle may be used from any thread.
unsafe impl Send for Event {}
unsafe impl Sync for Event {}

impl Event {
    pub fn new() -> Self {
        // SAFETY: plain unnamed manual-reset event, initially unsignalled.
        Event(unsafe { CreateEventW(std::ptr::null(), 1, 0, std::ptr::null()) })
    }
    pub fn set(&self) {
        // SAFETY: valid handle owned by self.
        unsafe { SetEvent(self.0) };
    }
    pub fn reset(&self) {
        // SAFETY: valid handle owned by self.
        unsafe { ResetEvent(self.0) };
    }
}

impl Default for Event {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for Event {
    fn drop(&mut self) {
        if !self.0.is_null() {
            // SAFETY: we own the handle.
            unsafe { CloseHandle(self.0) };
        }
    }
}

pub struct WinPlatform {
    out: Arc<send::SendOutput>,
    elevated: bool,
}

impl WinPlatform {
    pub fn new() -> Self {
        WinPlatform { out: Arc::new(send::SendOutput::default()), elevated: sys::self_elevated() }
    }
}

impl Default for WinPlatform {
    fn default() -> Self {
        Self::new()
    }
}

impl Platform for WinPlatform {
    fn output(&self) -> Arc<dyn Output> {
        self.out.clone()
    }

    fn waiter(&self, timing: TimingMode) -> Box<dyn Waiter> {
        Box::new(timer::HiResWaiter::new(timing))
    }

    fn worker_setup(&self) {
        sys::raise_thread_priority(false);
    }

    fn foreground(&self, hwnd: isize) -> Foreground {
        sys::foreground(hwnd)
    }

    fn start_hook(&self, shared: Arc<Shared>) -> Box<dyn HookHandle> {
        Box::new(hook::HookThread::start(shared))
    }

    fn self_elevated(&self) -> bool {
        self.elevated
    }

    fn send_failures(&self) -> u64 {
        self.out.failures()
    }
}
