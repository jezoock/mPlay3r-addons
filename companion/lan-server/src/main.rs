use mplay3r_lan_server::server::{start_lan_server, ServerConfig};
use std::env;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

fn generate_fallback_secret(len: usize, digits_only: bool) -> String {
    let mut seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0x5a5a_1234_9876_fedc)
        ^ u64::from(std::process::id()).wrapping_mul(0x9e37_79b9_7f4a_7c15);
    let alphabet: &[u8] = if digits_only {
        b"0123456789"
    } else {
        b"0123456789abcdef"
    };
    let mut out = String::with_capacity(len);
    for _ in 0..len {
        seed ^= seed << 13;
        seed ^= seed >> 7;
        seed ^= seed << 17;
        out.push(alphabet[(seed as usize) % alphabet.len()] as char);
    }
    out
}

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    let mut dirs: Vec<PathBuf> = Vec::new();
    let mut bind = "0.0.0.0".to_string();
    let mut port: u16 = 8765;
    let mut name = "mPlay3r Library".to_string();
    let mut pin = String::new();
    let mut token = String::new();

    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--dir" if i + 1 < args.len() => {
                dirs.push(PathBuf::from(&args[i + 1]));
                i += 2;
            }
            "--bind" if i + 1 < args.len() => {
                bind = args[i + 1].clone();
                i += 2;
            }
            "--port" if i + 1 < args.len() => {
                if let Ok(p) = args[i + 1].parse::<u16>() {
                    port = p;
                }
                i += 2;
            }
            "--name" if i + 1 < args.len() => {
                name = args[i + 1].clone();
                i += 2;
            }
            "--pin" if i + 1 < args.len() => {
                pin = args[i + 1].clone();
                i += 2;
            }
            "--token" if i + 1 < args.len() => {
                token = args[i + 1].clone();
                i += 2;
            }
            "--help" | "-h" => {
                println!(
                    "mPlay3r LAN Library Server\n\nUsage:\n  mplay3r-lan-server --dir <music_folder> [--dir <other>] [--port 8765] [--bind 0.0.0.0] [--name \"My Library\"] [--pin 482910] [--token <hex>]"
                );
                return;
            }
            _ => i += 1,
        }
    }

    if dirs.is_empty() {
        eprintln!("Error: at least one --dir <folder> must be explicitly allowlisted.");
        std::process::exit(2);
    }
    if pin.is_empty() {
        pin = generate_fallback_secret(6, true);
    }
    if token.is_empty() {
        token = generate_fallback_secret(32, false);
    }

    let handle = start_lan_server(ServerConfig {
        bind_addr: format!("{bind}:{port}"),
        server_name: name.clone(),
        pin: pin.clone(),
        bearer_token: token.clone(),
        shared_dirs: dirs,
    })
    .unwrap_or_else(|e| {
        eprintln!("Failed to start mPlay3r LAN server: {e}");
        std::process::exit(1);
    });

    println!(
        "mPlay3r LAN server \"{name}\" listening on http://{} (PIN: {pin})",
        handle.local_addr()
    );
    // Keep server alive until process is terminated by user / Tauri host.
    loop {
        std::thread::park();
    }
}
