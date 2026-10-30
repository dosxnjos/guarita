// Guarita no PC. Regras do produto (invioláveis, ver app/CLAUDE.md):
// - só trabalha com o app aberto: nenhuma tarefa agendada, nenhum serviço; "iniciar com o Windows" existe só
//   como opção desligada (o plugin autostart é registrado, mas `enable()` só é chamado pela tela de ajustes);
// - nada lê o processo do jogo nem manda tecla/clique ao jogo; a única leitura de rede é a captura passiva do
//   PRÓPRIO jogador (módulo `capture`), desligada por padrão, só com aviso aceito e o app aberto;
// - "sempre por cima" nasce desligado e só liga depois do aviso da regra da SBI aceito (conferido aqui também).

mod capture;

use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};

use serde::Serialize;
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent, Wry,
};
use tauri_plugin_store::StoreExt;
use tauri_plugin_window_state::StateFlags;

/// Rótulo da janela principal (declarada em tauri.conf.json).
pub const PAINEL: &str = "painel";
/// Arquivo do tauri-plugin-store com a configuração (o front grava em `config.json`, chave `config`).
pub const CONFIG_STORE: &str = "config.json";
/// Evento emitido a todas as janelas quando a voz é silenciada ou volta (payload: bool).
pub const EV_VOZ_SILENCIADA: &str = "guarita://voz-silenciada";

/// Um widget: janela pequena, sem moldura do Windows, criada sob demanda pelo rótulo.
pub struct WidgetSpec {
    pub label: &'static str,
    pub title: &'static str,
    pub width: f64,
    pub height: f64,
    pub min_width: f64,
    pub min_height: f64,
}

/// Lista fechada de widgets. Rótulo novo entra aqui, em `capabilities/widgets.json` e em `src/lib/windows.ts`.
pub const WIDGETS: &[WidgetSpec] = &[
    WidgetSpec { label: "preco", title: "Preço rápido", width: 360.0, height: 420.0, min_width: 280.0, min_height: 200.0 },
    WidgetSpec { label: "dossie", title: "Dossiê", width: 380.0, height: 480.0, min_width: 300.0, min_height: 240.0 },
    WidgetSpec { label: "relogio", title: "Relógio", width: 300.0, height: 220.0, min_width: 220.0, min_height: 140.0 },
    WidgetSpec { label: "alertas", title: "Alertas", width: 360.0, height: 420.0, min_width: 280.0, min_height: 200.0 },
    WidgetSpec { label: "despertador", title: "Despertador", width: 320.0, height: 360.0, min_width: 240.0, min_height: 180.0 },
    WidgetSpec { label: "lente", title: "Lente de mercado", width: 380.0, height: 360.0, min_width: 280.0, min_height: 200.0 },
    WidgetSpec { label: "sessao", title: "Sessão", width: 320.0, height: 320.0, min_width: 240.0, min_height: 180.0 },
    WidgetSpec { label: "loot", title: "Loot", width: 360.0, height: 420.0, min_width: 260.0, min_height: 200.0 },
];

#[derive(Default)]
struct AppState {
    /// Fechar o painel esconde na bandeja em vez de sair (opção da tela de ajustes; padrão: sair).
    close_to_tray: AtomicBool,
    muted: AtomicBool,
    mute_item: Mutex<Option<CheckMenuItem<Wry>>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetInfo {
    label: &'static str,
    title: &'static str,
    open: bool,
    visible: bool,
}

fn spec(label: &str) -> Result<&'static WidgetSpec, String> {
    WIDGETS
        .iter()
        .find(|w| w.label == label)
        .ok_or_else(|| format!("Widget desconhecido: \"{label}\"."))
}

fn build_widget(app: &AppHandle, s: &WidgetSpec) -> tauri::Result<WebviewWindow> {
    // Primeira abertura em cascata (um widget não nasce em cima do outro); depois disso o window-state
    // restaura a posição salva por cima desta.
    let i = WIDGETS.iter().position(|w| w.label == s.label).unwrap_or(0) as f64;
    // Um bundle só: o front descobre qual widget desenhar pelo rótulo da janela (getCurrentWindow().label).
    WebviewWindowBuilder::new(app, s.label, WebviewUrl::App("index.html".into()))
        .title(format!("Guarita · {}", s.title))
        .position(120.0 + i * 36.0, 100.0 + i * 36.0)
        .inner_size(s.width, s.height)
        .min_inner_size(s.min_width, s.min_height)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(false)
        .resizable(true)
        .visible(true)
        .build()
}

fn show_and_focus(w: &WebviewWindow) {
    let _ = w.show();
    let _ = w.unminimize();
    let _ = w.set_focus();
}

