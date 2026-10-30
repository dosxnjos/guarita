//! Interpretador: transforma mensagens Photon em fatos do PRÓPRIO jogador. É aqui que mora a fronteira dos Termos:
//!
//! - só eventos e operações de uma lista fechada (tabela de códigos) são olhados; todo o resto é descartado na hora
//!   e só entra no diagnóstico como "código N apareceu X vezes" (sem conteúdo);
//! - dos eventos da lista, só passa o que é do próprio personagem (objeto ou nome iguais aos da resposta do Join);
//!   loot pego por outro, morte de outro, prata de outro membro do grupo: descartados;
//! - o fato que sai daqui nunca leva nome, guilda, equipamento ou posição de ninguém (nem o nome do próprio
//!   personagem, que só serve para comparar e fica neste módulo).
//!
//! Números (conferidos em 30/10/2026; ver `capture-codes.json`): prata e fama vêm em FixPoint (×10000).

use std::collections::BTreeMap;

use serde::Serialize;

use super::codigos::{Entrada, Tabela};
use super::photon::Mensagem;
use super::protocol18::{param, Parametros, Valor};

/// Divisor do FixPoint do Albion.
pub const FIXPOINT: f64 = 10_000.0;

/// Um fato do próprio jogador, já sem nada de terceiros.
#[derive(Debug, Clone, PartialEq)]
pub enum Fato {
    /// Resposta do Join: o personagem entrou num mapa (a cada troca de zona o jogo manda de novo).
    Entrou { mapa: Option<String> },
    /// Troca de cluster (resposta do ChangeCluster).
    Zona { mapa: String },
    Fama { ganho: f64 },
    /// Prata recolhida, já sem as taxas (cluster, guilda, aliança).
    Prata { valor: f64 },
    /// Saldo de prata do personagem.
    Saldo { valor: f64 },
    /// Item pego do chão, de corpo ou de baú (índice numérico do item no jogo).
    Loot { indice: i64, quantidade: i64 },
    Morte,
}

#[derive(Debug, Default, Clone)]
struct Eu {
    objeto: Option<i64>,
    nome: Option<String>,
}

/// Contagem por código, sem conteúdo nenhum (modo de diagnóstico para validar a tabela ao vivo).
#[derive(Debug, Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostico {
    pub eventos: BTreeMap<u16, u64>,
    pub respostas: BTreeMap<u16, u64>,
    pub requisicoes: BTreeMap<u16, u64>,
    /// Fatos do próprio jogador aceitos, por tipo.
    pub proprios: BTreeMap<&'static str, u64>,
    /// Eventos da lista que eram de outro jogador (descartados).
    pub descartados_de_outros: u64,
    /// Eventos da lista que chegaram antes de saber quem é o jogador (descartados).
    pub descartados_sem_identidade: u64,
}

pub struct Interpretador {
    pub tabela: Tabela,
    eu: Eu,
    ultimo_total_fama: Option<i64>,
    pub diag: Diagnostico,
}

fn inteiro(p: &Parametros, chave: Option<u8>) -> Option<i64> {
    chave.and_then(|k| param(p, k)).and_then(Valor::inteiro)
}

fn texto(p: &Parametros, chave: Option<u8>) -> Option<String> {
    chave.and_then(|k| param(p, k)).and_then(|v| v.texto().map(str::to_owned))
}

/// Maior id de mapa aceito (os do world.txt ficam bem abaixo disso).
pub const MAX_ID_MAPA: usize = 48;

/// Id do mapa sem o sufixo depois de `@` (ilha ou instância pode trazer dono ou identificador de outra pessoa).
/// Só passa o que tem formato de id de mapa (letras ASCII, dígitos, `_` e `-`): se a tabela de códigos apontar
/// o campo errado, um texto qualquer da resposta não vira "zona" na tela.
pub fn mapa_base(m: String) -> Option<String> {
    let base = m.split('@').next().unwrap_or("").trim();
    let valido = !base.is_empty()
        && base.len() <= MAX_ID_MAPA
        && base.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-');
    valido.then(|| base.to_owned())
}

