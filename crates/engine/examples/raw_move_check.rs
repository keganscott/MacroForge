//! Do games get MacroForge's mouse movement exactly? Games read raw input,
//! so this listens to raw input like a game (only injected events, so a
//! hand on the mouse does not count) while MacroForge sends known moves,
//! instant and smoothed. Every move is undone by its opposite.
//!
//!   cargo run -p macroforge-engine --example raw_move_check --release

#[cfg(windows)]
fn main() {
    use std::sync::atomic::{AtomicI64, Ordering};
    use std::sync::Arc;
    use std::time::Duration;

    use macroforge_engine::model::Step;
    use macroforge_engine::runner::{run_macro, Ctx, Loop, Output};
    use macroforge_engine::timing::{now_ms, Cancel, Rng};
    use macroforge_engine::win::{send::SendOutput, timer::HiResWaiter};
    use windows_sys::Win32::UI::Input::*;
    use windows_sys::Win32::UI::WindowsAndMessaging::*;

    static SUM: AtomicI64 = AtomicI64::new(0);
    static PACKETS: AtomicI64 = AtomicI64::new(0);

    unsafe extern "system" fn proc_(h: windows_sys::Win32::Foundation::HWND, m: u32, w: usize, l: isize) -> isize {
        if m == WM_INPUT {
            let mut buf = [0u8; 256];
            let mut size = buf.len() as u32;
            let n = unsafe {
                GetRawInputData(l as HRAWINPUT, RID_INPUT, buf.as_mut_ptr() as *mut _, &mut size, std::mem::size_of::<RAWINPUTHEADER>() as u32)
            };
            if n != u32::MAX {
                let ri = unsafe { &*(buf.as_ptr() as *const RAWINPUT) };
                // Injected input arrives with no device handle.
                if ri.header.dwType == RIM_TYPEMOUSE && ri.header.hDevice.is_null() {
                    let mouse = unsafe { ri.data.mouse };
                    if mouse.usFlags & 1 == 0 {
                        SUM.fetch_add(mouse.lLastX as i64, Ordering::SeqCst);
                        PACKETS.fetch_add(1, Ordering::SeqCst);
                    }
                }
            }
        }
        unsafe { DefWindowProcW(h, m, w, l) }
    }

    std::thread::spawn(|| unsafe {
        let class: Vec<u16> = "MfRawCheck\0".encode_utf16().collect();
        let wc = WNDCLASSW { lpfnWndProc: Some(proc_), lpszClassName: class.as_ptr(), ..std::mem::zeroed() };
        RegisterClassW(&wc);
        let hwnd = CreateWindowExW(0, class.as_ptr(), class.as_ptr(), 0, 0, 0, 0, 0, HWND_MESSAGE, std::ptr::null_mut(), std::ptr::null_mut(), std::ptr::null());
        let dev = RAWINPUTDEVICE { usUsagePage: 1, usUsage: 2, dwFlags: RIDEV_INPUTSINK, hwndTarget: hwnd };
        RegisterRawInputDevices(&dev, 1, std::mem::size_of::<RAWINPUTDEVICE>() as u32);
        let mut msg: MSG = std::mem::zeroed();
        while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {
            DispatchMessageW(&msg);
        }
    });
    std::thread::sleep(Duration::from_millis(300));

    // Windows pointer settings this ran with (they move the desktop cursor,
    // and must NOT change what raw input reports).
    unsafe {
        let mut accel = [0i32; 3];
        let mut speed = 0i32;
        SystemParametersInfoW(SPI_GETMOUSE, 0, accel.as_mut_ptr() as *mut _, 0);
        SystemParametersInfoW(SPI_GETMOUSESPEED, 0, &mut speed as *mut i32 as *mut _, 0);
        println!("Windows pointer speed {speed}/20, enhance pointer precision {}", if accel[2] != 0 { "ON" } else { "off" });
    }

    let out = SendOutput::default();
    let mut ok = true;
    let mut measure = |label: &str, expect: i64, f: &dyn Fn()| {
        let before = SUM.load(Ordering::SeqCst);
        let p0 = PACKETS.load(Ordering::SeqCst);
        f();
        std::thread::sleep(Duration::from_millis(150));
        let got = SUM.load(Ordering::SeqCst) - before;
        let packets = PACKETS.load(Ordering::SeqCst) - p0;
        let pass = got == expect;
        ok &= pass;
        println!("{} {label:<36} sent {expect:>7}  game saw {got:>7}  ({packets} packets)", if pass { "PASS" } else { "FAIL" });
    };
    for n in [1i64, 37, 1000, 4091, 13_000] {
        measure(&format!("instant move {n}"), n, &|| out.move_rel(n as i32, 0));
        measure(&format!("instant move back -{n}"), -n, &|| out.move_rel(-(n as i32), 0));
    }
    let smooth = |dx: i32, ms: f64| {
        let c = Cancel::new();
        let mut w = HiResWaiter::new(macroforge_engine::model::TimingMode::Precise);
        let mut cx = Ctx { waiter: &mut w, cancel: &c, rng: Rng::new(1), t: now_ms() };
        run_macro(&[Step::Move { dx, dy: 0, duration_ms: ms }], Loop::Times(1), &out as &dyn Output, &mut cx, &|| true);
    };
    measure("smooth 4091 over 60 ms (macro step)", 4091, &|| smooth(4091, 60.0));
    measure("smooth back over 60 ms", -4091, &|| smooth(-4091, 60.0));
    measure("smooth 12345 over 150 ms", 12345, &|| smooth(12345, 150.0));
    measure("smooth back over 150 ms", -12345, &|| smooth(-12345, 150.0));
    let _ = Arc::new(());
    println!("{}", if ok { "RAW MOVE CHECK PASSED" } else { "RAW MOVE CHECK FAILED" });
    std::process::exit(if ok { 0 } else { 1 });
}

#[cfg(not(windows))]
fn main() {}
