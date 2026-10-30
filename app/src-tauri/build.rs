// Os comandos do app passam pelo sistema de permissões do Tauri: cada janela só chama o que a sua
// capability (capabilities/*.json) libera. Comando novo entra aqui E na capability de quem pode usá-lo.
const COMMANDS: &[&str] = &[
    "widget_open",
    "widget_close",
    "widget_focus",
    "widget_toggle",
    "widget_list",
    "widget_set_on_top",
    "widgets_hide_all",
    "widgets_show_all",
    "set_close_to_tray",
    "tray_set_muted",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("falha ao gerar o build do Tauri");
}