/// Código "real": o Albion põe o código no parâmetro 252 (evento) ou 253 (operação) como short; o byte do Photon é
/// truncado. Sem o parâmetro, vale o byte.
fn codigo_real(p: &Parametros, chave: u8, byte: u8) -> u16 {
    param(p, chave).and_then(Valor::inteiro).map(|v| v as u16).unwrap_or(byte as u16)
}

impl Interpretador {
    pub fn new(tabela: Tabela) -> Self {
        Self { tabela, eu: Eu::default(), ultimo_total_fama: None, diag: Diagnostico::default() }
    }

    /// Já sabemos quem é o jogador (chegou uma resposta de Join desde que a captura ligou)?
    pub fn identificado(&self) -> bool {
        self.eu.objeto.is_some() && self.eu.nome.is_some()
    }

    pub fn trocar_tabela(&mut self, t: Tabela) {
        self.tabela = t;
    }

    /// A captura parou (desligou, caiu ou a sessão foi zerada): a fama total vista antes não serve de base,
    /// senão toda a fama ganha com a captura parada entraria de uma vez no primeiro UpdateFame.
    pub fn pausou(&mut self) {
        self.ultimo_total_fama = None;
    }

    /// A mensagem é uma resposta de Join? `Some(true)` = do mesmo personagem já identificado (troca de mapa),
    /// `Some(false)` = de outro personagem (ou ainda sem identidade), `None` = não é Join. O nome não sai daqui.
    pub fn join_do_mesmo(&self, m: &Mensagem) -> Option<bool> {
        let Mensagem::Resposta { op, retorno, params } = m else { return None };
        let c = codigo_real(params, self.tabela.parametro_operacao, *op);
        let e = self.tabela.operacao("Join").filter(|e| e.codigo == c)?;
        if *retorno != 0 {
            return None;
        }
        let nome = texto(params, e.campo("nome"))?;
        Some(self.eu.nome.as_deref() == Some(nome.as_str()))
    }

    fn eh_evento(&self, codigo: u16, nome: &str) -> Option<&Entrada> {
        self.tabela.evento(nome).filter(|e| e.codigo == codigo)
    }

    fn aceito(&mut self, tipo: &'static str, f: Fato) -> Option<Fato> {
        *self.diag.proprios.entry(tipo).or_default() += 1;
        Some(f)
    }

    fn de_outro(&mut self) -> Option<Fato> {
        self.diag.descartados_de_outros += 1;
        None
    }

    fn sem_identidade(&mut self) -> Option<Fato> {
        self.diag.descartados_sem_identidade += 1;
        None
    }

    /// O objeto do evento é o do jogador? `None` = ainda não sabemos quem é o jogador.
    fn objeto_eh_meu(&self, objeto: Option<i64>) -> Option<bool> {
        let eu = self.eu.objeto?;
        Some(objeto == Some(eu))
    }

    pub fn processar(&mut self, m: &Mensagem) -> Option<Fato> {
        match m {
            Mensagem::Evento { codigo, params } => {
                let c = codigo_real(params, self.tabela.parametro_evento, *codigo);
                *self.diag.eventos.entry(c).or_default() += 1;
                self.evento(c, params)
            }
            Mensagem::Resposta { op, retorno, params } => {
                let c = codigo_real(params, self.tabela.parametro_operacao, *op);
                *self.diag.respostas.entry(c).or_default() += 1;
                if *retorno != 0 {
                    return None;
                }
                self.resposta(c, params)
            }
            Mensagem::Requisicao { op, params } => {
                let c = codigo_real(params, self.tabela.parametro_operacao, *op);
                *self.diag.requisicoes.entry(c).or_default() += 1;
                None
            }
        }
    }

