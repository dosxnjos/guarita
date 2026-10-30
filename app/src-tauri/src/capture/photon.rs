//! Camada Photon (por cima do UDP): cabeçalho do pacote, comandos e remontagem de fragmentos. Código próprio,
//! escrito a partir do formato (conferido em 30/10/2026 no `albiondata-client`, MIT):
//!
//! ```text
//! pacote   = peerId u16 BE | flags u8 | nComandos u8 | timestamp u32 BE | challenge i32 BE | [crc u32 BE se flags=0xCC] | comando*
//! comando  = tipo u8 | canal u8 | flags u8 | reservado u8 | tamanho u32 BE (com estes 12 bytes) | seqConfiavel u32 BE | corpo
//! corpo 6  = mensagem (confiável)
//! corpo 7  = seqNaoConfiavel u32 | mensagem (não confiável)
//! corpo 8  = seqInicial u32 | nFragmentos u32 | nºFragmento u32 | tamanhoTotal u32 | deslocamento u32 | dados (fragmento)
//! mensagem = sinal u8 | tipo u8 (2 requisição, 3 ou 7 resposta, 4 evento; bit 0x80 = criptografada) | dados
//! ```
//!
//! Um datagrama UDP pode trazer mais de um pacote Photon colado (o Windows junta datagramas, "URO"): depois do
//! último comando, se sobrar um cabeçalho com o mesmo peerId e challenge, é outro pacote.

use std::collections::{HashMap, HashSet, VecDeque};

use super::protocol18::{ler_parametros, ler_valor, Erro, Leitor, Parametros};

pub const CABECALHO: usize = 12;
pub const CABECALHO_COMANDO: usize = 12;
pub const CABECALHO_FRAGMENTO: usize = 20;
pub const FLAG_CRIPTOGRAFADO: u8 = 1;
pub const FLAG_CRC: u8 = 0xCC;

pub const CMD_CONFIAVEL: u8 = 6;
pub const CMD_NAO_CONFIAVEL: u8 = 7;
pub const CMD_FRAGMENTO: u8 = 8;

pub const MSG_REQUISICAO: u8 = 2;
pub const MSG_RESPOSTA: u8 = 3;
pub const MSG_EVENTO: u8 = 4;
pub const MSG_RESPOSTA_ALT: u8 = 7;

/// Remontagens em aberto ao mesmo tempo (fragmento perdido não pode acumular memória para sempre).
pub const MAX_REMONTAGENS: usize = 64;
/// Maior mensagem fragmentada aceita (as do Albion ficam em dezenas de KB).
pub const MAX_TOTAL_FRAGMENTADO: usize = 1 << 20;
/// Bytes de fragmento guardados ao mesmo tempo num fluxo (somando todas as remontagens abertas). Passou, a
/// remontagem mais velha sai. Com `MAX_FLUXOS` = 16 no núcleo, o teto geral fica em 32 MB.
pub const MAX_BYTES_ABERTOS: usize = 2 << 20;

/// Uma mensagem Photon já desserializada.
#[derive(Debug, Clone, PartialEq)]
pub enum Mensagem {
    Requisicao { op: u8, params: Parametros },
    Resposta { op: u8, retorno: i16, params: Parametros },
    Evento { codigo: u8, params: Parametros },
}

/// Contadores do que passou pelo parser (só números, para o diagnóstico).
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct Contagem {
    pub pacotes: u64,
    pub pacotes_invalidos: u64,
    pub criptografados: u64,
    pub mensagens: u64,
    pub mensagens_invalidas: u64,
    pub fragmentos: u64,
}

/// Uma mensagem fragmentada em montagem. Guarda só os pedaços que chegaram (nada é reservado pelo tamanho total
/// que o pacote declara); o buffer inteiro só nasce quando todos os pedaços estão aqui e somam o total.
struct Remontagem {
    total: usize,
    n_fragmentos: u32,
    recebidos: HashSet<u32>,
    pecas: Vec<(usize, Vec<u8>)>,
    bytes: usize,
}

/// Parser de um fluxo (um par endereço:porta). Guarda as remontagens de fragmento em aberto.
#[derive(Default)]
pub struct Parser {
    remontagens: HashMap<u32, Remontagem>,
    /// Ordem de chegada das remontagens abertas (a mais velha sai primeiro); sempre os mesmos `seq` do mapa.
    ordem: VecDeque<u32>,
    /// Soma de `bytes` das remontagens abertas.
    bytes_abertos: usize,
    pub contagem: Contagem,
}

