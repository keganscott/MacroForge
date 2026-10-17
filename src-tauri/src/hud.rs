//! The on-screen notice ("Auto-clicker · ON"), drawn natively.
//!
//! It used to be a second WebView window, which kept a whole browser
//! renderer process alive to show a line of text for 1.6 s now and then.
//! This is one small layered Win32 window on its own thread: shapes are
//! drawn with signed-distance anti-aliasing into a premultiplied BGRA
//! buffer, text with GDI (grayscale) into a mask, and the result handed to
//! UpdateLayeredWindow. It is click-through, never activates, and stays off
//! Alt+Tab, so showing it can never pull a game out of the foreground.

use std::sync::mpsc::{channel, Sender};
use std::sync::Mutex;

use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, RECT, SIZE, WPARAM};
use windows_sys::Win32::Graphics::Gdi::{
    CreateCompatibleDC, CreateDIBSection, CreateFontW, DeleteDC, DeleteObject, DrawTextW, GetDC, GetMonitorInfoW,
    GetTextExtentPoint32W, MonitorFromWindow, ReleaseDC, SelectObject, SetBkMode, SetTextColor, AC_SRC_ALPHA,
    AC_SRC_OVER, ANTIALIASED_QUALITY, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, BLENDFUNCTION, CLIP_DEFAULT_PRECIS,
    DEFAULT_CHARSET, DEFAULT_PITCH, DIB_RGB_COLORS, DT_NOPREFIX, DT_SINGLELINE, FW_BOLD, FW_EXTRABOLD, HDC, HFONT,
    HGDIOBJ, MONITORINFO, MONITOR_DEFAULTTOPRIMARY, OUT_TT_PRECIS, TRANSPARENT,
};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::System::Threading::GetCurrentThreadId;
use windows_sys::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DispatchMessageW, GetForegroundWindow, GetMessageW, KillTimer, PostThreadMessageW,
    RegisterClassW, SetTimer, SetWindowPos, ShowWindow, TranslateMessage, UpdateLayeredWindow, HWND_TOPMOST, MSG,
    SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SW_HIDE, SW_SHOWNOACTIVATE, ULW_ALPHA, WM_APP, WM_TIMER, WNDCLASSW,
    WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_EX_TRANSPARENT, WS_POPUP,
};

use macroforge_engine::model::HudPosition;

const WM_SHOW: u32 = WM_APP + 7;
const TIMER_FADE: usize = 1;
const SHOW_MS: u32 = 1500;

pub struct Notice {
    pub text: String,
    pub on: bool,
    pub pos: HudPosition,
    pub accent: (u8, u8, u8),
}

/// The HUD thread: started on first use, then parked in its message loop.
pub struct Hud {
    thread_id: u32,
    queue: Sender<Notice>,
}

static HUD: Mutex<Option<Hud>> = Mutex::new(None);