fn open_widget(app: &AppHandle, label: &str) -> Result<(), String> {
    let s = spec(label)?;
    if let Some(w) = app.get_webview_window(s.label) {
        show_and_focus(&w);
        return Ok(());
    }
    let w = build_widget(app, s).map_err(|e| e.to_string())?;
    let _ = w.set_focus();
    log::info!("widget aberto: {}", s.label);
    Ok(())
}

fn show_painel(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(PAINEL) {
        show_and_focus(&w);
    }
}

/// O aviso da regra da SBI foi aceito? Lê `config.avisoSbiAceitoEm` do store (string ISO quando aceito).
fn sbi_aceito(app: &AppHandle) -> bool {
    app.store(CONFIG_STORE)
        .ok()
        .and_then(|s| s.get("config"))
        .and_then(|c| c.get("avisoSbiAceitoEm").and_then(|v| v.as_str().map(|s| !s.is_empty())))
        .unwrap_or(false)
}

/// Widget fechado por qualquer caminho (barra, Alt+F4, painel, atalho): não reabre no próximo início.
/// Encerrar o app destrói as janelas sem `CloseRequested`, então quem estava aberto ao sair continua marcado.
fn marcar_widget_fechado(app: &AppHandle, label: &str) {
    let Ok(store) = app.store(CONFIG_STORE) else { return };
    let Some(mut cfg) = store.get("config") else { return };
    let Some(janela) = cfg
        .get_mut("janelas")
        .and_then(|j| j.get_mut(label))
        .and_then(|w| w.as_object_mut())
    else {
        return;
    };
    if janela.get("aberta").and_then(|v| v.as_bool()) != Some(true) {
        return;
    }
    janela.insert("aberta".into(), serde_json::Value::Bool(false));
    store.set("config", cfg);
    if let Err(e) = store.save() {
        log::warn!("não consegui gravar o fechamento do widget {label}: {e}");
    }
}

fn set_muted(app: &AppHandle, on: bool) {
    let st = app.state::<AppState>();
    st.muted.store(on, Ordering::SeqCst);
    if let Some(item) = st.mute_item.lock().ok().and_then(|g| g.clone()) {
        let _ = item.set_checked(on);
    }
    let _ = app.emit(EV_VOZ_SILENCIADA, on);
}

// ---------- comandos (permissões em build.rs + capabilities/*.json) ----------
// Assíncronos de propósito: criar janela num comando síncrono trava no Windows.

/// Abre o widget (ou mostra e foca se já existir).
#[tauri::command]
async fn widget_open(app: AppHandle, label: String) -> Result<(), String> {
    open_widget(&app, &label)
}

/// Fecha o widget (a posição e o tamanho ficam salvos pelo window-state).
#[tauri::command]
async fn widget_close(app: AppHandle, label: String) -> Result<(), String> {
    spec(&label)?;
    if let Some(w) = app.get_webview_window(&label) {
        w.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Traz o widget para a frente; erro se não estiver aberto.
#[tauri::command]
async fn widget_focus(app: AppHandle, label: String) -> Result<(), String> {
    spec(&label)?;
    let w = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("O widget \"{label}\" não está aberto."))?;
    show_and_focus(&w);
    Ok(())
}

/// Abre se estiver fechado ou escondido; fecha se estiver visível. Devolve se ficou aberto.
#[tauri::command]
async fn widget_toggle(app: AppHandle, label: String) -> Result<bool, String> {
    spec(&label)?;
    match app.get_webview_window(&label) {
        Some(w) if w.is_visible().unwrap_or(false) => {
            w.close().map_err(|e| e.to_string())?;
            Ok(false)
        }
        _ => open_widget(&app, &label).map(|_| true),
    }
}

/// Estado de todos os widgets conhecidos.
#[tauri::command]
async fn widget_list(app: AppHandle) -> Vec<WidgetInfo> {
    WIDGETS
        .iter()
        .map(|s| {
            let w = app.get_webview_window(s.label);
            WidgetInfo {
                label: s.label,
                title: s.title,
                open: w.is_some(),
                visible: w.map(|w| w.is_visible().unwrap_or(false)).unwrap_or(false),
            }
        })
        .collect()
}

/// Liga ou desliga "sempre por cima" numa janela (widget ou painel). Ligar exige o aviso da SBI aceito.
#[tauri::command]
async fn widget_set_on_top(app: AppHandle, label: String, on: bool) -> Result<(), String> {
    if label != PAINEL {
        spec(&label)?;
    }
    if on && !sbi_aceito(&app) {
        return Err("Para fixar por cima do jogo, leia e aceite o aviso sobre a regra da Sandbox Interactive.".into());
    }
    let w = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("A janela \"{label}\" não está aberta."))?;
    w.set_always_on_top(on).map_err(|e| e.to_string())
}

