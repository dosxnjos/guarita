//! Sessão do próprio jogador: soma os fatos (`albion::Fato`) e gera o retrato que vai para o front.
//! Tempo sempre em milissegundos desde 1970 (passado de fora, para os testes controlarem o relógio).

use std::collections::{BTreeMap, HashMap};

use serde::Serialize;

use super::albion::Fato;

#[derive(Debug, Clone, Default)]
pub struct Sessao {
    pub iniciada_em: u64,
    acumulado_ms: u64,
    ativa_desde: Option<u64>,
    mapa: Option<String>,
    prata: f64,
    fama: f64,
    mortes: u32,
    saldo_inicial: Option<f64>,
    saldo_atual: Option<f64>,
    /// índice do item no jogo → quantidade
    loot: BTreeMap<i64, i64>,
    ultimo_loot_em: Option<u64>,
    fatos: u64,
    ultimo_fato_em: Option<u64>,
}

/// Um item do loot, já com o id textual quando a lista de itens do ao-bin-dumps está carregada.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ItemLoot {
    pub indice: i64,
    /// Ex.: `T4_BAG`, `T5_2H_BOW@1`; `None` sem a lista de itens (ou índice fora dela).
    pub item_id: Option<String>,
    pub quantidade: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Zona {
    pub id: String,
    /// Nome do mapa (inglês, do ao-bin-dumps); `None` sem a lista de mapas.
    pub nome: Option<String>,
}

/// Retrato da sessão enviado às janelas (evento `guarita://captura-sessao`). Só agregados do próprio jogador.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Retrato {
    /// ms desde 1970
    pub iniciada_em: u64,
    /// ms desde 1970 em que este retrato foi gerado
    pub gerado_em: u64,
    /// Tempo com a captura ligada e o jogo mandando pacote nesta sessão (ms).
    pub duracao_ms: u64,
    /// Contando tempo agora (captura ligada e tráfego do jogo nos últimos segundos).
    pub ativa: bool,
    pub zona: Option<Zona>,
    pub prata: f64,
    pub fama: f64,
    pub mortes: u32,
    /// Variação do saldo de prata desde o primeiro saldo visto (compras e vendas entram aqui).
    pub saldo_variacao: Option<f64>,
    pub loot: Vec<ItemLoot>,
    pub ultimo_loot_em: Option<u64>,
    pub fatos: u64,
    pub ultimo_fato_em: Option<u64>,
}

/// Dados de apoio vindos do ao-bin-dumps (o painel baixa e entrega ao Rust).
#[derive(Debug, Clone, Default)]
pub struct Dados {
    /// posição = índice numérico do item no jogo
    pub itens: Vec<String>,
    pub zonas: HashMap<String, String>,
}

impl Dados {
    pub fn item(&self, indice: i64) -> Option<String> {
        usize::try_from(indice).ok().and_then(|i| self.itens.get(i)).filter(|s| !s.is_empty()).cloned()
    }

    /// Nome da zona (o interpretador já tira o sufixo depois de `@`; aqui tenta inteiro e depois a base).
    pub fn zona(&self, id: &str) -> Option<String> {
        self.zonas
            .get(id)
            .or_else(|| id.split('@').next().and_then(|b| self.zonas.get(b)))
            .cloned()
    }
}

impl Sessao {
    pub fn nova(agora: u64) -> Self {
        Self { iniciada_em: agora, ..Default::default() }
    }

    /// Chegou tráfego do jogo com a captura ligada: conta tempo a partir de agora. `true` se estava parada.
    pub fn retomar(&mut self, agora: u64) -> bool {
        if self.ativa_desde.is_none() {
            self.ativa_desde = Some(agora);
            return true;
        }
        false
    }

    /// A captura desligou ou o jogo parou de mandar pacote (para de contar tempo em `agora`; os números ficam).
    /// `true` se estava contando.
    pub fn pausar(&mut self, agora: u64) -> bool {
        if let Some(d) = self.ativa_desde.take() {
            self.acumulado_ms += agora.saturating_sub(d);
            return true;
        }
        false
    }

    pub fn ativa(&self) -> bool {
        self.ativa_desde.is_some()
    }

    pub fn duracao(&self, agora: u64) -> u64 {
        self.acumulado_ms + self.ativa_desde.map(|d| agora.saturating_sub(d)).unwrap_or(0)
    }

    pub fn aplicar(&mut self, f: &Fato, agora: u64) {
        self.fatos += 1;
        self.ultimo_fato_em = Some(agora);
        match f {
            Fato::Entrou { mapa } => {
                if let Some(m) = mapa {
                    self.mapa = Some(m.clone());
                }
            }
            Fato::Zona { mapa } => self.mapa = Some(mapa.clone()),
            Fato::Fama { ganho } => self.fama += ganho.max(0.0),
            Fato::Prata { valor } => self.prata += valor.max(0.0),
            Fato::Saldo { valor } => {
                if self.saldo_inicial.is_none() {
                    self.saldo_inicial = Some(*valor);
                }
                self.saldo_atual = Some(*valor);
            }
            Fato::Loot { indice, quantidade } => {
                *self.loot.entry(*indice).or_default() += quantidade;
                self.ultimo_loot_em = Some(agora);
            }
            Fato::Morte => self.mortes += 1,
        }
    }