pub fn show(n: Notice) {
    let mut hud = HUD.lock().unwrap_or_else(|e| e.into_inner());
    if hud.is_none() {
        *hud = start();
    }
    if let Some(h) = hud.as_ref() {
        if h.queue.send(n).is_ok() {
            // SAFETY: posting to our own HUD thread.
            unsafe { PostThreadMessageW(h.thread_id, WM_SHOW, 0, 0) };
        }
    }
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

unsafe extern "system" fn wndproc(h: HWND, m: u32, w: WPARAM, l: LPARAM) -> LRESULT {
    // SAFETY: default handling for everything this window does not use.
    unsafe { DefWindowProcW(h, m, w, l) }
}

fn start() -> Option<Hud> {
    let (tx, rx) = channel::<Notice>();
    let (ready_tx, ready_rx) = channel::<u32>();
    std::thread::Builder::new()
        .name("macroforge-hud".into())
        .spawn(move || {
            // SAFETY: a window owned and used only by this thread.
            unsafe {
                let module = GetModuleHandleW(std::ptr::null());
                let class = wide("MacroForgeHud");
                let wc = WNDCLASSW {
                    lpfnWndProc: Some(wndproc),
                    hInstance: module,
                    lpszClassName: class.as_ptr(),
                    ..std::mem::zeroed()
                };
                RegisterClassW(&wc);
                let hwnd = CreateWindowExW(
                    WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
                    class.as_ptr(),
                    wide("MacroForge notice").as_ptr(),
                    WS_POPUP,
                    0,
                    0,
                    1,
                    1,
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    module,
                    std::ptr::null(),
                );
                let _ = ready_tx.send(GetCurrentThreadId());
                if hwnd.is_null() {
                    return;
                }
                let mut frame: Option<Frame> = None;
                // 0..=255 fade level, and +1 / -1 / 0 direction.
                let (mut alpha, mut dir, mut hold_until) = (0i32, 0i32, 0u64);
                let mut msg: MSG = std::mem::zeroed();
                while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {
                    if msg.hwnd.is_null() && msg.message == WM_SHOW {
                        // Only the newest notice matters.
                        let mut latest = None;
                        while let Ok(n) = rx.try_recv() {
                            latest = Some(n);
                        }
                        if let Some(n) = latest {
                            let mut f = render(&n);
                            place(&mut f, &n.pos);
                            frame = Some(f);
                            dir = 1;
                            hold_until = now_ms() + SHOW_MS as u64;
                            SetTimer(hwnd, TIMER_FADE, 16, None);
                            ShowWindow(hwnd, SW_SHOWNOACTIVATE);
                            SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
                        }
                        continue;
                    }
                    if msg.message == WM_TIMER && msg.hwnd == hwnd {
                        // A short fade in, a hold, a short fade out; then the
                        // timer stops, so an idle HUD costs nothing.
                        if dir > 0 {
                            alpha = (alpha + 64).min(255);
                            if alpha == 255 {
                                dir = 0;
                            }
                        } else if dir == 0 && now_ms() >= hold_until {
                            dir = -1;
                        } else if dir < 0 {
                            alpha = (alpha - 40).max(0);
                        }
                        if let Some(f) = &frame {
                            blit(hwnd, f, alpha as u8);
                        }
                        if dir < 0 && alpha == 0 {
                            KillTimer(hwnd, TIMER_FADE);
                            ShowWindow(hwnd, SW_HIDE);
                            frame = None;
                            dir = 0;
                        }
                        continue;
                    }
                    TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }
            }
        })
        .ok()?;
    let thread_id = ready_rx.recv().ok()?;
    Some(Hud { thread_id, queue: tx })
}

fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

// ---------------------------------------------------------------- drawing --

struct Frame {
    w: i32,
    h: i32,
    /// Premultiplied BGRA, top-down.
    px: Vec<u8>,
    x: i32,
    y: i32,
}

/// Coverage (0..1) of a rounded rectangle at pixel centre (px, py).
fn rrect(px: f32, py: f32, x0: f32, y0: f32, x1: f32, y1: f32, r: f32) -> f32 {
    sd_cov(sd_rrect(px, py, x0, y0, x1, y1, r))
}

fn sd_rrect(px: f32, py: f32, x0: f32, y0: f32, x1: f32, y1: f32, r: f32) -> f32 {
    let (cx, cy) = ((x0 + x1) / 2.0, (y0 + y1) / 2.0);
    let (hx, hy) = ((x1 - x0) / 2.0 - r, (y1 - y0) / 2.0 - r);
    let (qx, qy) = ((px - cx).abs() - hx, (py - cy).abs() - hy);
    let outside = (qx.max(0.0).powi(2) + qy.max(0.0).powi(2)).sqrt();
    outside + qx.max(qy).min(0.0) - r
}

fn sd_cov(d: f32) -> f32 {
    (0.5 - d).clamp(0.0, 1.0)
}

/// Coverage of a triangle (a, b, c) at a pixel, with a 1 px soft edge.
fn tri(px: f32, py: f32, a: (f32, f32), b: (f32, f32), c: (f32, f32)) -> f32 {
    let edge = |p: (f32, f32), q: (f32, f32)| {
        let (ex, ey) = (q.0 - p.0, q.1 - p.1);
        let len = (ex * ex + ey * ey).sqrt();
        ((px - p.0) * ey - (py - p.1) * ex) / len
    };
    let d = edge(a, b).max(edge(b, c)).max(edge(c, a));
    sd_cov(d)
}

/// Paint straight colour `rgb` at coverage `a` over the premultiplied pixel.
fn over(px: &mut [u8], rgb: (u8, u8, u8), a: f32) {
    if a <= 0.0 {
        return;
    }
    let a = a.min(1.0);
    let inv = 1.0 - a;
    px[0] = (rgb.2 as f32 * a + px[0] as f32 * inv) as u8;
    px[1] = (rgb.1 as f32 * a + px[1] as f32 * inv) as u8;
    px[2] = (rgb.0 as f32 * a + px[2] as f32 * inv) as u8;
    px[3] = (255.0 * a + px[3] as f32 * inv) as u8;
}

fn font(height: i32, weight: u32, face: &str) -> HFONT {
    // SAFETY: plain font creation; deleted by the caller.
    unsafe {
        CreateFontW(
            -height,
            0,
            0,
            0,
            weight as i32,
            0,
            0,
            0,
            DEFAULT_CHARSET as u32,
            OUT_TT_PRECIS as u32,
            CLIP_DEFAULT_PRECIS as u32,
            ANTIALIASED_QUALITY as u32,
            DEFAULT_PITCH as u32,
            wide(face).as_ptr(),
        )
    }
}

/// Grayscale text coverage mask (w x h), from GDI drawing white on black.
struct Text {
    w: i32,
    h: i32,
    mask: Vec<u8>,
}

fn text_mask(s: &str, f: HFONT) -> Text {
    // SAFETY: a temporary DC and DIB, released before returning.
    unsafe {
        let screen = GetDC(std::ptr::null_mut());
        let dc = CreateCompatibleDC(screen);
        let old_font = SelectObject(dc, f as HGDIOBJ);
        let w16: Vec<u16> = s.encode_utf16().collect();
        let mut size = SIZE { cx: 0, cy: 0 };
        GetTextExtentPoint32W(dc, w16.as_ptr(), w16.len() as i32, &mut size);
        let (w, h) = (size.cx.max(1) + 2, size.cy.max(1));
        let (bmp, bits) = dib(dc, w, h);
        let old_bmp = SelectObject(dc, bmp as HGDIOBJ);
        SetBkMode(dc, TRANSPARENT as i32);
        SetTextColor(dc, 0x00FF_FFFF);
        let mut rc = RECT { left: 1, top: 0, right: w, bottom: h };
        DrawTextW(dc, w16.as_ptr(), w16.len() as i32, &mut rc, DT_SINGLELINE | DT_NOPREFIX);
        let src = std::slice::from_raw_parts(bits, (w * h * 4) as usize);
        // Green channel of each BGRA pixel = coverage (white text on black).
        let mask = src.iter().skip(1).step_by(4).copied().collect();
        SelectObject(dc, old_bmp);
        SelectObject(dc, old_font);
        DeleteObject(bmp as HGDIOBJ);
        DeleteDC(dc);
        ReleaseDC(std::ptr::null_mut(), screen);
        Text { w, h, mask }
    }
}

/// A top-down 32-bit DIB; the bits are zeroed.
unsafe fn dib(dc: HDC, w: i32, h: i32) -> (windows_sys::Win32::Graphics::Gdi::HBITMAP, *const u8) {
    let mut bi: BITMAPINFO = unsafe { std::mem::zeroed() };
    bi.bmiHeader = BITMAPINFOHEADER {
        biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
        biWidth: w,
        biHeight: -h,
        biPlanes: 1,
        biBitCount: 32,
        biCompression: BI_RGB,
        ..unsafe { std::mem::zeroed() }
    };
    let mut bits: *mut core::ffi::c_void = std::ptr::null_mut();
    // SAFETY: valid header; GDI allocates and zeroes the bits.
    let bmp = unsafe { CreateDIBSection(dc, &bi, DIB_RGB_COLORS, &mut bits, std::ptr::null_mut(), 0) };
    (bmp, bits as *const u8)
}

fn stamp(frame: &mut Frame, t: &Text, x: i32, y: i32, rgb: (u8, u8, u8)) {
    for ty in 0..t.h {
        for tx in 0..t.w {
            let a = t.mask[(ty * t.w + tx) as usize];
            let (fx, fy) = (x + tx, y + ty);
            if a == 0 || fx < 0 || fy < 0 || fx >= frame.w || fy >= frame.h {
                continue;
            }
            let i = ((fy * frame.w + fx) * 4) as usize;
            over(&mut frame.px[i..i + 4], rgb, a as f32 / 255.0);
        }
    }
}

fn dpi_scale() -> f32 {
    // SAFETY: plain queries.
    unsafe {
        let mon = MonitorFromWindow(GetForegroundWindow(), MONITOR_DEFAULTTOPRIMARY);
        let (mut x, mut y) = (96u32, 96u32);
        if GetDpiForMonitor(mon, MDT_EFFECTIVE_DPI, &mut x, &mut y) != 0 {
            x = 96;
        }
        x as f32 / 96.0
    }
}

fn render(n: &Notice) -> Frame {
    let s = dpi_scale();
    let px = |v: f32| (v * s).round() as i32;
    // The chip says on / off, so the words need not.
    let label = n.text.trim_end_matches(" on").trim_end_matches(" off").to_string();
    let f_main = font(px(15.0), FW_EXTRABOLD, "Segoe UI");
    let f_chip = font(px(10.5), FW_BOLD, "Cascadia Mono");
    let text = text_mask(&label, f_main);
    let chip_t = text_mask(if n.on { "ON" } else { "OFF" }, f_chip);
    // SAFETY: fonts made above.
    unsafe {
        DeleteObject(f_main as HGDIOBJ);
        DeleteObject(f_chip as HGDIOBJ);
    }

    let glow = px(14.0); // margin for the soft glow
    let (pad, icon, gap) = (px(12.0), px(22.0), px(10.0));
    let chip_w = chip_t.w + px(10.0);
    let chip_h = chip_t.h + px(3.0);
    let pill_h = px(44.0);
    let pill_w = pad + icon + gap + text.w + gap + chip_w + pad;
    let (w, h) = (pill_w + glow * 2, pill_h + glow * 2);
    let mut frame = Frame { w, h, px: vec![0u8; (w * h * 4) as usize], x: 0, y: 0 };

    let accent = n.accent;
    let lime = (198u8, 255u8, 52u8);
    let grey = (120u8, 120u8, 132u8);
    let edge = if n.on { accent } else { (52u8, 52u8, 60u8) };
    let (x0, y0) = (glow as f32, glow as f32);
    let (x1, y1) = ((glow + pill_w) as f32, (glow + pill_h) as f32);
    let r = 14.0 * s;

    for y in 0..h {
        for x in 0..w {
            let (fx, fy) = (x as f32 + 0.5, y as f32 + 0.5);
            let i = ((y * w + x) * 4) as usize;
            let d = sd_rrect(fx, fy, x0, y0, x1, y1, r);
            let p = &mut frame.px[i..i + 4];
            if n.on && d > 0.0 {
                // Soft accent glow outside the pill.
                let g = (-(d / (6.0 * s)).powi(2)).exp() * 0.32;
                over(p, accent, g);
            }
            // Body (nearly opaque black) and a 1 px edge.
            over(p, (8, 8, 10), sd_cov(d) * 0.94);
            let ring = sd_cov(d.abs() - 0.6 * s.max(1.0));
            over(p, edge, ring * if n.on { 0.75 } else { 1.0 });

            // Keycap mark (same geometry as the app icon, 32-unit grid).
            let (ix, iy) = (x0 + pad as f32, y0 + (pill_h - icon) as f32 / 2.0);
            let u = icon as f32 / 32.0;
            let (lx, ly) = ((fx - ix) / u, (fy - iy) / u);
            if (0.0..32.0).contains(&lx) && (0.0..32.0).contains(&ly) {
                let body = rrect(lx, ly, 5.0, 5.0, 27.0, 27.6, 5.6);
                let face = rrect(lx, ly, 8.2, 8.2, 23.8, 22.4, 3.4);
                let play = tri(lx, ly, (13.4, 11.2), (20.2, 15.3), (13.4, 19.4));
                over(p, if n.on { accent } else { grey }, body);
                over(p, (10, 10, 12), face);
                over(p, if n.on { lime } else { grey }, play);
            }

            // ON / OFF chip.
            let cx0 = x1 - pad as f32 - chip_w as f32;
            let cy0 = y0 + (pill_h - chip_h) as f32 / 2.0;
            let cd = sd_rrect(fx, fy, cx0, cy0, cx0 + chip_w as f32, cy0 + chip_h as f32, 4.0 * s);
            if n.on {
                over(p, lime, sd_cov(cd));
            } else {
                over(p, (52, 52, 60), sd_cov(cd.abs() - 0.5 * s.max(1.0)));
            }
        }
    }
    let tx = glow + pad + icon + gap;
    stamp(&mut frame, &text, tx, glow + (pill_h - text.h) / 2, (255, 255, 255));
    let cx = glow + pill_w - pad - chip_w + (chip_w - chip_t.w) / 2;
    let cy = glow + (pill_h - chip_h) / 2 + (chip_h - chip_t.h) / 2;
    stamp(&mut frame, &chip_t, cx, cy, if n.on { (0, 0, 0) } else { (166, 166, 176) });
    frame
}

/// Where the notice goes: the work area of the monitor the app in front is on.
fn place(f: &mut Frame, pos: &HudPosition) {
    // SAFETY: plain monitor queries.
    let wa = unsafe {
        let mut mi: MONITORINFO = std::mem::zeroed();
        mi.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
        let mon = MonitorFromWindow(GetForegroundWindow(), MONITOR_DEFAULTTOPRIMARY);
        GetMonitorInfoW(mon, &mut mi);
        mi.rcWork
    };
    let margin = 10;
    let x = match pos {
        HudPosition::TopLeft | HudPosition::BottomLeft => wa.left + margin,
        HudPosition::TopCenter => wa.left + (wa.right - wa.left - f.w) / 2,
        HudPosition::TopRight | HudPosition::BottomRight => wa.right - f.w - margin,
    };
    let y = match pos {
        HudPosition::BottomLeft | HudPosition::BottomRight => wa.bottom - f.h - margin,
        _ => wa.top + margin,
    };
    f.x = x;
    f.y = y;
}

fn blit(hwnd: HWND, f: &Frame, alpha: u8) {
    // SAFETY: a temporary DC and DIB holding a copy of the frame.
    unsafe {
        let screen = GetDC(std::ptr::null_mut());
        let dc = CreateCompatibleDC(screen);
        let (bmp, bits) = dib(dc, f.w, f.h);
        std::ptr::copy_nonoverlapping(f.px.as_ptr(), bits as *mut u8, f.px.len());
        let old = SelectObject(dc, bmp as HGDIOBJ);
        let blend = BLENDFUNCTION { BlendOp: AC_SRC_OVER as u8, BlendFlags: 0, SourceConstantAlpha: alpha, AlphaFormat: AC_SRC_ALPHA as u8 };
        let dst = POINT { x: f.x, y: f.y };
        let size = SIZE { cx: f.w, cy: f.h };
        let src = POINT { x: 0, y: 0 };
        UpdateLayeredWindow(hwnd, screen, &dst, &size, dc, &src, 0, &blend, ULW_ALPHA);
        SelectObject(dc, old);
        DeleteObject(bmp as HGDIOBJ);
        DeleteDC(dc);
        ReleaseDC(std::ptr::null_mut(), screen);
    }
}