fn u16_be(b: &[u8], i: usize) -> u16 {
    u16::from_be_bytes([b[i], b[i + 1]])
}

fn u32_be(b: &[u8], i: usize) -> u32 {
    u32::from_be_bytes([b[i], b[i + 1], b[i + 2], b[i + 3]])
}

/// CRC32 do Photon (polinômio IEEE refletido, sem XOR final), calculado com o campo do CRC zerado.
pub fn crc_photon(dados: &[u8]) -> u32 {
    let mut c: u32 = 0xFFFF_FFFF;
    for &b in dados {
        c ^= b as u32;
        for _ in 0..8 {
            c = if c & 1 != 0 { (c >> 1) ^ 0xEDB8_8320 } else { c >> 1 };
        }
    }
    c
}

impl Parser {
    #[cfg(test)]
    pub fn new() -> Self {
        Self::default()
    }

    /// Processa um datagrama UDP inteiro e devolve as mensagens completas encontradas.
    pub fn receber(&mut self, datagrama: &[u8]) -> Vec<Mensagem> {
        let mut out = Vec::new();
        if datagrama.len() < CABECALHO {
            self.contagem.pacotes_invalidos += 1;
            return out;
        }
        let peer = u16_be(datagrama, 0);
        let challenge = u32_be(datagrama, 8);
        let mut ini = 0;
        while ini + CABECALHO <= datagrama.len() {
            if ini > 0 && (u16_be(datagrama, ini) != peer || u32_be(datagrama, ini + 8) != challenge) {
                self.contagem.pacotes_invalidos += 1;
                break;
            }
            match self.pacote(&datagrama[ini..], &mut out) {
                Some(n) if n > 0 => ini += n,
                _ => break,
            }
        }
        out
    }

    /// Processa um pacote Photon no início de `b`; devolve quantos bytes ele ocupou (None = inválido ou fim).
    fn pacote(&mut self, b: &[u8], out: &mut Vec<Mensagem>) -> Option<usize> {
        self.contagem.pacotes += 1;
        let flags = b[2];
        let n_cmd = b[3] as usize;
        if flags == FLAG_CRIPTOGRAFADO {
            // Pacote inteiro criptografado: não há como saber onde termina; descarta o resto do datagrama.
            self.contagem.criptografados += 1;
            return None;
        }
        let mut pos = CABECALHO;
        if flags == FLAG_CRC {
            if b.len() < CABECALHO + 4 {
                self.contagem.pacotes_invalidos += 1;
                return None;
            }
            let fim = self.fim_do_pacote(b, CABECALHO + 4, n_cmd)?;
            let crc = u32_be(b, CABECALHO);
            let mut copia = b[..fim].to_vec();
            copia[CABECALHO..CABECALHO + 4].fill(0);
            if crc_photon(&copia) != crc {
                self.contagem.pacotes_invalidos += 1;
                return None;
            }
            pos += 4;
        }
        for _ in 0..n_cmd {
            if b.len() < pos + CABECALHO_COMANDO {
                self.contagem.pacotes_invalidos += 1;
                return None;
            }
            let tipo = b[pos];
            let tam = u32_be(b, pos + 4) as usize;
            if tam < CABECALHO_COMANDO || b.len() < pos + tam {
                self.contagem.pacotes_invalidos += 1;
                return None;
            }
            let corpo = &b[pos + CABECALHO_COMANDO..pos + tam];
            match tipo {
                CMD_CONFIAVEL => self.mensagem(corpo, out),
                CMD_NAO_CONFIAVEL if corpo.len() >= 4 => self.mensagem(&corpo[4..], out),
                CMD_FRAGMENTO => self.fragmento(corpo, out),
                _ => {} // ack, ping, conectar, desconectar...: nada a ler
            }
            pos += tam;
        }
        Some(pos)
    }

    /// Onde termina o pacote (soma dos tamanhos dos comandos), sem ler o conteúdo.
    fn fim_do_pacote(&mut self, b: &[u8], mut pos: usize, n_cmd: usize) -> Option<usize> {
        for _ in 0..n_cmd {
            if b.len() < pos + CABECALHO_COMANDO {
                self.contagem.pacotes_invalidos += 1;
                return None;
            }
            let tam = u32_be(b, pos + 4) as usize;
            if tam < CABECALHO_COMANDO || b.len() < pos + tam {
                self.contagem.pacotes_invalidos += 1;
                return None;
            }
            pos += tam;
        }
        Some(pos)
    }