    pub fn retrato(&self, dados: &Dados, agora: u64) -> Retrato {
        Retrato {
            iniciada_em: self.iniciada_em,
            gerado_em: agora,
            duracao_ms: self.duracao(agora),
            ativa: self.ativa_desde.is_some(),
            // Com a lista de mapas carregada, só sai id que existe nela (texto estranho no campo do mapa não vira
            // "zona" na tela); sem a lista, sai o id, que o interpretador já filtrou pelo formato.
            zona: self.mapa.as_ref().and_then(|id| {
                let nome = dados.zona(id);
                (nome.is_some() || dados.zonas.is_empty()).then(|| Zona { id: id.clone(), nome })
            }),
            prata: self.prata,
            fama: self.fama,
            mortes: self.mortes,
            saldo_variacao: match (self.saldo_inicial, self.saldo_atual) {
                (Some(a), Some(b)) => Some(b - a),
                _ => None,
            },
            loot: self
                .loot
                .iter()
                .map(|(i, q)| ItemLoot { indice: *i, item_id: dados.item(*i), quantidade: *q })
                .collect(),
            ultimo_loot_em: self.ultimo_loot_em,
            fatos: self.fatos,
            ultimo_fato_em: self.ultimo_fato_em,
        }
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn soma_fatos_e_conta_so_o_tempo_ligado() {
        let mut s = Sessao::nova(1_000);
        s.retomar(1_000);
        s.aplicar(&Fato::Entrou { mapa: Some("3004".into()) }, 2_000);
        s.aplicar(&Fato::Prata { valor: 90.0 }, 3_000);
        s.aplicar(&Fato::Prata { valor: 10.0 }, 3_000);
        s.aplicar(&Fato::Fama { ganho: 1500.0 }, 3_000);
        s.aplicar(&Fato::Saldo { valor: 1000.0 }, 3_000);
        s.aplicar(&Fato::Saldo { valor: 1250.0 }, 4_000);
        s.aplicar(&Fato::Loot { indice: 3, quantidade: 2 }, 4_000);
        s.aplicar(&Fato::Loot { indice: 3, quantidade: 1 }, 5_000);
        s.aplicar(&Fato::Loot { indice: 99_999, quantidade: 1 }, 5_000);
        s.aplicar(&Fato::Morte, 5_000);
        s.pausar(11_000);
        // desligada por 1 min não conta
        s.retomar(71_000);
        let dados = Dados {
            itens: vec!["".into(), "UNIQUE_HIDEOUT".into(), "T3_X".into(), "T4_BAG".into()],
            zonas: HashMap::from([("3004".to_string(), "Martlock".to_string())]),
        };
        let r = s.retrato(&dados, 81_000);
        assert_eq!(r.duracao_ms, 20_000);
        assert!(r.ativa);
        assert_eq!(r.prata, 100.0);
        assert_eq!(r.fama, 1500.0);
        assert_eq!(r.mortes, 1);
        assert_eq!(r.saldo_variacao, Some(250.0));
        assert_eq!(r.zona, Some(Zona { id: "3004".into(), nome: Some("Martlock".into()) }));
        assert_eq!(
            r.loot,
            vec![
                ItemLoot { indice: 3, item_id: Some("T4_BAG".into()), quantidade: 3 },
                ItemLoot { indice: 99_999, item_id: None, quantidade: 1 },
            ]
        );
        assert_eq!(r.ultimo_loot_em, Some(5_000));
    }

    #[test]
    fn zona_com_sufixo() {
        let d = Dados { itens: vec![], zonas: HashMap::from([("0004".to_string(), "Swamp Cross".to_string())]) };
        assert_eq!(d.zona("0004@ISLAND"), Some("Swamp Cross".into()));
        assert_eq!(d.zona("9999"), None);
        assert_eq!(d.item(-1), None);
    }

    #[test]
    fn com_a_lista_de_mapas_so_sai_mapa_conhecido() {
        let mut s = Sessao::nova(0);
        s.aplicar(&Fato::Zona { mapa: "NomeDeAlguem".into() }, 1);
        let com_lista = Dados { itens: vec![], zonas: HashMap::from([("3004".to_string(), "Martlock".to_string())]) };
        assert_eq!(s.retrato(&com_lista, 2).zona, None);
        assert_eq!(s.retrato(&Dados::default(), 2).zona, Some(Zona { id: "NomeDeAlguem".into(), nome: None }));
        s.aplicar(&Fato::Zona { mapa: "3004".into() }, 3);
        assert_eq!(s.retrato(&com_lista, 4).zona.map(|z| z.nome), Some(Some("Martlock".into())));
    }
}
