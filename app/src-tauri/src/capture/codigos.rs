//! Tabela de códigos de evento e operação do Albion (mudam a cada patch). A fonte única é `app/capture-codes.json`:
//! vai embutida no binário e o painel baixa a mesma do GitHub; se a de lá tiver `versao` maior, passa a valer
//! (sem nova versão do app). De onde veio cada número: campo `fontes` do próprio JSON.

use std::collections::HashMap;

use serde::Deserialize;

/// O JSON embutido no build.
pub const EMBUTIDA: &str = include_str!("../../../capture-codes.json");

#[derive(Debug, Clone, Deserialize)]
pub struct Entrada {
    pub codigo: u16,
    #[serde(default)]
    pub campos: HashMap<String, u8>,
}

impl Entrada {
    pub fn campo(&self, nome: &str) -> Option<u8> {
        self.campos.get(nome).copied()
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tabela {
    pub versao: u32,
    pub atualizado_em: String,
    pub protocolo: String,
    pub porta: u16,
    pub parametro_evento: u8,
    pub parametro_operacao: u8,
    pub eventos: HashMap<String, Entrada>,
    pub operacoes: HashMap<String, Entrada>,
}

/// Eventos e operações que o interpretador usa; uma tabela sem algum deles é recusada.
pub const EVENTOS_USADOS: &[&str] = &["UpdateMoney", "UpdateFame", "TakeSilver", "OtherGrabbedLoot", "Died"];
pub const OPERACOES_USADAS: &[&str] = &["Join", "ChangeCluster"];
/// Portas do servidor de jogo do Albion (Photon). A tabela remota não consegue apontar a captura para outro
/// tráfego do usuário (DNS, HTTPS...).
pub const PORTAS_ALBION: &[u16] = &[5055, 5056];
/// Quanto a `versao` de uma tabela remota pode passar da embutida (um número enorme por engano sobreporia para
/// sempre as tabelas das próximas versões do app).
pub const SALTO_MAX_VERSAO: u32 = 1000;
/// Parâmetro do código real: o Photon usa as chaves altas (252 evento, 253 operação).
const PARAMETRO_CODIGO_MIN: u8 = 240;

impl Tabela {
    pub fn embutida() -> Tabela {
        Tabela::de_json(EMBUTIDA).expect("capture-codes.json embutido inválido")
    }

    /// Tabela baixada do GitHub: as mesmas regras da embutida e mais um teto de versão.
    pub fn de_json_remota(s: &str, versao_embutida: u32) -> Result<Tabela, String> {
        let t = Tabela::de_json(s)?;
        if t.versao > versao_embutida.saturating_add(SALTO_MAX_VERSAO) {
            return Err(format!("versão {} da tabela de códigos fora do esperado", t.versao));
        }
        Ok(t)
    }

    /// Lê e valida (protocolo conhecido, porta do Albion, parâmetros de código, todos os eventos e operações
    /// usados presentes).
    pub fn de_json(s: &str) -> Result<Tabela, String> {
        let t: Tabela = serde_json::from_str(s).map_err(|e| format!("tabela de códigos inválida: {e}"))?;
        if t.protocolo != "photon-protocol18" {
            return Err(format!("protocolo \"{}\" não suportado por esta versão do app", t.protocolo));
        }
        if !PORTAS_ALBION.contains(&t.porta) {
            return Err(format!("porta {} não é do Albion na tabela de códigos", t.porta));
        }
        if t.parametro_evento < PARAMETRO_CODIGO_MIN || t.parametro_operacao < PARAMETRO_CODIGO_MIN {
            return Err("parâmetro do código inválido na tabela de códigos".into());
        }
        for e in EVENTOS_USADOS {
            if !t.eventos.contains_key(*e) {
                return Err(format!("tabela de códigos sem o evento {e}"));
            }
        }
        for o in OPERACOES_USADAS {
            if !t.operacoes.contains_key(*o) {
                return Err(format!("tabela de códigos sem a operação {o}"));
            }
        }
        Ok(t)
    }

    pub fn evento(&self, nome: &str) -> Option<&Entrada> {
        self.eventos.get(nome)
    }

    pub fn operacao(&self, nome: &str) -> Option<&Entrada> {
        self.operacoes.get(nome)
    }

    /// Nome do evento com esse código (para o diagnóstico ficar legível).
    pub fn nome_evento(&self, codigo: u16) -> Option<&str> {
        self.eventos.iter().find(|(_, e)| e.codigo == codigo).map(|(n, _)| n.as_str())
    }

    pub fn nome_operacao(&self, codigo: u16) -> Option<&str> {
        self.operacoes.iter().find(|(_, e)| e.codigo == codigo).map(|(n, _)| n.as_str())
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn embutida_valida_com_os_codigos_conferidos() {
        let t = Tabela::embutida();
        assert_eq!(t.porta, 5056);
        assert_eq!(t.parametro_evento, 252);
        assert_eq!(t.parametro_operacao, 253);
        assert_eq!(t.evento("UpdateFame").unwrap().codigo, 82);
        assert_eq!(t.evento("OtherGrabbedLoot").unwrap().campo("quemPegou"), Some(2));
        assert_eq!(t.operacao("Join").unwrap().campo("mapa"), Some(8));
        assert_eq!(t.nome_evento(164), Some("Died"));
    }

    #[test]
    fn recusa_tabela_incompleta_ou_de_outro_protocolo() {
        let mut v: serde_json::Value = serde_json::from_str(EMBUTIDA).unwrap();
        v["protocolo"] = "photon-protocol16".into();
        assert!(Tabela::de_json(&v.to_string()).is_err());
        let mut v: serde_json::Value = serde_json::from_str(EMBUTIDA).unwrap();
        v["eventos"].as_object_mut().unwrap().remove("Died");
        assert!(Tabela::de_json(&v.to_string()).unwrap_err().contains("Died"));
        assert!(Tabela::de_json("{").is_err());
    }

    /// A tabela remota não aponta a captura para outra porta nem trava as próximas versões com `versao` enorme.
    #[test]
    fn remota_so_com_porta_do_albion_e_versao_plausivel() {
        let base = Tabela::embutida().versao;
        let com = |f: &dyn Fn(&mut serde_json::Value)| {
            let mut v: serde_json::Value = serde_json::from_str(EMBUTIDA).unwrap();
            f(&mut v);
            Tabela::de_json_remota(&v.to_string(), base)
        };
        assert!(com(&|v| v["versao"] = (base + 1).into()).is_ok());
        assert!(com(&|v| v["porta"] = 5055.into()).is_ok());
        for porta in [53, 443, 0, 5057] {
            assert!(com(&|v| v["porta"] = porta.into()).is_err(), "porta {porta}");
        }
        assert!(com(&|v| v["versao"] = (base + SALTO_MAX_VERSAO + 1).into()).is_err());
        assert!(com(&|v| v["versao"] = u32::MAX.into()).is_err());
        assert!(com(&|v| v["parametroEvento"] = 2.into()).is_err());
    }
}
