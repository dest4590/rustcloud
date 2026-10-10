use id3::TagLike;
use std::path::{Path, PathBuf};

fn get_unique_filepath(dir: &Path, filename: &str) -> PathBuf {
    let target = dir.join(filename);
    if !target.exists() {
        return target;
    }
    let stem = Path::new(filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("track");
    let ext = Path::new(filename)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("mp3");
    let mut counter = 1;
    loop {
        let candidate = dir.join(format!("{stem} ({counter}).{ext}"));
        if !candidate.exists() {
            return candidate;
        }
        counter += 1;
    }
}

fn attach_artwork(tag: &mut id3::Tag, url: &str) {
    let agent = ureq::Agent::config_builder().build().new_agent();
    if let Ok(mut resp) = agent.get(url).call() {
        let mut bytes = Vec::new();
        if std::io::copy(&mut resp.body_mut().as_reader(), &mut bytes).is_ok() && !bytes.is_empty()
        {
            let mime = if url.contains(".png") {
                "image/png"
            } else {
                "image/jpeg"
            };
            tag.add_frame(id3::frame::Picture {
                mime_type: mime.to_string(),
                picture_type: id3::frame::PictureType::CoverFront,
                description: "Cover".to_string(),
                data: bytes,
            });
        }
    }
}

#[tauri::command]
pub async fn save_audio_file(
    data: Vec<u8>,
    filename: String,
    title: Option<String>,
    artist: Option<String>,
    artwork_url: Option<String>,
) -> Result<String, String> {
    let download_dir = dirs::download_dir().unwrap_or_else(|| PathBuf::from("."));
    let target_path = get_unique_filepath(&download_dir, &filename);

    std::fs::write(&target_path, &data).map_err(|e| {
        format!(
            "failed to write audio file to {}: {e}",
            target_path.display()
        )
    })?;

    let mut tag = id3::Tag::read_from_path(&target_path).unwrap_or_default();
    if let Some(ref t) = title {
        tag.set_title(t);
    }
    if let Some(ref a) = artist {
        tag.set_artist(a);
    }
    if let Some(ref art_url) = artwork_url {
        attach_artwork(&mut tag, art_url);
    }
    let _ = tag.write_to_path(&target_path, id3::Version::Id3v24);

    Ok(target_path.to_string_lossy().to_string())
}