    fn fragmento(&mut self, c: &[u8], out: &mut Vec<Mensagem>) {
        if c.len() < CABECALHO_FRAGMENTO {
            self.contagem.mensagens_invalidas += 1;
            return;
        }
        self.contagem.fragmentos += 1;
        let seq = u32_be(c, 0);
        let n_frag = u32_be(c, 4);
        let num = u32_be(c, 8);
        let total = u32_be(c, 12) as usize;
        let desloc = u32_be(c, 16) as usize;
        let dados = &c[CABECALHO_FRAGMENTO..];
        if total == 0 || total > MAX_TOTAL_FRAGMENTADO || n_frag == 0 || num >= n_frag || desloc + dados.len() > total {
            self.contagem.mensagens_invalidas += 1;
            return;
        }
        if !self.remontagens.contains_key(&seq) {
            if self.remontagens.len() >= MAX_REMONTAGENS {
                self.descartar_mais_velha();
            }
            self.remontagens.insert(
                seq,
                Remontagem { total, n_fragmentos: n_frag, recebidos: HashSet::new(), pecas: Vec::new(), bytes: 0 },
            );
            self.ordem.push_back(seq);
        }
        let Some(r) = self.remontagens.get_mut(&seq) else { return };
        if r.total != total || r.n_fragmentos != n_frag {
            self.contagem.mensagens_invalidas += 1;
            return;
        }
        // Reenvio (o Photon repete comandos confiáveis) não conta duas vezes.
        if !r.recebidos.insert(num) {
            return;
        }
        r.pecas.push((desloc, dados.to_vec()));
        r.bytes += dados.len();
        let completa = r.recebidos.len() as u32 == r.n_fragmentos;
        self.bytes_abertos += dados.len();
        if completa {
            self.concluir(seq, out);
            return;
        }
        // Orçamento de bytes do fluxo: fragmento perdido ou forjado não segura memória; sai a mais velha.
        while self.bytes_abertos > MAX_BYTES_ABERTOS && !self.remontagens.is_empty() {
            self.descartar_mais_velha();
        }
    }

    fn tirar(&mut self, seq: u32) -> Option<Remontagem> {
        let r = self.remontagens.remove(&seq)?;
        self.bytes_abertos = self.bytes_abertos.saturating_sub(r.bytes);
        self.ordem.retain(|s| *s != seq);
        Some(r)
    }

    fn descartar_mais_velha(&mut self) {
        while let Some(velha) = self.ordem.pop_front() {
            if let Some(r) = self.remontagens.remove(&velha) {
                self.bytes_abertos = self.bytes_abertos.saturating_sub(r.bytes);
                return;
            }
        }
    }

    /// Todos os pedaços chegaram: monta e lê. Pedaços que não somam o total declarado são recusados (o buffer
    /// nunca é maior que o que de fato chegou).
    fn concluir(&mut self, seq: u32, out: &mut Vec<Mensagem>) {
        let Some(r) = self.tirar(seq) else { return };
        if r.bytes != r.total {
            self.contagem.mensagens_invalidas += 1;
            return;
        }
        let mut buf = vec![0u8; r.total];
        for (desloc, d) in &r.pecas {
            buf[*desloc..*desloc + d.len()].copy_from_slice(d);
        }
        self.mensagem(&buf, out);
    }

    fn mensagem(&mut self, m: &[u8], out: &mut Vec<Mensagem>) {
        if m.len() < 2 {
            self.contagem.mensagens_invalidas += 1;
            return;
        }
        let tipo = m[1];
        if tipo & 0x80 != 0 {
            self.contagem.criptografados += 1;
            return;
        }
        match decodificar(tipo, &m[2..]) {
            Ok(Some(msg)) => {
                self.contagem.mensagens += 1;
                out.push(msg);
            }
            Ok(None) => {}
            Err(_) => self.contagem.mensagens_invalidas += 1,
        }
    }
}

