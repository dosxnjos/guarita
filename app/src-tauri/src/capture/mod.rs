//! Captura passiva do PRÓPRIO jogador (desligada por padrão, opt-in com aviso). Lê, sem modo promíscuo, os
//! datagramas UDP que o servidor do jogo (porta 5056) manda ao PC do usuário, via Npcap carregado em tempo de
//! execução. Nada é enviado ao servidor do jogo e nada toca o processo do jogo.
//!
//! Fluxo: uma thread por interface de rede (Npcap, filtro BPF `udp port 5056`) → canal → uma thread de
//! processamento (Photon → Protocol18 → interpretador "só eu" → sessão) → eventos Tauri com agregados.
//! Só roda com a opção ligada e o app aberto; desligar para tudo em até ~0,5 s; fechar o app encerra as threads.
//!
//! Fronteira dos Termos (inviolável): eventos de outros jogadores são descartados no interpretador
//! (`albion.rs`); o front só recebe o `Retrato` (agregados do próprio jogador) e o `Estado` (números).

pub mod albion;
pub mod codigos;
pub mod npcap;
pub mod photon;
pub mod protocol18;
pub mod rede;
pub mod sessao;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError, SyncSender, TrySendError};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_store::StoreExt;

use albion::Interpretador;
use codigos::Tabela;
use photon::{Contagem, Parser};
use rede::Fluxo;
use sessao::{Dados, Retrato, Sessao};

/// Arquivo do store com a escolha do usuário (o front grava; o Rust confere o aceite antes de ligar).
pub const STORE: &str = "captura.json";
pub const CHAVE: &str = "captura";
/// Evento com o estado da captura (payload: `Estado`).
pub const EV_ESTADO: &str = "guarita://captura-estado";
/// Evento com o retrato da sessão (payload: `Retrato`).
pub const EV_SESSAO: &str = "guarita://captura-sessao";
pub const ARQUIVO_DIAGNOSTICO: &str = "captura-diagnostico.json";

/// O Windows junta datagramas antes do Npcap ver (URO): pacotes de até ~14 KB. Snaplen alto evita cortar.
const SNAPLEN: i32 = 262_144;
const ESPERA_MS: i32 = 500;
/// Sem pacote do jogo há tanto tempo → "aguardando o jogo".
const SEM_TRAFEGO_MS: u64 = 15_000;
const FILA: usize = 4096;
/// Fluxos guardados (cada servidor de jogo é um; troca de mapa troca o fluxo).
const MAX_FLUXOS: usize = 16;
/// Join de OUTRO personagem num fluxo diferente só troca o "eu" depois de o fluxo atual ficar este tempo sem
/// pacote (o jogador saiu do jogo ou trocou de personagem). Join do mesmo personagem troca na hora (troca de mapa).
const TROCA_FLUXO_MS: u64 = 10_000;
/// Mensagem quando todas as interfaces pararam sozinhas (suspensão do Windows, Wi-Fi reiniciado, adaptador sumiu).
const MSG_REDE_CAIU: &str =
    "A leitura da rede parou (o computador suspendeu, o Wi-Fi reiniciou ou a placa de rede sumiu). Ligue a captura de novo.";

