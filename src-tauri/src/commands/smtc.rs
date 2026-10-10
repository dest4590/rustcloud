use crate::smtc::SmtcManager;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn set_smtc_enabled(enabled: bool, smtc: State<'_, Arc<SmtcManager>>) -> Result<(), String> {
    smtc.set_enabled(enabled);
    Ok(())
}
