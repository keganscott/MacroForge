//! Low-level keyboard / mouse hooks and the foreground-window event, all on
//! one time-critical thread with its own message loop.
//!
//! Windows calls these hooks synchronously for every input event on the PC,
//! so the callbacks do the minimum: translate the struct, ask `Gate`, return.
//! Mouse movement (thousands of events a second on a high-rate mouse) takes
//! a fast path, and the mouse hook is only installed while something needs
//! mouse buttons, so a keyboard-only setup adds nothing to mouse input.

use std::cell::RefCell;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::Instant;

use parking_lot::Mutex;
use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::System::Threading::GetCurrentThreadId;
use windows_sys::Win32::UI::Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetMessageW, PeekMessageW, PostThreadMessageW, SetWindowsHookExW,
    TranslateMessage, UnhookWindowsHookEx, EVENT_SYSTEM_FOREGROUND, HC_ACTION, HHOOK, KBDLLHOOKSTRUCT, LLKHF_INJECTED,
    LLMHF_INJECTED, MSG, MSLLHOOKSTRUCT, PM_NOREMOVE, WH_KEYBOARD_LL, WH_MOUSE_LL, WINEVENT_OUTOFCONTEXT, WM_APP,
    WM_KEYDOWN, WM_LBUTTONDOWN, WM_LBUTTONUP, WM_MBUTTONDOWN, WM_MBUTTONUP, WM_MOUSEHWHEEL, WM_MOUSEMOVE,
    WM_MOUSEWHEEL, WM_QUIT, WM_RBUTTONDOWN, WM_RBUTTONUP, WM_SYSKEYDOWN, WM_XBUTTONDOWN, WM_XBUTTONUP,
};

use crate::engine::{HookHandle, HookInfo};
use crate::gate::{Gate, HookMsg, Origin, Shared, INJECT_TAG};
use crate::input;

const WM_REFRESH: u32 = WM_APP + 1;

struct Ctx {
    gate: Gate,
    shared: Arc<Shared>,
}

thread_local! {
    static CTX: RefCell<Option<Ctx>> = const { RefCell::new(None) };
}

fn origin(injected: bool, extra: usize) -> Origin {
    match (injected, extra == INJECT_TAG) {
        (false, _) => Origin::Physical,
        (true, true) => Origin::Ours,
        (true, false) => Origin::Foreign,
    }
}

unsafe extern "system" fn keyboard_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code == HC_ACTION as i32 {
        let t0 = Instant::now();
        // SAFETY: for HC_ACTION, lparam points at a KBDLLHOOKSTRUCT.
        let k = unsafe { &*(lparam as *const KBDLLHOOKSTRUCT) };
        let down = wparam as u32 == WM_KEYDOWN || wparam as u32 == WM_SYSKEYDOWN;
        let vk = k.vkCode as u16;
        // 0xFF is a "no mapping" placeholder some keyboards send.
        if vk != 0 && vk < 0xFF {
            let o = origin(k.flags & LLKHF_INJECTED != 0, k.dwExtraInfo);
            let swallow = CTX.with(|c| match c.try_borrow_mut() {
                Ok(mut c) => match c.as_mut() {
                    Some(c) => {
                        let s = c.gate.on_input(&c.shared, vk, down, o);
                        c.shared.note_cost(t0.elapsed().as_nanos() as u64);
                        s
                    }
                    None => false,
                },
                Err(_) => false,
            });
            if swallow {
                return 1;
            }
        }
    }
    // SAFETY: passing the event on, as required.
    unsafe { CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam) }
}

unsafe extern "system" fn mouse_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code == HC_ACTION as i32 {
        let msg = wparam as u32;
        // SAFETY: for HC_ACTION, lparam points at an MSLLHOOKSTRUCT.
        let m = unsafe { &*(lparam as *const MSLLHOOKSTRUCT) };
        let o = origin(m.flags & LLMHF_INJECTED != 0, m.dwExtraInfo);
        if msg == WM_MOUSEMOVE {
            // Fast path: only the recorder cares about movement.
            CTX.with(|c| {
                if let Ok(mut c) = c.try_borrow_mut() {
                    if let Some(c) = c.as_mut() {
                        if c.shared.recording.load(Ordering::Relaxed) {
                            c.gate.on_move(&c.shared, m.pt.x, m.pt.y, o);
                        }
                    }
                }
            });
        } else {
            let t0 = Instant::now();
            let hi = (m.mouseData >> 16) as u16;
            let ev = match msg {
                WM_LBUTTONDOWN => Some((input::MOUSE_LEFT, true)),
                WM_LBUTTONUP => Some((input::MOUSE_LEFT, false)),
                WM_RBUTTONDOWN => Some((input::MOUSE_RIGHT, true)),
                WM_RBUTTONUP => Some((input::MOUSE_RIGHT, false)),
                WM_MBUTTONDOWN => Some((input::MOUSE_MIDDLE, true)),
                WM_MBUTTONUP => Some((input::MOUSE_MIDDLE, false)),
                WM_XBUTTONDOWN | WM_XBUTTONUP => {
                    let b = if hi == 2 { input::MOUSE_X2 } else { input::MOUSE_X1 };
                    Some((b, msg == WM_XBUTTONDOWN))
                }
                WM_MOUSEWHEEL => Some((if (hi as i16) > 0 { input::WHEEL_UP } else { input::WHEEL_DOWN }, true)),
                WM_MOUSEHWHEEL => Some((if (hi as i16) > 0 { input::WHEEL_RIGHT } else { input::WHEEL_LEFT }, true)),
                _ => None,
            };
            if let Some((code_, down)) = ev {
                let swallow = CTX.with(|c| match c.try_borrow_mut() {
                    Ok(mut c) => match c.as_mut() {
                        Some(c) => {
                            let s = c.gate.on_input(&c.shared, code_, down, o);
                            c.shared.note_cost(t0.elapsed().as_nanos() as u64);
                            s
                        }
                        None => false,
                    },
                    Err(_) => false,
                });
                if swallow {
                    return 1;
                }
            }
        }
    }
    // SAFETY: passing the event on, as required.
    unsafe { CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam) }
}

