use std::fs;
use std::io::Write;
use std::process::{Command, Stdio};
use tauri::{Manager, WebviewUrl, webview::WebviewBuilder, LogicalPosition, LogicalSize, path::BaseDirectory};

#[derive(serde::Serialize)]
struct RunResult {
    success: bool,
    output: String,
}

#[tauri::command]

fn run_cpp(app: tauri::AppHandle, code: String, input: String) -> RunResult {
    let header_dir = match app.path().resolve("resources", BaseDirectory::Resource) {
        Ok(p) => p,
        Err(e) => return RunResult { success: false, output: format!("Couldn't find bundled headers: {e}") },
    };
    let dir = std::env::temp_dir();
    let source_path = dir.join("widget_app_code.cpp");
    let binary_path = dir.join("widget_app_binary");

    if let Err(e) = fs::write(&source_path, &code) {
        return RunResult { success: false, output: format!("Couldn't save the code: {e}") };
    }

    let compile = Command::new("clang++")
        .arg(&source_path)
        .arg("-o")
        .arg(&binary_path)
        .arg("-std=c++17")
        .arg("-I")
        .arg(&header_dir)
        .output();

    let compile = match compile {
        Ok(o) => o,
        Err(e) => return RunResult { success: false, output: format!("Couldn't run the compiler: {e}") },
    };

    if !compile.status.success() {
        return RunResult {
            success: false,
            output: String::from_utf8_lossy(&compile.stderr).to_string(),
        };
    }

    let mut child = match Command::new(&binary_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => return RunResult { success: false, output: format!("Couldn't run the program: {e}") },
    };

    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(input.as_bytes());
    }

    let result = match child.wait_with_output() {
        Ok(o) => o,
        Err(e) => return RunResult { success: false, output: format!("The program crashed: {e}") },
    };

    let stdout = String::from_utf8_lossy(&result.stdout).to_string();
    let stderr = String::from_utf8_lossy(&result.stderr).to_string();

    if result.status.success() {
        RunResult { success: true, output: stdout }
    } else {
        RunResult { success: false, output: format!("{stdout}{stderr}") }
    }
}
#[tauri::command]
fn move_problem_viewer(app: tauri::AppHandle, x: f64, y: f64) {
    if let Some(webview) = app.get_webview("problem-viewer") {
        let _ = webview.set_position(LogicalPosition::new(x, y));
    }
}
#[tauri::command]
async fn random_atcoder_problem(app: tauri::AppHandle, letter: String) -> Result<(), String> {
    #[derive(serde::Deserialize)]
    struct AtCoderProblem {
        id: String,
        contest_id: String,
        problem_index: String,
    }

    let problems: Vec<AtCoderProblem> = reqwest::get("https://kenkoooo.com/atcoder/resources/problems.json")
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let candidates: Vec<AtCoderProblem> = problems
        .into_iter()
        .filter(|p| {
            let is_abc = p.contest_id.starts_with("abc")
                && p.contest_id.len() > 3
                && p.contest_id[3..].chars().all(|c| c.is_ascii_digit());
            is_abc && p.problem_index == letter
        })
        .collect();

    if candidates.is_empty() {
        return Err("No matching AtCoder problems found".into());
    }

    let pick = &candidates[rand::random::<usize>() % candidates.len()];
    let url = format!("https://atcoder.jp/contests/{}/tasks/{}", pick.contest_id, pick.id);

    if let Some(webview) = app.get_webview("problem-viewer") {
        webview
            .navigate(url.parse::<tauri::Url>().map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn load_problem_url(app: tauri::AppHandle, url: String) {
    if let Some(webview) = app.get_webview("problem-viewer") {
        let _ = webview.navigate(url.parse().unwrap());
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let main_window = app.get_window("main").unwrap();
            main_window.maximize()?;
            main_window.show()?;

            let webview_builder = WebviewBuilder::new(
                "problem-viewer",
                WebviewUrl::External("https://codeforces.com/problemset".parse().unwrap()),
            );

            main_window.add_child(
                webview_builder,
                LogicalPosition::new(390.0, 126.0),
                LogicalSize::new(680.0, 344.0),
            )?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![run_cpp, move_problem_viewer, load_problem_url, random_atcoder_problem])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}