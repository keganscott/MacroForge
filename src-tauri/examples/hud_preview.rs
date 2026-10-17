//! Show the native on-screen notice (on, then off) for a visual check.
//!
//!   cargo run -p macroforge --example hud_preview --release

#[cfg(windows)]
#[path = "../src/hud.rs"]
mod hud;

#[cfg(windows)]
fn main() {
    use macroforge_engine::model::HudPosition;
    hud::show(hud::Notice { text: "Auto-clicker on".into(), on: true, pos: HudPosition::TopCenter, accent: (0x22, 0xd3, 0xee) });
    std::thread::sleep(std::time::Duration::from_millis(900));
    println!("on-shown");
    std::thread::sleep(std::time::Duration::from_millis(1800));
    hud::show(hud::Notice { text: "Auto-clicker off".into(), on: false, pos: HudPosition::TopCenter, accent: (0x22, 0xd3, 0xee) });
    std::thread::sleep(std::time::Duration::from_millis(900));
    println!("off-shown");
    std::thread::sleep(std::time::Duration::from_millis(2000));
}

#[cfg(not(windows))]
fn main() {}