    fn resposta(&mut self, c: u16, p: &Parametros) -> Option<Fato> {
        if let Some(e) = self.tabela.operacao("Join").filter(|e| e.codigo == c).cloned() {
            let objeto = inteiro(p, e.campo("objeto"));
            let nome = texto(p, e.campo("nome")).filter(|n| !n.is_empty());
            let (Some(objeto), Some(nome)) = (objeto, nome) else { return None };
            if self.eu.nome.as_deref() != Some(nome.as_str()) {
                // Outro personagem (ou o primeiro): a fama total anterior não vale mais.
                self.ultimo_total_fama = None;
            }
            self.eu = Eu { objeto: Some(objeto), nome: Some(nome) };
            let mapa = texto(p, e.campo("mapa")).and_then(mapa_base);
            return self.aceito("entrou", Fato::Entrou { mapa });
        }
        if let Some(e) = self.tabela.operacao("ChangeCluster").filter(|e| e.codigo == c).cloned() {
            let mapa = texto(p, e.campo("mapa")).and_then(mapa_base)?;
            return self.aceito("zona", Fato::Zona { mapa });
        }
        None
    }

    fn evento(&mut self, c: u16, p: &Parametros) -> Option<Fato> {
        // Lista fechada: qualquer outro código (personagem novo na área, movimento, equipamento, chat, mob...)
        // termina aqui, sem olhar o conteúdo.
        if let Some(e) = self.eh_evento(c, "UpdateFame").cloned() {
            // Só o próprio jogador recebe este evento; mesmo assim, com a identidade conhecida, o objeto confere.
            if self.objeto_eh_meu(inteiro(p, e.campo("objeto"))) == Some(false) {
                return self.de_outro();
            }
            let total = inteiro(p, e.campo("total"));
            let informado = inteiro(p, e.campo("ganho")).unwrap_or(0).max(0) as f64 / FIXPOINT;
            let ganho = match (self.ultimo_total_fama, total) {
                (Some(antes), Some(agora)) if agora >= antes => (agora - antes) as f64 / FIXPOINT,
                _ => informado,
            };
            if total.is_some() {
                self.ultimo_total_fama = total;
            }
            return self.aceito("fama", Fato::Fama { ganho });
        }
        if let Some(e) = self.eh_evento(c, "UpdateMoney").cloned() {
            if self.objeto_eh_meu(inteiro(p, e.campo("objeto"))) == Some(false) {
                return self.de_outro();
            }
            let saldo = inteiro(p, e.campo("saldo"))?;
            return self.aceito("saldo", Fato::Saldo { valor: saldo as f64 / FIXPOINT });
        }
        if let Some(e) = self.eh_evento(c, "TakeSilver").cloned() {
            // Chega para todo o grupo: exige o objeto do próprio jogador.
            match self.objeto_eh_meu(inteiro(p, e.campo("objeto"))) {
                None => return self.sem_identidade(),
                Some(false) => return self.de_outro(),
                Some(true) => {}
            }
            let v = |n: &str| inteiro(p, e.campo(n)).unwrap_or(0);
            let liquido = (v("bruto") - v("taxaCluster") - v("taxaGuilda") - v("penalidadeAlianca")).max(0);
            return self.aceito("prata", Fato::Prata { valor: liquido as f64 / FIXPOINT });
        }
        if let Some(e) = self.eh_evento(c, "OtherGrabbedLoot").cloned() {
            let Some(eu) = self.eu.nome.clone() else { return self.sem_identidade() };
            if texto(p, e.campo("quemPegou")).as_deref() != Some(eu.as_str()) {
                return self.de_outro();
            }
            // Prata pega do corpo já chega como TakeSilver; aqui contaria duas vezes.
            if e.campo("ehPrata").and_then(|k| param(p, k)).and_then(Valor::booleano) == Some(true) {
                return None;
            }
            let indice = inteiro(p, e.campo("item"))?;
            let quantidade = inteiro(p, e.campo("quantidade")).unwrap_or(1).max(1);
            return self.aceito("loot", Fato::Loot { indice, quantidade });
        }
        if let Some(e) = self.eh_evento(c, "Died").cloned() {
            if !self.identificado() {
                return self.sem_identidade();
            }
            let pelo_objeto = self.objeto_eh_meu(inteiro(p, e.campo("objeto"))) == Some(true);
            let pelo_nome = texto(p, e.campo("nome")).is_some_and(|n| Some(n.as_str()) == self.eu.nome.as_deref());
            if !(pelo_objeto || pelo_nome) {
                return self.de_outro();
            }
            // Quem matou (nome, guilda) é dado de outro jogador: não sai daqui.
            return self.aceito("morte", Fato::Morte);
        }
        None
    }