/// Desserializa o corpo de uma mensagem (depois do sinal e do tipo).
pub fn decodificar(tipo: u8, d: &[u8]) -> Result<Option<Mensagem>, Erro> {
    let mut r = Leitor::new(d);
    Ok(Some(match tipo {
        MSG_REQUISICAO => {
            let op = r.u8()?;
            Mensagem::Requisicao { op, params: ler_parametros(&mut r)? }
        }
        MSG_RESPOSTA | MSG_RESPOSTA_ALT => {
            let op = r.u8()?;
            let retorno = r.i16_le()?;
            // Mensagem de depuração (tipo + valor) antes dos parâmetros; o Albion às vezes põe dados nela.
            if r.resta() > 0 {
                let t = r.u8()?;
                ler_valor(&mut r, t, 0)?;
            }
            let params = if r.resta() > 0 { ler_parametros(&mut r)? } else { Vec::new() };
            Mensagem::Resposta { op, retorno, params }
        }
        MSG_EVENTO => {
            let codigo = r.u8()?;
            Mensagem::Evento { codigo, params: ler_parametros(&mut r)? }
        }
        _ => return Ok(None),
    }))
}

// ---------------------------------------------------------------------------------------------------------------
/// Montagem de pacotes para os testes (deste módulo e do interpretador).
#[cfg(test)]
pub mod montar {
    use super::*;
    use crate::capture::protocol18::{enc, Valor};

    pub fn evento(codigo_real: u16, params: &[(u8, Valor)]) -> Vec<u8> {
        let mut p: Vec<(u8, Valor)> = params.to_vec();
        p.push((252, Valor::Short(codigo_real as i16)));
        let mut m = vec![0xF3, MSG_EVENTO, 1];
        enc::parametros(&p, &mut m);
        m
    }

    pub fn resposta(tipo: u8, op_real: u16, params: &[(u8, Valor)]) -> Vec<u8> {
        let mut p: Vec<(u8, Valor)> = params.to_vec();
        p.push((253, Valor::Short(op_real as i16)));
        let mut m = vec![0xF3, tipo, 1];
        m.extend_from_slice(&0i16.to_le_bytes());
        enc::valor(&Valor::Nulo, &mut m);
        enc::parametros(&p, &mut m);
        m
    }

    pub fn comando(tipo: u8, corpo: &[u8]) -> Vec<u8> {
        let mut c = vec![tipo, 0, 0, 0];
        c.extend_from_slice(&((CABECALHO_COMANDO + corpo.len()) as u32).to_be_bytes());
        c.extend_from_slice(&1u32.to_be_bytes());
        c.extend_from_slice(corpo);
        c
    }

    pub fn confiavel(msg: &[u8]) -> Vec<u8> {
        comando(CMD_CONFIAVEL, msg)
    }

    pub fn nao_confiavel(msg: &[u8]) -> Vec<u8> {
        let mut corpo = 99u32.to_be_bytes().to_vec();
        corpo.extend_from_slice(msg);
        comando(CMD_NAO_CONFIAVEL, &corpo)
    }

    /// Fatia `msg` em `n` fragmentos (comandos tipo 8).
    pub fn fragmentos(seq: u32, msg: &[u8], n: usize) -> Vec<Vec<u8>> {
        let pedaco = msg.len().div_ceil(n);
        (0..n)
            .map(|i| {
                let ini = (i * pedaco).min(msg.len());
                let fim = ((i + 1) * pedaco).min(msg.len());
                let mut corpo = Vec::new();
                corpo.extend_from_slice(&seq.to_be_bytes());
                corpo.extend_from_slice(&(n as u32).to_be_bytes());
                corpo.extend_from_slice(&(i as u32).to_be_bytes());
                corpo.extend_from_slice(&(msg.len() as u32).to_be_bytes());
                corpo.extend_from_slice(&(ini as u32).to_be_bytes());
                corpo.extend_from_slice(&msg[ini..fim]);
                comando(CMD_FRAGMENTO, &corpo)
            })
            .collect()
    }

    pub fn pacote(comandos: &[Vec<u8>]) -> Vec<u8> {
        pacote_com(0, comandos)
    }

    pub fn pacote_com(flags: u8, comandos: &[Vec<u8>]) -> Vec<u8> {
        let mut p = Vec::new();
        p.extend_from_slice(&0x0102u16.to_be_bytes());
        p.push(flags);
        p.push(comandos.len() as u8);
        p.extend_from_slice(&123u32.to_be_bytes());
        p.extend_from_slice(&0x0A0B0C0Du32.to_be_bytes());
        if flags == FLAG_CRC {
            p.extend_from_slice(&[0, 0, 0, 0]);
        }
        for c in comandos {
            p.extend_from_slice(c);
        }
        if flags == FLAG_CRC {
            let crc = crc_photon(&p);
            p[CABECALHO..CABECALHO + 4].copy_from_slice(&crc.to_be_bytes());
        }
        p
    }
}

