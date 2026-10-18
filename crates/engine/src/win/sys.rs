//! Small Win32 helpers: thread priority, the app in front, elevation,
//! start-with-Windows.

use windows_sys::Win32::Foundation::{CloseHandle, HANDLE, HWND};
use windows_sys::Win32::Security::{GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY};
use windows_sys::Win32::System::Registry::{
    RegCloseKey, RegDeleteValueW, RegOpenKeyExW, RegQueryValueExW, RegSetValueExW, HKEY, HKEY_CURRENT_USER,
    KEY_QUERY_VALUE, KEY_SET_VALUE, REG_SZ,
};
use windows_sys::Win32::System::Threading::{
    GetCurrentProcess, GetCurrentProcessId, GetCurrentThread, OpenProcess, OpenProcessToken,
    QueryFullProcessImageNameW, SetThreadPriority, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
    THREAD_PRIORITY_HIGHEST, THREAD_PRIORITY_TIME_CRITICAL,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

use crate::engine::Foreground;

pub fn raise_thread_priority(critical: bool) {
    let p = if critical { THREAD_PRIORITY_TIME_CRITICAL } else { THREAD_PRIORITY_HIGHEST };
    // SAFETY: pseudo-handle of the calling thread.
    unsafe { SetThreadPriority(GetCurrentThread(), p) };
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn token_elevated(process: HANDLE) -> Option<bool> {
    let mut token: HANDLE = std::ptr::null_mut();
    // SAFETY: valid process handle; token closed below.
    unsafe {
        if OpenProcessToken(process, TOKEN_QUERY, &mut token) == 0 {
            return None;
        }
        let mut e = TOKEN_ELEVATION { TokenIsElevated: 0 };
        let mut len = 0u32;
        let ok = GetTokenInformation(
            token,
            TokenElevation,
            &mut e as *mut _ as *mut _,
            std::mem::size_of::<TOKEN_ELEVATION>() as u32,
            &mut len,
        );
        CloseHandle(token);
        (ok != 0).then_some(e.TokenIsElevated != 0)
    }
}

pub fn self_elevated() -> bool {
    // SAFETY: pseudo-handle of this process.
    token_elevated(unsafe { GetCurrentProcess() }).unwrap_or(false)
}

/// The app that owns `hwnd` (0: whatever window is in front now). Reads only
/// the process's file name and whether it is elevated, nothing inside it.
pub fn foreground(hwnd: isize) -> Foreground {
    // SAFETY: plain queries on a window handle; a stale handle just fails.
    unsafe {
        let hwnd: HWND = if hwnd == 0 { GetForegroundWindow() } else { hwnd as HWND };
        if hwnd.is_null() {
            return Foreground::default();
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == 0 {
            return Foreground::default();
        }
        if pid == GetCurrentProcessId() {
            return Foreground { exe: None, own: true, elevated: Some(self_elevated()) };
        }
        let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if h.is_null() {
            // Protected or system process; not something MacroForge acts in.
            return Foreground { exe: None, own: false, elevated: None };
        }
        let mut buf = [0u16; 1024];
        let mut len = buf.len() as u32;
        let exe = if QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, buf.as_mut_ptr(), &mut len) != 0 {
            let path = String::from_utf16_lossy(&buf[..len as usize]);
            path.rsplit(['\\', '/']).next().map(|s| s.to_ascii_lowercase())
        } else {
            None
        };
        // From a normal process an elevated one's token cannot be opened, so
        // "could not tell" here usually means "elevated".
        let elevated = token_elevated(h);
        CloseHandle(h);
        Foreground { exe, own: false, elevated }
    }
}

const RUN_KEY: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const RUN_VALUE: &str = "MacroForge";

fn open_run(access: u32) -> Option<HKEY> {
    let mut key: HKEY = std::ptr::null_mut();
    // SAFETY: opening the current user's own Run key.
    let r = unsafe { RegOpenKeyExW(HKEY_CURRENT_USER, wide(RUN_KEY).as_ptr(), 0, access, &mut key) };
    (r == 0).then_some(key)
}

/// Start with Windows: only this user's Run key (HKCU), removed when turned off.
pub fn set_autostart(command: Option<&str>) -> Result<(), String> {
    let key = open_run(KEY_SET_VALUE).ok_or("could not open the Run key")?;
    // SAFETY: key is open; strings are NUL-terminated wide strings.
    let r = unsafe {
        match command {
            Some(cmd) => {
                let data = wide(cmd);
                RegSetValueExW(key, wide(RUN_VALUE).as_ptr(), 0, REG_SZ, data.as_ptr() as *const u8, (data.len() * 2) as u32)
            }
            None => {
                let r = RegDeleteValueW(key, wide(RUN_VALUE).as_ptr());
                if r == 2 {
                    0 // already absent
                } else {
                    r
                }
            }
        }
    };
    unsafe { RegCloseKey(key) };
    if r == 0 {
        Ok(())
    } else {
        Err(format!("registry error {r}"))
    }
}

pub fn autostart_enabled() -> bool {
    let Some(key) = open_run(KEY_QUERY_VALUE) else { return false };
    // SAFETY: size-only query on an open key.
    let r = unsafe {
        RegQueryValueExW(key, wide(RUN_VALUE).as_ptr(), std::ptr::null(), std::ptr::null_mut(), std::ptr::null_mut(), std::ptr::null_mut())
    };
    unsafe { RegCloseKey(key) };
    r == 0
}

/// Apps with a normal top-level window right now (for picking a game).
/// Returns (exe, window title), one per exe, MacroForge itself left out.
pub fn window_apps() -> Vec<(String, String)> {
    use windows_sys::Win32::Foundation::{LPARAM, TRUE};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindow, GetWindowLongPtrW, GetWindowTextLengthW, GetWindowTextW, IsWindowVisible,
        GWL_EXSTYLE, GW_OWNER, WS_EX_TOOLWINDOW,
    };

    unsafe extern "system" fn collect(hwnd: HWND, lparam: LPARAM) -> windows_sys::core::BOOL {
        // SAFETY: lparam is the Vec passed below; hwnd comes from EnumWindows.
        unsafe {
            let list = &mut *(lparam as *mut Vec<HWND>);
            if IsWindowVisible(hwnd) != 0
                && GetWindow(hwnd, GW_OWNER).is_null()
                && GetWindowTextLengthW(hwnd) > 0
                && (GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32 & WS_EX_TOOLWINDOW) == 0
            {
                list.push(hwnd);
            }
        }
        TRUE
    }

    let mut hwnds: Vec<HWND> = Vec::new();
    // SAFETY: the callback only touches `hwnds` for the duration of the call.
    unsafe { EnumWindows(Some(collect), &mut hwnds as *mut _ as LPARAM) };
    let mut out: Vec<(String, String)> = Vec::new();
    for h in hwnds {
        let fg = foreground(h as isize);
        let Some(exe) = fg.exe else { continue };
        if fg.own || out.iter().any(|(e, _)| *e == exe) {
            continue;
        }
        let mut buf = [0u16; 256];
        // SAFETY: buffer length passed.
        let n = unsafe { GetWindowTextW(h, buf.as_mut_ptr(), buf.len() as i32) };
        out.push((exe, String::from_utf16_lossy(&buf[..n.max(0) as usize])));
    }
    out.sort();
    out
}

/// Is the mouse cursor showing right now? Games hide it during gameplay and
/// show it in the inventory, map and menus, which is what "Pause in menus"
/// keys off. Treated as hidden: no cursor, a null cursor image (how many
/// games hide it), or a cursor pinned to a tiny clip rectangle (mouse-look).
/// One quick user32 call, made only for bindings that use it.
pub fn cursor_visible() -> bool {
    use windows_sys::Win32::Foundation::RECT;
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetClipCursor, GetCursorInfo, CURSORINFO, CURSOR_SHOWING};
    // SAFETY: plain queries into local structs.
    unsafe {
        let mut ci: CURSORINFO = std::mem::zeroed();
        ci.cbSize = std::mem::size_of::<CURSORINFO>() as u32;
        if GetCursorInfo(&mut ci) == 0 || ci.flags & CURSOR_SHOWING == 0 || ci.hCursor.is_null() {
            return false;
        }
        let mut r: RECT = std::mem::zeroed();
        if GetClipCursor(&mut r) != 0 && (r.right - r.left <= 4 || r.bottom - r.top <= 4) {
            return false;
        }
        true
    }
}
