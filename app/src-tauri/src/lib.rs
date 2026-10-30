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
/// `title` e `title_es`: os mesmos de `WIDGET_TITLES` e `WIDGET_TITLES_ES` em `src/lib/windows.ts`.
pub struct WidgetSpec {
    pub label: &'static str,
    pub title: &'static str,
    pub title_es: &'static str,
    pub width: f64,
    pub height: f64,
    pub min_width: f64,
    pub min_height: f64,
}

/// Lista fechada de widgets. Rótulo novo entra aqui, em `capabilities/widgets.json` e em `src/lib/windows.ts`.
pub const WIDGETS: &[WidgetSpec] = &[
    WidgetSpec { label: "preco", title: "Preço rápido", title_es: "Precio rápido", width: 360.0, height: 420.0, min_width: 280.0, min_height: 200.0 },
    WidgetSpec { label: "dossie", title: "Dossiê", title_es: "Dosier", width: 380.0, height: 480.0, min_width: 300.0, min_height: 240.0 },
    WidgetSpec { label: "relogio", title: "Relógio", title_es: "Reloj", width: 300.0, height: 220.0, min_width: 220.0, min_height: 140.0 },
    WidgetSpec { label: "alertas", title: "Alertas", title_es: "Alertas", width: 360.0, height: 420.0, min_width: 280.0, min_height: 200.0 },
    WidgetSpec { label: "despertador", title: "Despertador", title_es: "Despertador", width: 320.0, height: 360.0, min_width: 240.0, min_height: 180.0 },
    WidgetSpec { label: "lente", title: "Lente de mercado", title_es: "Lente de mercado", width: 380.0, height: 360.0, min_width: 280.0, min_height: 200.0 },
    WidgetSpec { label: "sessao", title: "Sessão", title_es: "Sesión", width: 320.0, height: 320.0, min_width: 240.0, min_height: 180.0 },
    WidgetSpec { label: "loot", title: "Loot", title_es: "Botín", width: 360.0, height: 420.0, min_width: 260.0, min_height: 200.0 },
];

impl WidgetSpec {
    fn titulo(&self, es: bool) -> &'static str {
        if es { self.title_es } else { self.title }
    }
}

/// Itens da bandeja que mudam de texto com a língua.
struct ItensBandeja {
    abrir: MenuItem<Wry>,
    widgets: Submenu<Wry>,
    /// Na ordem de `WIDGETS`.
    itens: Vec<MenuItem<Wry>>,
    mudo: CheckMenuItem<Wry>,
    sair: MenuItem<Wry>,
}

#[derive(Default)]
struct AppState {
    /// Fechar o painel esconde na bandeja em vez de sair (opção da tela de ajustes; padrão: sair).
    close_to_tray: AtomicBool,
    muted: AtomicBool,
    /// Língua da bandeja, dos títulos e das mensagens: espanhol (true) ou português (false, padrão). Vem do
    /// `config.lingua` ao iniciar e do comando `definir_lingua` (o painel resolve o "automático").
    espanhol: AtomicBool,
    bandeja: Mutex<Option<ItensBandeja>>,
}

/// Texto na língua atual do app (português ou espanhol).
fn tr(app: &AppHandle, pt: &str, es: &str) -> String {
    if espanhol(app) { es.to_string() } else { pt.to_string() }
}

fn espanhol(app: &AppHandle) -> bool {
    app.state::<AppState>().espanhol.load(Ordering::SeqCst)
}

/// Língua guardada na config (`lingua`: "pt", "es" ou "auto"). "auto" e ausente valem português até o painel
/// informar a língua do sistema. Pura.
fn espanhol_da_config(cfg: Option<&serde_json::Value>) -> bool {
    cfg.and_then(|c| c.get("lingua")).and_then(|v| v.as_str()) == Some("es")
}

fn titulo_janela(s: &WidgetSpec, es: bool) -> String {
    format!("Guarita · {}", s.titulo(es))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetInfo {
    label: &'static str,
    title: &'static str,
    open: bool,
    visible: bool,
}

fn spec_em(label: &str, es: bool) -> Result<&'static WidgetSpec, String> {
    WIDGETS.iter().find(|w| w.label == label).ok_or_else(|| {
        if es { format!("Widget desconocido: \"{label}\".") } else { format!("Widget desconhecido: \"{label}\".") }
    })
}