#[cfg(test)]
mod testes {
    use super::montar::*;
    use super::*;
    use crate::capture::protocol18::{param, Valor};

    fn codigo(m: &Mensagem) -> i64 {
        match m {
            Mensagem::Evento { params, .. } => param(params, 252).and_then(|v| v.inteiro()).unwrap(),
            Mensagem::Resposta { params, .. } | Mensagem::Requisicao { params, .. } => {
                param(params, 253).and_then(|v| v.inteiro()).unwrap()
            }
        }
    }

    #[test]
    fn cabecalho_e_evento_confiavel() {
        let msg = evento(82, &[(0, Valor::Long(77)), (1, Valor::Long(5_000_000))]);
        let mut p = Parser::new();
        let out = p.receber(&pacote(&[confiavel(&msg)]));
        assert_eq!(out.len(), 1);
        // Código real acima de 255 vem no params[252]; o byte do evento é só 1.
        assert!(matches!(&out[0], Mensagem::Evento { codigo: 1, .. }));
        assert_eq!(codigo(&out[0]), 82);
        assert_eq!(p.contagem.pacotes, 1);
    }

    #[test]
    fn codigo_de_evento_maior_que_255() {
        let msg = evento(475, &[]);
        let out = Parser::new().receber(&pacote(&[confiavel(&msg)]));
        assert_eq!(codigo(&out[0]), 475);
    }

    #[test]
    fn nao_confiavel_pula_4_bytes() {
        let msg = evento(81, &[(1, Valor::Long(1))]);
        let out = Parser::new().receber(&pacote(&[nao_confiavel(&msg)]));
        assert_eq!(out.len(), 1);
        assert_eq!(codigo(&out[0]), 81);
    }

    #[test]
    fn varios_comandos_e_comando_desconhecido() {
        let a = evento(81, &[]);
        let b = resposta(MSG_RESPOSTA, 2, &[(2, Valor::Texto("Eu".into()))]);
        let ack = comando(1, &[0; 8]);
        let out = Parser::new().receber(&pacote(&[confiavel(&a), ack, confiavel(&b)]));
        assert_eq!(out.len(), 2);
        assert_eq!(codigo(&out[1]), 2);
    }

    #[test]
    fn resposta_tipo_7() {
        let b = resposta(MSG_RESPOSTA_ALT, 41, &[(0, Valor::Texto("3004".into()))]);
        let out = Parser::new().receber(&pacote(&[confiavel(&b)]));
        assert!(matches!(&out[0], Mensagem::Resposta { .. }));
        assert_eq!(codigo(&out[0]), 41);
    }

    #[test]
    fn fragmentos_fora_de_ordem_e_repetidos() {
        let grande: Vec<(u8, Valor)> = (0..40u8).map(|i| (i, Valor::Texto(format!("valor-{i}-{}", "x".repeat(40))))).collect();
        let msg = evento(278, &grande);
        let frags = fragmentos(500, &msg, 4);
        let mut p = Parser::new();
        assert!(p.receber(&pacote(&[frags[2].clone()])).is_empty());
        assert!(p.receber(&pacote(&[frags[0].clone(), frags[0].clone()])).is_empty());
        assert!(p.receber(&pacote(&[frags[3].clone()])).is_empty());
        let out = p.receber(&pacote(&[frags[1].clone()]));
        assert_eq!(out.len(), 1);
        assert_eq!(codigo(&out[0]), 278);
        assert!(p.remontagens.is_empty());
        assert!(p.ordem.is_empty(), "remontagem concluída tem de sair da fila também");
        assert_eq!(p.bytes_abertos, 0);
    }

    /// Fragmento de um só comando, com total, deslocamento e dados à escolha (para forjar pacote hostil).
    fn fragmento_cru(seq: u32, n_frag: u32, num: u32, total: u32, desloc: u32, dados: &[u8]) -> Vec<u8> {
        let mut corpo = Vec::new();
        for v in [seq, n_frag, num, total, desloc] {
            corpo.extend_from_slice(&v.to_be_bytes());
        }
        corpo.extend_from_slice(dados);
        comando(CMD_FRAGMENTO, &corpo)
    }