unsafe extern "system" fn foreground_proc(
    _hook: HWINEVENTHOOK,
    _event: u32,
    hwnd: HWND,
    _obj: i32,
    _child: i32,
    _thread: u32,
    _time: u32,
) {
    CTX.with(|c| {
        if let Ok(c) = c.try_borrow() {
            if let Some(c) = c.as_ref() {
                let _ = c.shared.tx.send(HookMsg::Foreground(hwnd as isize));
            }
        }
    });
}

pub struct HookThread {
    thread_id: u32,
    info: Arc<Mutex<HookInfo>>,
    join: Option<JoinHandle<()>>,
}

impl HookThread {
    pub fn start(shared: Arc<Shared>) -> HookThread {
        let info = Arc::new(Mutex::new(HookInfo::default()));
        let (tx, rx) = crossbeam_channel::bounded(1);
        let info2 = info.clone();
        let join = std::thread::Builder::new()
            .name("macroforge-hook".into())
            .spawn(move || run(shared, info2, tx))
            .expect("spawn hook thread");
        let thread_id = rx.recv().unwrap_or(0);
        HookThread { thread_id, info, join: Some(join) }
    }
}

impl HookHandle for HookThread {
    fn refresh(&self) {
        // SAFETY: posting to our own hook thread's queue.
        unsafe { PostThreadMessageW(self.thread_id, WM_REFRESH, 0, 0) };
    }

    fn info(&self) -> HookInfo {
        self.info.lock().clone()
    }

    fn stop(mut self: Box<Self>) {
        // SAFETY: as above.
        unsafe { PostThreadMessageW(self.thread_id, WM_QUIT, 0, 0) };
        if let Some(j) = self.join.take() {
            let _ = j.join();
        }
    }
}

fn run(shared: Arc<Shared>, info: Arc<Mutex<HookInfo>>, ready: crossbeam_channel::Sender<u32>) {
    super::sys::raise_thread_priority(true);
    // SAFETY: Win32 calls on this thread; handles released before return.
    unsafe {
        let mut msg: MSG = std::mem::zeroed();
        // Create this thread's message queue before anyone posts to it.
        PeekMessageW(&mut msg, std::ptr::null_mut(), 0, 0, PM_NOREMOVE);
        let _ = ready.send(GetCurrentThreadId());

        CTX.with(|c| *c.borrow_mut() = Some(Ctx { gate: Gate::default(), shared: shared.clone() }));
        let module = GetModuleHandleW(std::ptr::null());
        let kb: HHOOK = SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_proc), module, 0);
        let mut ms: HHOOK = std::ptr::null_mut();
        let fg = SetWinEventHook(
            EVENT_SYSTEM_FOREGROUND,
            EVENT_SYSTEM_FOREGROUND,
            std::ptr::null_mut(),
            Some(foreground_proc),
            0,
            0,
            WINEVENT_OUTOFCONTEXT,
        );
        let update = |ms: &mut HHOOK| {
            let want = shared.wants_mouse();
            if want && ms.is_null() {
                *ms = SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_proc), module, 0);
            } else if !want && !ms.is_null() {
                UnhookWindowsHookEx(*ms);
                *ms = std::ptr::null_mut();
            }
            *info.lock() = HookInfo { keyboard: !kb.is_null(), mouse: !ms.is_null() };
        };
        update(&mut ms);
        let _ = shared.tx.send(HookMsg::Foreground(0));

        loop {
            let r = GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0);
            if r == 0 || r == -1 {
                break;
            }
            if msg.hwnd.is_null() && msg.message == WM_REFRESH {
                update(&mut ms);
                continue;
            }
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }

        if !ms.is_null() {
            UnhookWindowsHookEx(ms);
        }
        if !kb.is_null() {
            UnhookWindowsHookEx(kb);
        }
        if !fg.is_null() {
            UnhookWinEvent(fg);
        }
        CTX.with(|c| *c.borrow_mut() = None);
        *info.lock() = HookInfo::default();
    }
}