fn spec(label: &str) -> Result<&'static WidgetSpec, String> {
    spec_em(label, false)
}

/// `spec` com a mensagem de erro na língua do app.
fn spec_app(app: &AppHandle, label: &str) -> Result<&'static WidgetSpec, String> {
    spec_em(label, espanhol(app))
}

fn build_widget(app: &AppHandle, s: &WidgetSpec) -> tauri::Result<WebviewWindow> {
    // Primeira abertura em cascata (um widget não nasce em cima do outro); depois disso o window-state
    // restaura a posição salva por cima desta.
    let i = WIDGETS.iter().position(|w| w.label == s.label).unwrap_or(0) as f64;
    // Um bundle só: o front descobre qual widget desenhar pelo rótulo da janela (getCurrentWindow().label).
    WebviewWindowBuilder::new(app, s.label, WebviewUrl::App("index.html".into()))
        .title(titulo_janela(s, espanhol(app)))
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
    let s = spec_app(app, label)?;
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
    if let Some(item) = st.bandeja.lock().ok().and_then(|g| g.as_ref().map(|b| b.mudo.clone())) {
        let _ = item.set_checked(on);
    }
    let _ = app.emit(EV_VOZ_SILENCIADA, on);
}

/// Troca a língua do lado Rust: textos da bandeja e títulos das janelas abertas. As mensagens dos comandos leem
/// `AppState.espanhol` na hora.
fn aplicar_lingua(app: &AppHandle, es: bool) {
    app.state::<AppState>().espanhol.store(es, Ordering::SeqCst);
    let t = |pt: &'static str, es_txt: &'static str| if es { es_txt } else { pt };
    // Copia os itens e solta a trava antes de mexer no menu: set_text vai à thread principal e espera; se ela estiver
    // no on_menu_event → set_muted (que também trava `bandeja`), segurar a trava aqui travaria o app.
    let itens = app.state::<AppState>().bandeja.lock().ok().and_then(|g| {
        g.as_ref().map(|b| (b.abrir.clone(), b.widgets.clone(), b.itens.clone(), b.mudo.clone(), b.sair.clone()))
    });
    if let Some((abrir, widgets, itens, mudo, sair)) = itens {
        let _ = abrir.set_text(t("Abrir painel", "Abrir panel"));
        let _ = widgets.set_text("Widgets");
        for (item, s) in itens.iter().zip(WIDGETS) {
            let _ = item.set_text(s.titulo(es));
        }
        let _ = mudo.set_text(t("Silenciar voz", "Silenciar voz"));
        let _ = sair.set_text(t("Sair da Guarita", "Salir de la Guarita"));
    }
    for s in WIDGETS {
        if let Some(w) = app.get_webview_window(s.label) {
            let _ = w.set_title(&titulo_janela(s, es));
        }
    }
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
    spec_app(&app, &label)?;
    if let Some(w) = app.get_webview_window(&label) {
        w.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Traz o widget para a frente; erro se não estiver aberto.
#[tauri::command]
async fn widget_focus(app: AppHandle, label: String) -> Result<(), String> {
    spec_app(&app, &label)?;
    let w = app.get_webview_window(&label).ok_or_else(|| {
        tr(&app, &format!("O widget \"{label}\" não está aberto."), &format!("El widget \"{label}\" no está abierto."))
    })?;
    show_and_focus(&w);
    Ok(())
}

/// Abre se estiver fechado ou escondido; fecha se estiver visível. Devolve se ficou aberto.
#[tauri::command]
async fn widget_toggle(app: AppHandle, label: String) -> Result<bool, String> {
    spec_app(&app, &label)?;
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
    let es = espanhol(&app);
    WIDGETS
        .iter()
        .map(|s| {
            let w = app.get_webview_window(s.label);
            WidgetInfo {
                label: s.label,
                title: s.titulo(es),
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
        spec_app(&app, &label)?;
    }
    if on && !sbi_aceito(&app) {
        return Err(tr(
            &app,
            "Para fixar por cima do jogo, leia e aceite o aviso sobre a regra da Sandbox Interactive.",
            "Para fijar la ventana sobre el juego, lee y acepta el aviso sobre la regla de Sandbox Interactive.",
        ));
    }
    let w = app.get_webview_window(&label).ok_or_else(|| {
        tr(&app, &format!("A janela \"{label}\" não está aberta."), &format!("La ventana \"{label}\" no está abierta."))
    })?;
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

/// Língua efetiva do app ("pt" ou "es"; o painel resolve o "automático" pela língua do Windows): bandeja, títulos
/// das janelas e mensagens dos comandos. Outro valor vale português.
#[tauri::command]
async fn definir_lingua(app: AppHandle, lingua: String) {
    aplicar_lingua(&app, lingua == "es");
}

// ---------- bandeja ----------

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let es = espanhol(app);
    let t = |pt: &'static str, es_txt: &'static str| if es { es_txt } else { pt };
    let abrir = MenuItem::with_id(app, "painel", t("Abrir painel", "Abrir panel"), true, None::<&str>)?;
    let widgets = Submenu::with_id(app, "widgets", "Widgets", true)?;
    let mut itens = Vec::with_capacity(WIDGETS.len());
    for s in WIDGETS {
        let item = MenuItem::with_id(app, format!("w:{}", s.label), s.titulo(es), true, None::<&str>)?;
        widgets.append(&item)?;
        itens.push(item);
    }
    let mudo = CheckMenuItem::with_id(app, "silenciar", t("Silenciar voz", "Silenciar voz"), true, false, None::<&str>)?;
    let sair = MenuItem::with_id(app, "sair", t("Sair da Guarita", "Salir de la Guarita"), true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[&abrir, &widgets, &mudo, &PredefinedMenuItem::separator(app)?, &sair],
    )?;
    if let Ok(mut g) = app.state::<AppState>().bandeja.lock() {
        *g = Some(ItensBandeja { abrir, widgets, itens, mudo, sair });
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
            definir_lingua,
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
            // Língua escolhida explicitamente nos ajustes já vale para a bandeja; "automático" fica em português
            // até o painel informar a língua do Windows (definir_lingua, logo ao abrir).
            let es = app
                .handle()
                .store(CONFIG_STORE)
                .ok()
                .map(|s| espanhol_da_config(s.get("config").as_ref()))
                .unwrap_or(false);
            app.state::<AppState>().espanhol.store(es, Ordering::SeqCst);
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

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn lingua_da_config_so_espanhol_explicito() {
        let cfg = |v: serde_json::Value| espanhol_da_config(Some(&v));
        assert!(cfg(serde_json::json!({ "lingua": "es" })));
        assert!(!cfg(serde_json::json!({ "lingua": "pt" })));
        assert!(!cfg(serde_json::json!({ "lingua": "auto" })));
        assert!(!cfg(serde_json::json!({ "lingua": 3 })));
        assert!(!cfg(serde_json::json!({})));
        assert!(!espanhol_da_config(None));
    }

    /// Os títulos daqui (bandeja e janela) são os mesmos de `WIDGET_TITLES`/`WIDGET_TITLES_ES` do front.
    #[test]
    fn titulos_iguais_aos_do_front() {
        let ts = include_str!("../../src/lib/windows.ts");
        let bloco = |nome: &str| {
            let ini = ts.find(&format!("export const {nome}: Record<WidgetLabel, string> = {{")).expect(nome);
            let fim = ini + ts[ini..].find("};").unwrap();
            ts[ini..fim].to_string()
        };
        let (pt, es) = (bloco("WIDGET_TITLES"), bloco("WIDGET_TITLES_ES"));
        for s in WIDGETS {
            assert!(pt.contains(&format!("{}: '{}'", s.label, s.title)), "pt {}", s.label);
            assert!(es.contains(&format!("{}: '{}'", s.label, s.title_es)), "es {}", s.label);
        }
        assert_eq!(titulo_janela(&WIDGETS[0], false), "Guarita · Preço rápido");
        assert_eq!(titulo_janela(&WIDGETS[0], true), "Guarita · Precio rápido");
        assert!(spec_em("x", true).err().unwrap().starts_with("Widget desconocido"));
        assert!(spec_em("x", false).err().unwrap().starts_with("Widget desconhecido"));
    }
}
