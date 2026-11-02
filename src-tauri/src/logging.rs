use std::fs::{File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

static LOG_FILE: OnceLock<PathBuf> = OnceLock::new();
static LOG_MUTEX: OnceLock<Mutex<File>> = OnceLock::new();

pub fn log_path() -> &'static Path {
    static DEFAULT_PATH: std::sync::OnceLock<PathBuf> = std::sync::OnceLock::new();
    let path = DEFAULT_PATH.get_or_init(|| {
        let mut dir = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
        dir.push("rustcloud");
        let _ = std::fs::create_dir_all(&dir);
        dir.push("rustcloud-audio.log");
        dir
    });
    path.as_path()
}

pub fn log_level_name() -> &'static str {
    match std::env::var("RUSTCLOUD_LOG")
        .unwrap_or_else(|_| "info".to_string())
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "debug" => "debug",
        _ => "info",
    }
}

fn should_log_debug() -> bool {
    log_level_name() == "debug"
}

fn open_log_file() -> io::Result<File> {
    let path = log_path();
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    std::fs::create_dir_all(parent)?;
    let file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(path)?;
    Ok(file)
}

fn write_line(line: &str) -> io::Result<()> {
    let file = LOG_MUTEX.get_or_init(|| Mutex::new(open_log_file().unwrap_or_else(|_| File::create(log_path()).unwrap())));
    let mut guard = file.lock().unwrap();
    writeln!(guard, "{line}")?;
    guard.flush()?;
    Ok(())
}

pub fn init_logger() -> io::Result<()> {
    let log_file = open_log_file()?;
    LOG_FILE.get_or_init(|| log_path().to_path_buf());
    LOG_MUTEX.get_or_init(|| Mutex::new(log_file));

    let level = if should_log_debug() { log::LevelFilter::Debug } else { log::LevelFilter::Info };

    log::set_logger(&RustCloudLogger).map_err(|_| io::Error::new(io::ErrorKind::Other, "logger already initialized"))?;
    log::set_max_level(level);
    Ok(())
}

struct RustCloudLogger;

impl log::Log for RustCloudLogger {
    fn enabled(&self, metadata: &log::Metadata<'_>) -> bool {
        if metadata.target().starts_with("rustcloud") {
            return metadata.level() <= log::max_level();
        }
        metadata.level() <= log::max_level()
    }

    fn log(&self, record: &log::Record<'_>) {
        let target = record.target();
        if !self.enabled(record.metadata()) {
            return;
        }

        let level = match record.level() {
            log::Level::Error => "ERROR",
            log::Level::Warn => "WARN",
            log::Level::Info => "INFO",
            log::Level::Debug => "DEBUG",
            log::Level::Trace => "TRACE",
        };

        let line = format!("[{level}] {target}: {}", record.args());
        let _ = write_line(&line);
        if record.level() <= log::Level::Info {
            eprintln!("{line}");
        }
    }

    fn flush(&self) {
        let _ = std::io::stderr().flush();
    }
}