    /// Diagnóstico em JSON, com o nome de cada código que a tabela conhece. Só números e nomes de código.
    pub fn diagnostico_json(&self, extra: serde_json::Value) -> serde_json::Value {
        let nomeia = |m: &BTreeMap<u16, u64>, evento: bool| -> serde_json::Value {
            m.iter()
                .map(|(c, n)| {
                    let nome = if evento { self.tabela.nome_evento(*c) } else { self.tabela.nome_operacao(*c) };
                    (c.to_string(), serde_json::json!({ "vezes": n, "nome": nome }))
                })
                .collect::<serde_json::Map<_, _>>()
                .into()
        };
        serde_json::json!({
            "tabela": { "versao": self.tabela.versao, "atualizadoEm": self.tabela.atualizado_em },
            "identificado": self.identificado(),
            "eventos": nomeia(&self.diag.eventos, true),
            "respostas": nomeia(&self.diag.respostas, false),
            "requisicoes": nomeia(&self.diag.requisicoes, false),
            "proprios": self.diag.proprios,
            "descartadosDeOutros": self.diag.descartados_de_outros,
            "descartadosSemIdentidade": self.diag.descartados_sem_identidade,
            "captura": extra,
        })
    }
}

#[cfg(test)]
pub mod testes {
    use super::*;
    use crate::capture::photon::{montar, Parser, MSG_RESPOSTA};

    pub const MEU_NOME: &str = "EuMesmo";
    pub const MEU_OBJETO: i64 = 4195;

    pub fn join() -> Vec<u8> {
        montar::resposta(
            MSG_RESPOSTA,
            2,
            &[
                (0, Valor::Long(MEU_OBJETO)),
                (2, Valor::Texto(MEU_NOME.into())),
                (8, Valor::Texto("3004".into())),
                (58, Valor::Texto("Minha Guilda".into())),
            ],
        )
    }

    /// Passa mensagens Photon montadas pelo parser e pelo interpretador, como a captura faz.
    pub fn rodar(it: &mut Interpretador, msgs: &[Vec<u8>]) -> Vec<Fato> {
        let mut p = Parser::new();
        let mut out = Vec::new();
        for m in msgs {
            for msg in p.receber(&montar::pacote(&[montar::confiavel(m)])) {
                out.extend(it.processar(&msg));
            }
        }
        out
    }

    fn novo() -> Interpretador {
        Interpretador::new(Tabela::embutida())
    }

    #[test]
    fn join_identifica_e_da_o_mapa() {
        let mut it = novo();
        let f = rodar(&mut it, &[join()]);
        assert_eq!(f, vec![Fato::Entrou { mapa: Some("3004".into()) }]);
        assert!(it.identificado());
    }

    #[test]
    fn fama_pela_diferenca_do_total() {
        let mut it = novo();
        let fama = |total: i64, ganho: i64| {
            montar::evento(82, &[(0, Valor::Long(MEU_OBJETO)), (1, Valor::Long(total)), (2, Valor::Long(ganho))])
        };
        let f = rodar(&mut it, &[join(), fama(1_000_000_000, 1_000_000), fama(1_015_000_000, 9)]);
        assert_eq!(f[1], Fato::Fama { ganho: 100.0 });
        assert_eq!(f[2], Fato::Fama { ganho: 1500.0 });
    }

    /// Fama ganha com a captura desligada não entra de uma vez quando ela volta.
    #[test]
    fn fama_depois_de_pausar_usa_o_ganho_informado() {
        let mut it = novo();
        let fama = |total: i64, ganho: i64| {
            montar::evento(82, &[(0, Valor::Long(MEU_OBJETO)), (1, Valor::Long(total)), (2, Valor::Long(ganho))])
        };
        rodar(&mut it, &[join(), fama(1_000_000_000, 1_000_000)]);
        it.pausou();
        // 2 milhões de fama (×10000) ganhos com a captura parada + 100 deste evento.
        let f = rodar(&mut it, &[fama(1_000_000_000 + 20_001_000_000, 1_000_000)]);
        assert_eq!(f, vec![Fato::Fama { ganho: 100.0 }]);
        // Daí em diante volta a valer a diferença do total.
        let f = rodar(&mut it, &[fama(1_000_000_000 + 20_001_000_000 + 50_000, 9)]);
        assert_eq!(f, vec![Fato::Fama { ganho: 5.0 }]);
    }