    /// Um datagrama com dezenas de fragmentos que declaram 1 MB cada não reserva memória pelo total declarado.
    #[test]
    fn fragmento_forjado_nao_reserva_pelo_total_declarado() {
        let mut p = Parser::new();
        let cmds: Vec<Vec<u8>> = (0..40).map(|s| fragmento_cru(s, 900, 0, MAX_TOTAL_FRAGMENTADO as u32, 0, &[7; 16])).collect();
        assert!(p.receber(&pacote(&cmds)).is_empty());
        assert_eq!(p.remontagens.len(), 40);
        assert_eq!(p.bytes_abertos, 40 * 16, "só os bytes que chegaram contam");
        // Total acima do teto: recusado na hora.
        let mut p2 = Parser::new();
        p2.receber(&pacote(&[fragmento_cru(1, 2, 0, (MAX_TOTAL_FRAGMENTADO + 1) as u32, 0, &[1])]));
        assert!(p2.remontagens.is_empty());
        assert_eq!(p2.contagem.mensagens_invalidas, 1);
    }

    #[test]
    fn orcamento_de_bytes_descarta_a_mais_velha() {
        let mut p = Parser::new();
        // 400 KB de 800 KB declarados por remontagem: cabem 5 no orçamento de 2 MB.
        let pedaco = vec![1u8; 400 << 10];
        for seq in 0..10u32 {
            p.receber(&pacote(&[fragmento_cru(seq, 2, 0, (2 * pedaco.len()) as u32, 0, &pedaco)]));
            assert!(p.bytes_abertos <= MAX_BYTES_ABERTOS, "seq {seq}: {}", p.bytes_abertos);
        }
        assert_eq!(p.remontagens.len(), 5);
        assert_eq!(p.ordem.len(), p.remontagens.len());
        assert!(p.remontagens.contains_key(&9) && !p.remontagens.contains_key(&0));
    }

    /// Todos os pedaços "chegaram" mas não somam o total declarado: recusa sem montar o buffer.
    #[test]
    fn pedacos_que_nao_somam_o_total_sao_recusados() {
        let mut p = Parser::new();
        assert!(p.receber(&pacote(&[fragmento_cru(5, 1, 0, 100_000, 0, &[0xF3, 4, 1, 0])])).is_empty());
        assert_eq!(p.contagem.mensagens_invalidas, 1);
        assert!(p.remontagens.is_empty() && p.ordem.is_empty());
        assert_eq!(p.bytes_abertos, 0);
    }

    #[test]
    fn remontagens_tem_teto() {
        let msg = evento(1, &[(0, Valor::Texto("y".repeat(100)))]);
        let mut p = Parser::new();
        for seq in 0..(MAX_REMONTAGENS as u32 + 10) {
            p.receber(&pacote(&[fragmentos(seq, &msg, 2)[0].clone()]));
        }
        assert_eq!(p.remontagens.len(), MAX_REMONTAGENS);
    }

    #[test]
    fn dois_pacotes_colados_no_mesmo_datagrama() {
        let mut d = pacote(&[confiavel(&evento(81, &[]))]);
        d.extend(pacote(&[confiavel(&evento(82, &[]))]));
        let out = Parser::new().receber(&d);
        assert_eq!(out.iter().map(codigo).collect::<Vec<_>>(), vec![81, 82]);
    }

    #[test]
    fn crc_confere_e_recusa_pacote_alterado() {
        let d = pacote_com(FLAG_CRC, &[confiavel(&evento(82, &[]))]);
        assert_eq!(Parser::new().receber(&d).len(), 1);
        let mut estragado = d.clone();
        let n = estragado.len();
        estragado[n - 1] ^= 0xFF;
        let mut p = Parser::new();
        assert!(p.receber(&estragado).is_empty());
        assert_eq!(p.contagem.pacotes_invalidos, 1);
    }

    #[test]
    fn criptografado_e_descartado() {
        let mut msg = evento(81, &[]);
        msg[1] = 131;
        let mut p = Parser::new();
        assert!(p.receber(&pacote(&[confiavel(&msg)])).is_empty());
        assert!(p.receber(&pacote_com(FLAG_CRIPTOGRAFADO, &[confiavel(&evento(81, &[]))])).is_empty());
        assert_eq!(p.contagem.criptografados, 2);
    }

    #[test]
    fn datagrama_curto_ou_cortado_nao_quebra() {
        let mut p = Parser::new();
        assert!(p.receber(&[1, 2, 3]).is_empty());
        let d = pacote(&[confiavel(&evento(82, &[(1, Valor::Long(9))]))]);
        for corte in 0..d.len() {
            p.receber(&d[..corte]);
        }
    }
}