/// Esconde todos os widgets abertos (atalho "mostrar e esconder tudo").
#[tauri::command]
async fn widgets_hide_all(app: AppHandle) {
    for s in WIDGETS {
        if let Some(w) = app.get_webview_window(s.label) {
            let _ = w.hide();
        }
    }
}

/// Mostra de novo os widgets que estavam abertos e escondidos.
#[tauri::command]
async fn widgets_show_all(app: AppHandle) {
    for s in WIDGETS {
        if let Some(w) = app.get_webview_window(s.label) {
            let _ = w.show();
        }
    }
}

/// Fechar o painel: `true` esconde na bandeja, `false` (padrão) encerra o app.
#[tauri::command]
async fn set_close_to_tray(app: AppHandle, on: bool) {
    app.state::<AppState>().close_to_tray.store(on, Ordering::SeqCst);
}

/// Sincroniza o item "Silenciar voz" da bandeja e avisa todas as janelas.
#[tauri::command]
async fn tray_set_muted(app: AppHandle, on: bool) {
    set_muted(&app, on);
}

// ---------- bandeja ----------

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let abrir = MenuItem::with_id(app, "painel", "Abrir painel", true, None::<&str>)?;
    let widgets = Submenu::with_id(app, "widgets", "Widgets", true)?;
    for s in WIDGETS {
        widgets.append(&MenuItem::with_id(app, format!("w:{}", s.label), s.title, true, None::<&str>)?)?;
    }
    let mudo = CheckMenuItem::with_id(app, "silenciar", "Silenciar voz", true, false, None::<&str>)?;
    let sair = MenuItem::with_id(app, "sair", "Sair da Guarita", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[&abrir, &widgets, &mudo, &PredefinedMenuItem::separator(app)?, &sair],
    )?;
    if let Ok(mut g) = app.state::<AppState>().mute_item.lock() {
        *g = Some(mudo.clone());
    }

    let mut tray = TrayIconBuilder::with_id("guarita")
        .tooltip("Guarita")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, ev| match ev.id().as_ref() {
            "painel" => show_painel(app),
            "silenciar" => {
                let on = !app.state::<AppState>().muted.load(Ordering::SeqCst);
                set_muted(app, on);
            }
            "sair" => app.exit(0),
            id => {
                if let Some(label) = id.strip_prefix("w:") {
                    if let Err(e) = open_widget(app, label) {
                        log::warn!("bandeja: {e}");
                    }
                }
            }
        })
        .on_tray_icon_event(|tray, ev| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = ev {
                show_painel(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // single-instance precisa ser o primeiro plugin: a segunda execução só foca o painel e sai.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_painel(app)))
        // Destinos padrão do plugin: saída do terminal e arquivo na pasta de logs do app.
        .plugin(tauri_plugin_log::Builder::new().level(log::LevelFilter::Info).build())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                // Moldura e visibilidade não são restauradas: widget nasce sem moldura e visível ao abrir.
                .with_state_flags(StateFlags::POSITION | StateFlags::SIZE | StateFlags::MAXIMIZED)
                .build(),
        )
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        // Registrado, nunca ligado aqui: só `src/lib/autostart.ts` chama enable(), a partir da tela de ajustes.
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .manage(AppState::default())
        .manage(capture::CapturaState::default())
        .invoke_handler(tauri::generate_handler![
            widget_open,
            widget_close,
            widget_focus,
            widget_toggle,
            widget_list,
            widget_set_on_top,
            widgets_hide_all,
            widgets_show_all,
            set_close_to_tray,
            tray_set_muted,
            capture::captura_estado,
            capture::captura_sessao,
            capture::captura_ligar,
            capture::captura_desligar,
            capture::captura_nova_sessao,
            capture::captura_definir_codigos,
            capture::captura_definir_dados,
            capture::captura_diagnostico
        ])
        .setup(|app| {
            build_tray(app.handle())?;
            log::info!("Guarita iniciada: painel criado, bandeja pronta");
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != PAINEL {
                if matches!(event, WindowEvent::CloseRequested { .. }) && spec(window.label()).is_ok() {
                    marcar_widget_fechado(window.app_handle(), window.label());
                }
                return;
            }
            if let WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                if app.state::<AppState>().close_to_tray.load(Ordering::SeqCst) {
                    api.prevent_close();
                    let _ = window.hide();
                } else {
                    // Fechar o painel encerra tudo: widgets, motor de alertas e voz param junto.
                    app.exit(0);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("erro ao iniciar a Guarita");
}