    #[test]
    fn mapa_so_com_formato_de_id() {
        assert_eq!(mapa_base("3004".into()), Some("3004".into()));
        assert_eq!(mapa_base("ISLAND-PLAYER-0001a@Fulano".into()), Some("ISLAND-PLAYER-0001a".into()));
        assert_eq!(mapa_base("PLAYERCITY_BLACK_ROYAL".into()), Some("PLAYERCITY_BLACK_ROYAL".into()));
        for lixo in ["", "@ISLAND", "Guilda Do Fulano", "golpe.xyz", "ção", &"A".repeat(MAX_ID_MAPA + 1)] {
            assert_eq!(mapa_base(lixo.into()), None, "{lixo}");
        }
    }

    #[test]
    fn join_do_mesmo_sem_expor_o_nome() {
        let mut it = novo();
        let msg = |b: Vec<u8>| Parser::new().receber(&montar::pacote(&[montar::confiavel(&b)])).remove(0);
        let outro = montar::resposta(MSG_RESPOSTA, 2, &[(0, Valor::Long(9)), (2, Valor::Texto("Outro".into()))]);
        assert_eq!(it.join_do_mesmo(&msg(join())), Some(false), "sem identidade, nenhum Join é 'do mesmo'");
        rodar(&mut it, &[join()]);
        assert_eq!(it.join_do_mesmo(&msg(join())), Some(true));
        assert_eq!(it.join_do_mesmo(&msg(outro)), Some(false));
        assert_eq!(it.join_do_mesmo(&msg(montar::evento(82, &[]))), None);
    }

    #[test]
    fn prata_liquida_so_do_proprio_objeto() {
        let mut it = novo();
        let prata = |obj: i64| {
            montar::evento(
                62,
                &[(0, Valor::Long(obj)), (2, Valor::Long(obj)), (3, Valor::Long(1_000_000)), (5, Valor::Long(100_000))],
            )
        };
        // Antes do Join: não dá para saber de quem é.
        assert!(rodar(&mut it, &[prata(MEU_OBJETO)]).is_empty());
        let f = rodar(&mut it, &[join(), prata(MEU_OBJETO), prata(999)]);
        assert_eq!(f[1..], [Fato::Prata { valor: 90.0 }]);
        assert_eq!(it.diag.descartados_de_outros, 1);
        assert_eq!(it.diag.descartados_sem_identidade, 1);
    }

    #[test]
    fn saldo_e_morte_propria_sem_nome_do_matador() {
        let mut it = novo();
        let morte = montar::evento(
            164,
            &[
                (1, Valor::Long(MEU_OBJETO)),
                (2, Valor::Texto(MEU_NOME.into())),
                (10, Valor::Texto("Matador".into())),
                (11, Valor::Texto("Guilda Dele".into())),
            ],
        );
        let saldo = montar::evento(81, &[(0, Valor::Long(MEU_OBJETO)), (1, Valor::Long(8_849_956_251))]);
        let f = rodar(&mut it, &[join(), saldo, morte]);
        assert_eq!(f[1], Fato::Saldo { valor: 884_995.6251 });
        assert_eq!(f[2], Fato::Morte);
    }

    #[test]
    fn loot_proprio_entra_e_prata_do_corpo_nao_conta_duas_vezes() {
        let mut it = novo();
        let loot = |quem: &str, prata: bool| {
            montar::evento(
                278,
                &[
                    (0, Valor::Long(424)),
                    (1, Valor::Texto("CorpoQualquer".into())),
                    (2, Valor::Texto(quem.into())),
                    (3, Valor::Bool(prata)),
                    (4, Valor::Int(1841)),
                    (5, Valor::Int(3)),
                ],
            )
        };
        let f = rodar(&mut it, &[join(), loot(MEU_NOME, false), loot(MEU_NOME, true)]);
        assert_eq!(f[1..], [Fato::Loot { indice: 1841, quantidade: 3 }]);
    }