fn agora_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Fase {
    Desligada,
    /// Npcap não instalado.
    SemNpcap,
    /// DLL do Npcap existe mas não carregou.
    NpcapInvalido,
    /// Nenhuma interface de rede listada.
    SemInterface,
    /// Interfaces listadas, nenhuma abriu (Npcap instalado só para administradores, por exemplo).
    SemPermissao,
    /// Capturando, mas sem tráfego do jogo.
    AguardandoJogo,
    /// Tráfego do jogo chegando, mas ainda sem a resposta do Join (precisa trocar de mapa uma vez).
    AguardandoMapa,
    Capturando,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TabelaInfo {
    pub versao: u32,
    pub atualizado_em: String,
    /// "embutida" ou "remota"
    pub origem: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Numeros {
    pub datagramas: u64,
    pub descartados_fila_cheia: u64,
    pub pacotes_photon: u64,
    pub pacotes_invalidos: u64,
    pub criptografados: u64,
    pub mensagens: u64,
    pub fatos_proprios: u64,
    // Sem contagem de eventos de outros jogadores aqui: este estado vai para a tela a cada 2 s, e um número que
    // sobe quando alguém age por perto seria um indicador de presença. Ela fica só no arquivo de diagnóstico.
}

/// Estado da captura para as telas (só números e textos do próprio app).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Estado {
    pub fase: Fase,
    pub mensagem: Option<String>,
    pub interfaces: u32,
    pub npcap_versao: Option<String>,
    pub tabela: TabelaInfo,
    pub identificado: bool,
    pub ultimo_pacote_em: Option<u64>,
    pub diagnostico: bool,
    pub arquivo_diagnostico: Option<String>,
    pub numeros: Numeros,
}

/// Parte compartilhada entre a thread de processamento e os comandos.
struct Nucleo {
    interp: Interpretador,
    origem_tabela: &'static str,
    sessao: Sessao,
    dados: Dados,
    fluxos: HashMap<Fluxo, Parser>,
    contagem: Contagem,
    datagramas: u64,
    fila_cheia: u64,
    ultimo_pacote_em: Option<u64>,
    sujo: bool,
    /// Fluxo (servidor do jogo → este PC) em que o Join do jogador foi visto. Com ele definido, só esse fluxo
    /// alimenta a sessão: tráfego de outro jogador que passe pelo PC (Hotspot Móvel, ICS) não vira "eu".
    fluxo_eu: Option<Fluxo>,
    ultimo_pacote_eu: u64,
    /// Mensagens de outro fluxo ignoradas (só para o arquivo de diagnóstico).
    ignorados_outro_fluxo: u64,
}

impl Nucleo {
    fn novo(interp: Interpretador, agora: u64) -> Self {
        Nucleo {
            interp,
            origem_tabela: "embutida",
            sessao: Sessao::nova(agora),
            dados: Dados::default(),
            fluxos: HashMap::new(),
            contagem: Contagem::default(),
            datagramas: 0,
            fila_cheia: 0,
            ultimo_pacote_em: None,
            sujo: false,
            fluxo_eu: None,
            ultimo_pacote_eu: 0,
            ignorados_outro_fluxo: 0,
        }
    }

    /// A mensagem deste fluxo pode chegar ao interpretador?
    fn aceita_do_fluxo(&self, fluxo: &Fluxo, m: &photon::Mensagem, agora: u64) -> bool {
        let Some(meu) = &self.fluxo_eu else { return true };
        if meu == fluxo {
            return true;
        }
        match self.interp.join_do_mesmo(m) {
            // O mesmo personagem entrou noutro servidor: troca de mapa.
            Some(true) => true,
            // Outro personagem: só se o fluxo atual parou (saiu do jogo, trocou de personagem).
            Some(false) => agora.saturating_sub(self.ultimo_pacote_eu) > TROCA_FLUXO_MS,
            None => false,
        }
    }

    fn processar(&mut self, fluxo: Fluxo, dados: &[u8], agora: u64) {
        self.datagramas += 1;
        self.ultimo_pacote_em = Some(agora);
        // O tempo da sessão só conta com o jogo do jogador mandando pacote (não desde que a captura ligou).
        if self.fluxo_eu.as_ref().map_or(true, |f| *f == fluxo) {
            self.ultimo_pacote_eu = agora;
            if self.sessao.retomar(agora) {
                self.sujo = true;
            }
        }
        if !self.fluxos.contains_key(&fluxo) {
            if self.fluxos.len() >= MAX_FLUXOS {
                self.fluxos.clear();
            }
            self.fluxos.insert(fluxo.clone(), Parser::default());
        }
        let Some(p) = self.fluxos.get_mut(&fluxo) else { return };
        let antes = p.contagem;
        let msgs = p.receber(dados);
        let depois = p.contagem;
        let c = &mut self.contagem;
        c.pacotes += depois.pacotes - antes.pacotes;
        c.pacotes_invalidos += depois.pacotes_invalidos - antes.pacotes_invalidos;
        c.criptografados += depois.criptografados - antes.criptografados;
        c.mensagens += depois.mensagens - antes.mensagens;
        c.mensagens_invalidas += depois.mensagens_invalidas - antes.mensagens_invalidas;
        c.fragmentos += depois.fragmentos - antes.fragmentos;
        for m in &msgs {
            if !self.aceita_do_fluxo(&fluxo, m, agora) {
                self.ignorados_outro_fluxo += 1;
                continue;
            }
            if let Some(f) = self.interp.processar(m) {
                if matches!(f, albion::Fato::Entrou { .. }) && self.fluxo_eu.as_ref() != Some(&fluxo) {
                    self.fluxo_eu = Some(fluxo.clone());
                    self.ultimo_pacote_eu = agora;
                    self.sessao.retomar(agora);
                }
                self.sessao.aplicar(&f, agora);
                self.sujo = true;
            }
        }
    }

    /// O jogo do jogador parou de mandar pacote: o tempo da sessão para no último pacote recebido.
    fn conferir_silencio(&mut self, agora: u64) {
        if self.sessao.ativa()
            && agora.saturating_sub(self.ultimo_pacote_eu) > SEM_TRAFEGO_MS
            && self.sessao.pausar(self.ultimo_pacote_eu)
        {
            self.sujo = true;
        }
    }

    /// A captura parou (desligou ou caiu): para o tempo, esquece os fluxos e a base da fama.
    fn parou(&mut self, agora: u64) {
        // Silêncio longo já foi pausado no último pacote por `conferir_silencio`; aqui só fecha o que está contando.
        self.sessao.pausar(agora);
        self.fluxos.clear();
        self.interp.pausou();
        self.sujo = true;
    }

    fn numeros(&self) -> Numeros {
        Numeros {
            datagramas: self.datagramas,
            descartados_fila_cheia: self.fila_cheia,
            pacotes_photon: self.contagem.pacotes,
            pacotes_invalidos: self.contagem.pacotes_invalidos,
            criptografados: self.contagem.criptografados,
            mensagens: self.contagem.mensagens,
            fatos_proprios: self.interp.diag.proprios.values().sum(),
        }
    }
}

struct Execucao {
    parar: Arc<AtomicBool>,
    threads: Vec<JoinHandle<()>>,
}

struct Controle {
    execucao: Option<Execucao>,
    /// Fase quando não está rodando (desligada, sem Npcap...).
    fase_parada: Fase,
    mensagem: Option<String>,
    interfaces: u32,
    npcap_versao: Option<String>,
    diagnostico: bool,
    porta: u16,
}

/// Estado gerenciado pelo Tauri (`app.manage`).
pub struct CapturaState {
    nucleo: Arc<Mutex<Nucleo>>,
    controle: Mutex<Controle>,
}

impl Default for CapturaState {
    fn default() -> Self {
        let tabela = Tabela::embutida();
        let porta = tabela.porta;
        Self {
            nucleo: Arc::new(Mutex::new(Nucleo::novo(Interpretador::new(tabela), agora_ms()))),
            controle: Mutex::new(Controle {
                execucao: None,
                fase_parada: Fase::Desligada,
                mensagem: None,
                interfaces: 0,
                npcap_versao: None,
                diagnostico: false,
                porta,
            }),
        }
    }
}

fn arquivo_diagnostico(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_log_dir().ok().map(|d| d.join(ARQUIVO_DIAGNOSTICO))
}

fn montar_estado(app: &AppHandle, st: &CapturaState) -> Estado {
    let c = st.controle.lock().unwrap_or_else(|e| e.into_inner());
    let n = st.nucleo.lock().unwrap_or_else(|e| e.into_inner());
    let rodando = c.execucao.is_some();
    let agora = agora_ms();
    let fase = if !rodando {
        c.fase_parada
    } else if n.ultimo_pacote_em.map_or(true, |t| agora.saturating_sub(t) > SEM_TRAFEGO_MS) {
        Fase::AguardandoJogo
    } else if !n.interp.identificado() {
        Fase::AguardandoMapa
    } else {
        Fase::Capturando
    };
    Estado {
        fase,
        mensagem: c.mensagem.clone(),
        interfaces: c.interfaces,
        npcap_versao: c.npcap_versao.clone(),
        tabela: TabelaInfo {
            versao: n.interp.tabela.versao,
            atualizado_em: n.interp.tabela.atualizado_em.clone(),
            origem: n.origem_tabela,
        },
        identificado: n.interp.identificado(),
        ultimo_pacote_em: n.ultimo_pacote_em,
        diagnostico: c.diagnostico,
        arquivo_diagnostico: if c.diagnostico {
            arquivo_diagnostico(app).map(|p| p.display().to_string())
        } else {
            None
        },
        numeros: n.numeros(),
    }
}

fn emitir_estado(app: &AppHandle) {
    let st = app.state::<CapturaState>();
    let _ = app.emit(EV_ESTADO, montar_estado(app, &st));
}

fn retrato(st: &CapturaState) -> Retrato {
    let n = st.nucleo.lock().unwrap_or_else(|e| e.into_inner());
    n.sessao.retrato(&n.dados, agora_ms())
}

fn gravar_diagnostico(app: &AppHandle, nucleo: &Arc<Mutex<Nucleo>>) {
    let Some(caminho) = arquivo_diagnostico(app) else { return };
    let json = {
        let n = nucleo.lock().unwrap_or_else(|e| e.into_inner());
        let mut extra = serde_json::to_value(n.numeros()).unwrap_or_default();
        extra["ignoradosDeOutroFluxo"] = n.ignorados_outro_fluxo.into();
        n.interp.diagnostico_json(extra)
    };
    if let Some(d) = caminho.parent() {
        let _ = std::fs::create_dir_all(d);
    }
    let mut v = json;
    v["gravadoEm"] = agora_ms().into();
    if let Err(e) = std::fs::write(&caminho, serde_json::to_vec_pretty(&v).unwrap_or_default()) {
        log::warn!("captura: não gravei o diagnóstico: {e}");
    }
}

/// O usuário leu e aceitou o aviso da captura? (`captura.json` → `captura.avisoAceitoEm`)
fn aviso_aceito(app: &AppHandle) -> bool {
    app.store(STORE)
        .ok()
        .and_then(|s| s.get(CHAVE))
        .and_then(|c| c.get("avisoAceitoEm").and_then(|v| v.as_str().map(|s| !s.is_empty())))
        .unwrap_or(false)
}

fn ligar(app: &AppHandle) -> Result<(), String> {
    if !aviso_aceito(app) {
        return Err("Para ligar a captura, leia e aceite o aviso sobre a leitura do tráfego de rede.".into());
    }
    let st = app.state::<CapturaState>();
    let mut c = st.controle.lock().map_err(|e| e.to_string())?;
    if let Some(e) = &c.execucao {
        // Execução cujas threads já morreram (a rede caiu) não conta como ligada: liga de novo.
        if !e.threads.iter().all(|t| t.is_finished()) {
            return Ok(());
        }
        c.execucao = None;
    }
    c.mensagem = None;
    c.interfaces = 0;
    let npcap = match npcap::Npcap::carregar() {
        Ok(n) => n,
        Err(npcap::FalhaCarga::NaoEncontrado) => {
            c.fase_parada = Fase::SemNpcap;
            return Ok(());
        }
        Err(npcap::FalhaCarga::Invalido(e)) => {
            c.fase_parada = Fase::NpcapInvalido;
            c.mensagem = Some(e);
            return Ok(());
        }
    };
    c.npcap_versao = Some(npcap.versao.clone());
    let lista = match npcap.interfaces() {
        Ok(l) => l,
        Err(e) => {
            c.fase_parada = Fase::SemPermissao;
            c.mensagem = Some(e);
            return Ok(());
        }
    };
    if lista.is_empty() {
        c.fase_parada = Fase::SemInterface;
        return Ok(());
    }

    let parar = Arc::new(AtomicBool::new(false));
    let (tx, rx) = mpsc::sync_channel::<(Fluxo, Vec<u8>)>(FILA);
    let (tx_ab, rx_ab) = mpsc::channel::<Result<(), String>>();
    let filtro = format!("udp port {}", c.porta);
    let mut threads = Vec::new();
    for i in &lista {
        let (npcap, parar, tx, tx_ab, nome, filtro, porta, nucleo) = (
            npcap.clone(),
            parar.clone(),
            tx.clone(),
            tx_ab.clone(),
            i.nome.clone(),
            filtro.clone(),
            c.porta,
            st.nucleo.clone(),
        );
        let t = std::thread::Builder::new()
            .name("guarita-captura-if".into())
            .spawn(move || ler_interface(npcap, &nome, &filtro, porta, parar, tx, tx_ab, nucleo))
            .map_err(|e| e.to_string())?;
        threads.push(t);
    }
    drop(tx);
    drop(tx_ab);

    // Espera cada interface dizer se abriu (open_live é rápido; teto de 5 s).
    let mut abertas = 0u32;
    let mut erros = Vec::new();
    for _ in 0..lista.len() {
        match rx_ab.recv_timeout(Duration::from_secs(5)) {
            Ok(Ok(())) => abertas += 1,
            Ok(Err(e)) => erros.push(e),
            Err(_) => break,
        }
    }
    if abertas == 0 {
        parar.store(true, Ordering::SeqCst);
        for t in threads {
            let _ = t.join();
        }
        c.fase_parada = Fase::SemPermissao;
        c.mensagem = erros.into_iter().next();
        return Ok(());
    }
    c.interfaces = abertas;
    log::info!("captura ligada: {abertas} de {} interfaces abertas (Npcap {})", lista.len(), npcap.versao);

    // O tempo da sessão só começa a contar quando o primeiro pacote do jogo chegar (Nucleo::processar).
    st.nucleo.lock().map_err(|e| e.to_string())?.sujo = true;
    let (app2, parar2, nucleo) = (app.clone(), parar.clone(), st.nucleo.clone());
    let t = std::thread::Builder::new()
        .name("guarita-captura".into())
        .spawn(move || processar(app2, nucleo, rx, parar2))
        .map_err(|e| e.to_string())?;
    threads.push(t);
    c.execucao = Some(Execucao { parar, threads });
    c.fase_parada = Fase::Desligada;
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn ler_interface(
    npcap: Arc<npcap::Npcap>,
    nome: &str,
    filtro: &str,
    porta: u16,
    parar: Arc<AtomicBool>,
    tx: SyncSender<(Fluxo, Vec<u8>)>,
    tx_ab: mpsc::Sender<Result<(), String>>,
    nucleo: Arc<Mutex<Nucleo>>,
) {
    let mut cap = match npcap.abrir(nome, filtro, SNAPLEN, ESPERA_MS) {
        Ok(c) => {
            let _ = tx_ab.send(Ok(()));
            c
        }
        Err(e) => {
            // VPN (Wintun) e adaptadores virtuais costumam recusar: normal, segue com as outras.
            log::info!("captura: interface {nome} não abriu: {e}");
            let _ = tx_ab.send(Err(e));
            return;
        }
    };
    drop(tx_ab);
    let enlace = cap.enlace();
    let mut erros_seguidos = 0;
    while !parar.load(Ordering::Relaxed) {
        match cap.proximo() {
            npcap::Leitura::Pacote(q) => {
                erros_seguidos = 0;
                let Some(u) = rede::udp(enlace, q) else { continue };
                // Só o que o servidor do jogo manda ao PC (origem 5056); o que o PC envia não interessa.
                if u.fluxo.porta_origem != porta {
                    continue;
                }
                match tx.try_send((u.fluxo, u.dados.to_vec())) {
                    Ok(()) => {}
                    Err(TrySendError::Full(_)) => {
                        if let Ok(mut n) = nucleo.lock() {
                            n.fila_cheia += 1;
                        }
                    }
                    Err(TrySendError::Disconnected(_)) => break,
                }
            }
            npcap::Leitura::Nada => {}
            npcap::Leitura::Erro(e) => {
                erros_seguidos += 1;
                if erros_seguidos == 1 {
                    log::warn!("captura: erro lendo {nome}: {e}");
                }
                if erros_seguidos > 20 {
                    break; // adaptador sumiu (desconectou o cabo, VPN caiu)
                }
                std::thread::sleep(Duration::from_millis(250));
            }
        }
    }
}

fn processar(app: AppHandle, nucleo: Arc<Mutex<Nucleo>>, rx: mpsc::Receiver<(Fluxo, Vec<u8>)>, parar: Arc<AtomicBool>) {
    let mut ultimo_retrato = 0u64;
    let mut ultimo_estado = 0u64;
    let mut ultimo_diag = agora_ms();
    loop {
        match rx.recv_timeout(Duration::from_millis(250)) {
            Ok((fluxo, dados)) => {
                if let Ok(mut n) = nucleo.lock() {
                    n.processar(fluxo, &dados, agora_ms());
                }
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => break,
        }
        if parar.load(Ordering::Relaxed) {
            break;
        }
        let agora = agora_ms();
        if let Ok(mut n) = nucleo.lock() {
            n.conferir_silencio(agora);
        }
        if agora.saturating_sub(ultimo_retrato) >= 500 {
            let r = nucleo.lock().ok().and_then(|mut n| {
                if !n.sujo {
                    return None;
                }
                n.sujo = false;
                Some(n.sessao.retrato(&n.dados, agora))
            });
            if let Some(r) = r {
                let _ = app.emit(EV_SESSAO, r);
                ultimo_retrato = agora;
            }
        }
        if agora.saturating_sub(ultimo_estado) >= 2_000 {
            emitir_estado(&app);
            ultimo_estado = agora;
        }
        let diag = app.state::<CapturaState>().controle.lock().map(|c| c.diagnostico).unwrap_or(false);
        if diag && agora.saturating_sub(ultimo_diag) >= 30_000 {
            gravar_diagnostico(&app, &nucleo);
            ultimo_diag = agora;
        }
    }
    if !parar.load(Ordering::SeqCst) {
        // Todas as threads de interface saíram sozinhas (canal desconectado): a captura caiu.
        captura_caiu(&app, &parar);
    }
}

/// A captura parou sem o usuário pedir: sai do estado "ligada", diz o motivo e para o tempo da sessão. O
/// "Tentar de novo" do painel liga de novo. (Reabrir sozinho com espera crescente fica para outra versão.)
fn captura_caiu(app: &AppHandle, parar: &Arc<AtomicBool>) {
    let st = app.state::<CapturaState>();
    // Ordem das travas: controle, depois núcleo (nunca as duas juntas aqui).
    let caiu = {
        let mut c = st.controle.lock().unwrap_or_else(|e| e.into_inner());
        // Só se a execução registrada ainda é esta (o usuário pode ter desligado e ligado no meio).
        if c.execucao.as_ref().is_some_and(|e| Arc::ptr_eq(&e.parar, parar)) {
            c.execucao = None; // as threads já terminaram (esta é a última); os handles se soltam
            c.fase_parada = Fase::SemInterface;
            c.mensagem = Some(MSG_REDE_CAIU.into());
            c.interfaces = 0;
            true
        } else {
            false
        }
    };
    if !caiu {
        return;
    }
    log::warn!("captura: todas as interfaces pararam; captura desligada");
    st.nucleo.lock().unwrap_or_else(|e| e.into_inner()).parou(agora_ms());
    let _ = app.emit(EV_SESSAO, retrato(&st));
    emitir_estado(app);
}

fn desligar(app: &AppHandle) {
    let st = app.state::<CapturaState>();
    let exec = {
        let mut c = st.controle.lock().unwrap_or_else(|e| e.into_inner());
        c.fase_parada = Fase::Desligada;
        c.mensagem = None;
        c.interfaces = 0;
        c.execucao.take()
    };
    if let Some(e) = exec {
        e.parar.store(true, Ordering::SeqCst);
        for t in e.threads {
            let _ = t.join();
        }
        log::info!("captura desligada");
    }
    st.nucleo.lock().unwrap_or_else(|e| e.into_inner()).parou(agora_ms());
    let diag = st.controle.lock().map(|c| c.diagnostico).unwrap_or(false);
    if diag {
        gravar_diagnostico(app, &st.nucleo);
    }
    let _ = app.emit(EV_SESSAO, retrato(&st));
}

// ---------- comandos (permissões em build.rs + capabilities/*.json) ----------

/// Estado atual (fase, números, tabela de códigos em uso).
#[tauri::command]
pub async fn captura_estado(app: AppHandle) -> Estado {
    let st = app.state::<CapturaState>();
    montar_estado(&app, &st)
}

/// Retrato atual da sessão.
#[tauri::command]
pub async fn captura_sessao(app: AppHandle) -> Retrato {
    retrato(&app.state::<CapturaState>())
}

/// Liga a captura (exige o aviso aceito). Sem Npcap ou sem interface, não é erro: o estado diz o que falta.
#[tauri::command]
pub async fn captura_ligar(app: AppHandle) -> Result<Estado, String> {
    let a = app.clone();
    tauri::async_runtime::spawn_blocking(move || ligar(&a))
        .await
        .map_err(|e| e.to_string())??;
    emitir_estado(&app);
    let st = app.state::<CapturaState>();
    Ok(montar_estado(&app, &st))
}

/// Desliga a captura (as threads param em até ~0,5 s). A sessão fica, pausada.
#[tauri::command]
pub async fn captura_desligar(app: AppHandle) -> Estado {
    let a = app.clone();
    let _ = tauri::async_runtime::spawn_blocking(move || desligar(&a)).await;
    emitir_estado(&app);
    let st = app.state::<CapturaState>();
    montar_estado(&app, &st)
}

/// Zera a sessão (prata, fama, loot, mortes, tempo).
#[tauri::command]
pub async fn captura_nova_sessao(app: AppHandle) -> Retrato {
    let st = app.state::<CapturaState>();
    let rodando = st.controle.lock().map(|c| c.execucao.is_some()).unwrap_or(false);
    {
        let mut n = st.nucleo.lock().unwrap_or_else(|e| e.into_inner());
        let mapa_atual = n.sessao.retrato(&n.dados, agora_ms()).zona.map(|z| z.id);
        let agora = agora_ms();
        n.sessao = Sessao::nova(agora);
        // A fama total vista antes da sessão nova não pode virar ganho dela.
        n.interp.pausou();
        if let Some(m) = mapa_atual {
            n.sessao.aplicar(&albion::Fato::Zona { mapa: m }, agora);
        }
        // Conta tempo já se o jogo está mandando pacote; senão, a partir do próximo pacote.
        if rodando && agora.saturating_sub(n.ultimo_pacote_eu) <= SEM_TRAFEGO_MS {
            n.sessao.retomar(agora);
        }
    }
    let r = retrato(&st);
    let _ = app.emit(EV_SESSAO, r.clone());
    r
}

/// Tabela de códigos baixada pelo painel; vale se for válida e de versão maior que a atual.
#[tauri::command]
pub async fn captura_definir_codigos(app: AppHandle, json: String) -> Result<TabelaInfo, String> {
    let t = Tabela::de_json_remota(&json, Tabela::embutida().versao)?;
    let st = app.state::<CapturaState>();
    // Ordem das travas sempre controle → núcleo (igual a montar_estado), para não travar.
    let mut c = st.controle.lock().map_err(|e| e.to_string())?;
    let mut n = st.nucleo.lock().map_err(|e| e.to_string())?;
    if t.versao > n.interp.tabela.versao {
        log::info!("captura: tabela de códigos v{} ({}) do GitHub", t.versao, t.atualizado_em);
        // A porta nova vale na próxima vez que a captura ligar (o filtro BPF já aberto não muda).
        c.porta = t.porta;
        n.interp.trocar_tabela(t);
        n.origem_tabela = "remota";
    }
    let info = TabelaInfo {
        versao: n.interp.tabela.versao,
        atualizado_em: n.interp.tabela.atualizado_em.clone(),
        origem: n.origem_tabela,
    };
    drop(n);
    drop(c);
    Ok(info)
}

/// Lista de itens (posição = índice numérico do item no jogo) e nomes de mapa, do ao-bin-dumps.
#[tauri::command]
pub async fn captura_definir_dados(app: AppHandle, itens: Vec<String>, zonas: HashMap<String, String>) {
    let st = app.state::<CapturaState>();
    {
        let mut n = st.nucleo.lock().unwrap_or_else(|e| e.into_inner());
        n.dados = Dados { itens, zonas };
        n.sujo = true;
    }
    let _ = app.emit(EV_SESSAO, retrato(&st));
}

/// Modo de diagnóstico: grava a contagem de eventos por código (sem conteúdo) a cada 30 s e ao desligar.
#[tauri::command]
pub async fn captura_diagnostico(app: AppHandle, ligado: bool) -> Estado {
    let st = app.state::<CapturaState>();
    if let Ok(mut c) = st.controle.lock() {
        c.diagnostico = ligado;
    }
    if ligado {
        gravar_diagnostico(&app, &st.nucleo);
    }
    let e = montar_estado(&app, &st);
    let _ = app.emit(EV_ESTADO, e.clone());
    e
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::capture::albion::testes::{join, MEU_NOME, MEU_OBJETO};
    use crate::capture::photon::montar;
    use crate::capture::protocol18::Valor;

    fn nucleo() -> Nucleo {
        Nucleo::novo(Interpretador::new(Tabela::embutida()), 0)
    }

    /// Mensagem Photon → (fluxo, conteúdo UDP) como a thread da interface entrega, com a porta de destino dada
    /// (portas diferentes = fluxos diferentes).
    fn datagrama(porta_destino: u16, msg: &[u8]) -> (Fluxo, Vec<u8>) {
        let q = rede::testes::quadro(5056, porta_destino, &montar::pacote(&[montar::confiavel(msg)]));
        let u = rede::udp(rede::DLT_EN10MB, &q).unwrap();
        (u.fluxo, u.dados.to_vec())
    }

    fn join_de(nome: &str, objeto: i64) -> Vec<u8> {
        montar::resposta(
            crate::capture::photon::MSG_RESPOSTA,
            2,
            &[(0, Valor::Long(objeto)), (2, Valor::Texto(nome.into())), (8, Valor::Texto("3004".into()))],
        )
    }

    fn loot_de(nome: &str, quantidade: i32) -> Vec<u8> {
        montar::evento(278, &[(2, Valor::Texto(nome.into())), (4, Valor::Int(3)), (5, Valor::Int(quantidade))])
    }

    /// Do quadro Ethernet ao retrato: o caminho inteiro da captura, sem o Npcap.
    #[test]
    fn quadro_ate_retrato_so_com_dados_proprios() {
        let mut n = nucleo();
        let fluxo_de = |dados: &[u8]| {
            let q = rede::testes::quadro(5056, 50_000, dados);
            let u = rede::udp(rede::DLT_EN10MB, &q).unwrap();
            (u.fluxo, u.dados.to_vec())
        };
        let msgs = vec![
            join(),
            montar::evento(
                29,
                &[(1, Valor::Texto("Outro".into())), (12, Valor::Lista(vec![Valor::Float(1.0), Valor::Float(2.0)]))],
            ),
            montar::evento(62, &[(0, Valor::Long(MEU_OBJETO)), (3, Valor::Long(5_000_000))]),
            montar::evento(
                278,
                &[(2, Valor::Texto(MEU_NOME.into())), (3, Valor::Bool(false)), (4, Valor::Int(3)), (5, Valor::Int(2))],
            ),
            montar::evento(278, &[(2, Valor::Texto("Outro".into())), (4, Valor::Int(3)), (5, Valor::Int(50))]),
        ];
        for (i, m) in msgs.iter().enumerate() {
            let (f, d) = fluxo_de(&montar::pacote(&[montar::confiavel(m)]));
            n.processar(f, &d, 1_000 * (i as u64 + 1));
        }
        n.dados = Dados { itens: vec!["".into(), "A".into(), "B".into(), "T4_BAG".into()], zonas: HashMap::new() };
        let r = n.sessao.retrato(&n.dados, 60_000);
        assert_eq!(r.prata, 500.0);
        assert_eq!(r.loot.len(), 1);
        assert_eq!(r.loot[0].item_id.as_deref(), Some("T4_BAG"));
        assert_eq!(r.loot[0].quantidade, 2);
        let json = serde_json::to_string(&r).unwrap();
        assert!(!json.contains("Outro") && !json.contains(MEU_NOME), "retrato vazou nome: {json}");
        assert_eq!(n.interp.diag.descartados_de_outros, 1);
        // O estado que vai para a tela a cada 2 s não leva a contagem de outros jogadores (seria sinal de presença).
        let numeros = serde_json::to_string(&n.numeros()).unwrap();
        assert!(!numeros.contains("utros"), "estado com contagem de outros jogadores: {numeros}");
        assert_eq!(n.datagramas, 5);
    }

    /// O tempo conta do primeiro pacote do jogo, para no último quando o tráfego some e volta com ele.
    #[test]
    fn tempo_so_conta_com_trafego_do_jogo() {
        let mut n = nucleo();
        assert_eq!(n.sessao.duracao(3_600_000), 0, "captura ligada sem jogo aberto não conta tempo");
        let (f, d) = datagrama(50_000, &join());
        n.processar(f, &d, 7_200_000);
        let (f, d) = datagrama(50_000, &montar::evento(1, &[]));
        n.processar(f, &d, 7_260_000);
        n.conferir_silencio(7_270_000);
        assert!(n.sessao.ativa(), "10 s sem pacote ainda é jogo aberto");
        n.conferir_silencio(7_300_000);
        assert!(!n.sessao.ativa());
        assert_eq!(n.sessao.duracao(9_000_000), 60_000, "para no último pacote, não na hora da conferência");
        let (f, d) = datagrama(50_000, &montar::evento(1, &[]));
        n.processar(f, &d, 9_000_000);
        assert_eq!(n.sessao.duracao(9_030_000), 90_000);
    }

    /// Desligar e ligar de novo: a fama ganha no meio não entra de uma vez.
    #[test]
    fn parar_zera_a_base_da_fama() {
        let mut n = nucleo();
        let fama = |total: i64, ganho: i64| {
            montar::evento(82, &[(0, Valor::Long(MEU_OBJETO)), (1, Valor::Long(total)), (2, Valor::Long(ganho))])
        };
        for (i, m) in [join(), fama(10_000_000_000, 10_000)].iter().enumerate() {
            let (f, d) = datagrama(50_000, m);
            n.processar(f, &d, 1_000 + i as u64);
        }
        n.parou(2_000);
        let (f, d) = datagrama(50_000, &fama(30_000_000_000, 10_000));
        n.processar(f, &d, 3_600_000);
        assert_eq!(n.sessao.retrato(&n.dados, 3_600_000).fama, 2.0);
    }

    /// Hotspot/ICS: o Join de outro personagem noutro fluxo não troca o "eu" enquanto o fluxo do jogador está
    /// vivo, e o loot dele não entra. Troca de mapa do mesmo personagem (outro fluxo) continua valendo.
    #[test]
    fn identidade_presa_ao_fluxo_do_jogador() {
        fn manda(n: &mut Nucleo, t: &mut u64, porta: u16, msg: Vec<u8>) {
            *t += 1_000;
            let (f, d) = datagrama(porta, &msg);
            n.processar(f, &d, *t);
        }
        let mut n = nucleo();
        let mut t = 1_000u64;
        manda(&mut n, &mut t, 50_000, join());
        manda(&mut n, &mut t, 50_000, loot_de(MEU_NOME, 2));
        // Outro jogador roteado pelo PC: Join e loot dele noutro fluxo.
        manda(&mut n, &mut t, 60_000, join_de("Vizinho", 9_999));
        manda(&mut n, &mut t, 60_000, loot_de("Vizinho", 50));
        manda(&mut n, &mut t, 50_000, loot_de(MEU_NOME, 1));
        let r = n.sessao.retrato(&n.dados, t);
        assert_eq!(r.loot.iter().map(|l| l.quantidade).sum::<i64>(), 3, "loot do vizinho entrou: {:?}", r.loot);
        assert!(n.ignorados_outro_fluxo >= 2);
        // O jogador troca de mapa: servidor novo (outro fluxo), Join com o mesmo nome → passa a valer na hora.
        manda(&mut n, &mut t, 50_002, join());
        manda(&mut n, &mut t, 50_002, loot_de(MEU_NOME, 4));
        assert_eq!(n.sessao.retrato(&n.dados, t).loot[0].quantidade, 7);
        // O fluxo do jogador para; passado o prazo, outro personagem pode virar o "eu" (troca de personagem).
        t += TROCA_FLUXO_MS + 1;
        manda(&mut n, &mut t, 50_003, join_de("OutroPersonagem", 5));
        manda(&mut n, &mut t, 50_003, loot_de("OutroPersonagem", 1));
        assert_eq!(n.sessao.retrato(&n.dados, t).loot[0].quantidade, 8);
    }
}
