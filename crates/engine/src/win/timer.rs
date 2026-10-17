//! Precise waits. A high-resolution waitable timer (Windows 10 1803+,
//! ~0.5 ms, no global `timeBeginPeriod`) sleeps until just before the
//! deadline; Precise mode then spins the last stretch on the performance
//! counter. Every wait also watches the run's stop event, so stopping is
//! instant even mid-delay.

use windows_sys::Win32::Foundation::{CloseHandle, HANDLE, WAIT_OBJECT_0};
use windows_sys::Win32::System::Threading::{
    CreateWaitableTimerExW, SetWaitableTimer, WaitForMultipleObjects, CREATE_WAITABLE_TIMER_HIGH_RESOLUTION,
    INFINITE, TIMER_ALL_ACCESS,
};

use crate::model::TimingMode;
use crate::timing::{now_ms, Cancel, Waiter};

pub struct HiResWaiter {
    timer: HANDLE,
    spin_ms: f64,
    pub high_res: bool,
}

// SAFETY: the timer handle is used only by the thread that owns the waiter.
unsafe impl Send for HiResWaiter {}

impl HiResWaiter {
    pub fn new(mode: TimingMode) -> Self {
        // SAFETY: creating an unnamed timer; null on failure is handled.
        let mut timer = unsafe {
            CreateWaitableTimerExW(std::ptr::null(), std::ptr::null(), CREATE_WAITABLE_TIMER_HIGH_RESOLUTION, TIMER_ALL_ACCESS)
        };
        let high_res = !timer.is_null();
        if timer.is_null() {
            // Older Windows: a normal timer (coarser), so spin longer.
            timer = unsafe { CreateWaitableTimerExW(std::ptr::null(), std::ptr::null(), 0, TIMER_ALL_ACCESS) };
        }
        let spin_ms = match (mode, high_res) {
            (TimingMode::Efficient, _) => 0.0,
            (TimingMode::Precise, true) => 0.8,
            (TimingMode::Precise, false) => 2.0,
        };
        HiResWaiter { timer, spin_ms, high_res }
    }
}

impl Drop for HiResWaiter {
    fn drop(&mut self) {
        if !self.timer.is_null() {
            // SAFETY: we own the handle.
            unsafe { CloseHandle(self.timer) };
        }
    }
}

impl Waiter for HiResWaiter {
    fn wait_until(&mut self, deadline_ms: f64, cancel: &Cancel) -> bool {
        loop {
            if cancel.is_stopped() {
                return true;
            }
            let left = deadline_ms - now_ms();
            if left <= 0.0 {
                return false;
            }
            if left > self.spin_ms && !self.timer.is_null() {
                let sleep = if self.spin_ms > 0.0 { left - self.spin_ms } else { left };
                // Relative due time, in 100 ns units, negative.
                let due: i64 = -((sleep * 10_000.0).max(1.0) as i64);
                let handles = [self.timer, cancel.event().0];
                // SAFETY: both handles are valid for the duration of the call.
                let r = unsafe {
                    SetWaitableTimer(self.timer, &due, 0, None, std::ptr::null(), 0);
                    WaitForMultipleObjects(2, handles.as_ptr(), 0, INFINITE)
                };
                if r == WAIT_OBJECT_0 + 1 {
                    return true;
                }
                if self.spin_ms <= 0.0 {
                    return cancel.is_stopped();
                }
            } else {
                while now_ms() < deadline_ms {
                    if cancel.is_stopped() {
                        return true;
                    }
                    std::hint::spin_loop();
                }
                return false;
            }
        }
    }
}