    /// Fronteira dos Termos: nada de outros jogadores sai do interpretador, e nada do conteúdo deles fica guardado.
    #[test]
    fn outros_jogadores_sao_descartados_e_nunca_expostos() {
        let mut it = novo();
        let estranho = "JogadorEstranho";
        let guilda = "GuildaDeFora";
        let msgs = vec![
            join(),
            // Personagem novo na área (nome, guilda, posição, equipamento).
            montar::evento(
                29,
                &[
                    (0, Valor::Long(777)),
                    (1, Valor::Texto(estranho.into())),
                    (8, Valor::Texto(guilda.into())),
                    (12, Valor::Lista(vec![Valor::Float(10.5), Valor::Float(-3.0)])),
                    (40, Valor::Lista(vec![Valor::Int(1841), Valor::Int(2000)])),
                ],
            ),
            // Movimento de outro jogador.
            montar::evento(3, &[(0, Valor::Long(777)), (1, Valor::Bytes(vec![1, 2, 3, 4]))]),
            // Loot pego por outro.
            montar::evento(
                278,
                &[(1, Valor::Texto(MEU_NOME.into())), (2, Valor::Texto(estranho.into())), (4, Valor::Int(1)), (5, Valor::Int(1))],
            ),
            // Morte de outro (morto por mim, inclusive).
            montar::evento(
                164,
                &[(1, Valor::Long(777)), (2, Valor::Texto(estranho.into())), (10, Valor::Texto(MEU_NOME.into()))],
            ),
            // Prata de outro membro do grupo.
            montar::evento(62, &[(0, Valor::Long(777)), (3, Valor::Long(50_000))]),
            // Fama de outro objeto (não deveria chegar, mas se chegar não passa).
            montar::evento(82, &[(0, Valor::Long(777)), (1, Valor::Long(10)), (2, Valor::Long(10))]),
            // Kill de jogador, loot de corpo de outro.
            montar::evento(163, &[(0, Valor::Texto(estranho.into()))]),
            montar::evento(98, &[(3, Valor::Texto(estranho.into()))]),
            // Visita à ilha de outro jogador: o sufixo do mapa não sai.
            montar::resposta(MSG_RESPOSTA, 41, &[(0, Valor::Texto(format!("ISLAND-PLAYER-0001a@{estranho}")))]),
        ];
        let fatos = rodar(&mut it, &msgs);
        assert_eq!(
            fatos,
            vec![
                Fato::Entrou { mapa: Some("3004".into()) },
                Fato::Zona { mapa: "ISLAND-PLAYER-0001a".into() }
            ],
            "só o Join e a troca de mapa do próprio jogador passam, sem o sufixo de outra pessoa"
        );
        assert_eq!(it.diag.descartados_de_outros, 4);

        // O diagnóstico só tem números e nomes de código: nenhum nome, guilda ou valor de outro jogador.
        let diag = it.diagnostico_json(serde_json::json!({})).to_string();
        for proibido in [estranho, guilda, MEU_NOME, "10.5", "Minha Guilda"] {
            assert!(!diag.contains(proibido), "diagnóstico vazou {proibido}: {diag}");
        }
        assert!(diag.contains("\"29\""), "conta o código 29 sem conteúdo");
    }

    #[test]
    fn tabela_nova_muda_o_codigo_sem_recompilar() {
        let mut v: serde_json::Value = serde_json::from_str(crate::capture::codigos::EMBUTIDA).unwrap();
        v["versao"] = 2.into();
        v["eventos"]["UpdateFame"]["codigo"] = 90.into();
        let mut it = novo();
        it.trocar_tabela(Tabela::de_json(&v.to_string()).unwrap());
        let antigo = montar::evento(82, &[(1, Valor::Long(10_000))]);
        let novo_cod = montar::evento(90, &[(1, Valor::Long(10_000)), (2, Valor::Long(10_000))]);
        assert_eq!(rodar(&mut it, &[antigo, novo_cod]), vec![Fato::Fama { ganho: 1.0 }]);
    }
}
