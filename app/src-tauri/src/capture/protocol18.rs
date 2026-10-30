//! Desserialização do Protocol18 do Photon (o formato que o Albion usa hoje; conferido em 30/10/2026 no
//! `albiondata-client`, que é MIT, e no StatisticsAnalysis). Código próprio, escrito a partir do formato:
//!
//! - inteiros de tamanho fixo e ponto flutuante em little-endian;
//! - contagens e tamanhos em varint (7 bits por byte, bit alto = continua);
//! - `CompressedInt`/`CompressedLong` em varint com zigzag;
//! - tipos "zero" e "booleano verdadeiro/falso" sem bytes de valor;
//! - array tipado = `0x40 | tipo`; tipo customizado "slim" = `0x80 | id`.
//!
//! Tudo é lido com limite: nada aqui entra em pânico com pacote estragado ou hostil (cada leitura confere o que
//! sobra, coleções têm teto, a recursão tem profundidade máxima e cada mensagem tem um orçamento de valores
//! proporcional ao tamanho dela, para tipo "zero" de 0 byte não multiplicar memória).

use std::fmt;

pub const T_UNKNOWN: u8 = 0;
pub const T_BOOLEAN: u8 = 2;
pub const T_BYTE: u8 = 3;
pub const T_SHORT: u8 = 4;
pub const T_FLOAT: u8 = 5;
pub const T_DOUBLE: u8 = 6;
pub const T_STRING: u8 = 7;
pub const T_NULL: u8 = 8;
pub const T_CINT: u8 = 9;
pub const T_CLONG: u8 = 10;
pub const T_INT1: u8 = 11;
pub const T_INT1_NEG: u8 = 12;
pub const T_INT2: u8 = 13;
pub const T_INT2_NEG: u8 = 14;
pub const T_LONG1: u8 = 15;
pub const T_LONG1_NEG: u8 = 16;
pub const T_LONG2: u8 = 17;
pub const T_LONG2_NEG: u8 = 18;
pub const T_CUSTOM: u8 = 19;
pub const T_DICTIONARY: u8 = 20;
pub const T_HASHTABLE: u8 = 21;
pub const T_OBJECT_ARRAY: u8 = 23;
pub const T_OP_REQUEST: u8 = 24;
pub const T_OP_RESPONSE: u8 = 25;
pub const T_EVENT_DATA: u8 = 26;
pub const T_FALSE: u8 = 27;
pub const T_TRUE: u8 = 28;
pub const T_SHORT_ZERO: u8 = 29;
pub const T_INT_ZERO: u8 = 30;
pub const T_LONG_ZERO: u8 = 31;
pub const T_FLOAT_ZERO: u8 = 32;
pub const T_DOUBLE_ZERO: u8 = 33;
pub const T_BYTE_ZERO: u8 = 34;
pub const T_ARRAY: u8 = 0x40;
pub const T_CUSTOM_SLIM: u8 = 0x80;

/// Maior coleção aceita (elementos). Nenhuma mensagem do jogo chega perto; serve para recusar lixo.
pub const MAX_ITENS: usize = 1 << 16;
/// Profundidade máxima de coleções aninhadas.
pub const MAX_PROFUNDIDADE: usize = 24;
/// Folga de valores além de 1 por byte da mensagem (tipos "zero" e booleanos não gastam byte).
pub const FOLGA_VALORES: usize = 4096;
/// Teto absoluto de valores por mensagem, seja qual for o tamanho dela (~32 B cada: uns 8 MB no pior caso).
pub const MAX_VALORES: usize = 262_144;
/// Array de um tipo que não gasta byte (zero, nulo, verdadeiro/falso) aceita no máximo isto.
pub const MAX_ITENS_SEM_LARGURA: usize = 4096;

/// Um valor desserializado. Mantido simples: o interpretador só precisa de números, textos e booleanos.
#[derive(Debug, Clone, PartialEq)]
pub enum Valor {
    Nulo,
    Bool(bool),
    Byte(u8),
    Short(i16),
    Int(i32),
    Long(i64),
    Float(f32),
    Double(f64),
    Texto(String),
    Bytes(Vec<u8>),
    Lista(Vec<Valor>),
    Mapa(Vec<(Valor, Valor)>),
    Custom { id: u8, dados: Vec<u8> },
    /// Operação ou evento aninhado (raro); o conteúdo é descartado.
    Aninhado,
}

impl Valor {
    /// Número inteiro, venha ele como byte, short, int ou long.
    pub fn inteiro(&self) -> Option<i64> {
        match *self {
            Valor::Byte(v) => Some(v as i64),
            Valor::Short(v) => Some(v as i64),
            Valor::Int(v) => Some(v as i64),
            Valor::Long(v) => Some(v),
            _ => None,
        }
    }

    pub fn texto(&self) -> Option<&str> {
        match self {
            Valor::Texto(s) => Some(s),
            _ => None,
        }
    }

    pub fn booleano(&self) -> Option<bool> {
        match *self {
            Valor::Bool(b) => Some(b),
            Valor::Byte(b) => Some(b != 0),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Erro {
    Fim,
    TipoDesconhecido(u8),
    ColecaoGrande(usize),
    Profundo,
    Utf8,
}

impl fmt::Display for Erro {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Erro::Fim => write!(f, "mensagem terminou antes do esperado"),
            Erro::TipoDesconhecido(t) => write!(f, "tipo desconhecido 0x{t:02X}"),
            Erro::ColecaoGrande(n) => write!(f, "coleção grande demais ({n})"),
            Erro::Profundo => write!(f, "aninhamento profundo demais"),
            Erro::Utf8 => write!(f, "texto inválido"),
        }
    }
}

/// Leitor com posição, checagem de limite e orçamento de valores.
pub struct Leitor<'a> {
    buf: &'a [u8],
    pos: usize,
    /// Quantos `Valor` ainda podem ser criados nesta mensagem.
    orcamento: usize,
}

impl<'a> Leitor<'a> {
    pub fn new(buf: &'a [u8]) -> Self {
        Self { buf, pos: 0, orcamento: (buf.len() + FOLGA_VALORES).min(MAX_VALORES) }
    }

    /// Gasta `n` valores do orçamento; mensagem que pede mais do que o tamanho dela justifica é recusada.
    fn gastar(&mut self, n: usize) -> Result<(), Erro> {
        if n > self.orcamento {
            self.orcamento = 0;
            return Err(Erro::ColecaoGrande(n));
        }
        self.orcamento -= n;
        Ok(())
    }

    /// Contagem de uma coleção. Elemento que gasta ao menos 1 byte (`sem_largura = false`): a contagem não pode
    /// passar dos bytes que sobram. Elemento de tipo "zero": teto pequeno fixo.
    fn contagem_elementos(&mut self, sem_largura: bool) -> Result<usize, Erro> {
        let n = self.contagem()?;
        self.conferir_contagem(n, sem_largura)
    }

    fn conferir_contagem(&self, n: usize, sem_largura: bool) -> Result<usize, Erro> {
        let teto = if sem_largura { MAX_ITENS_SEM_LARGURA } else { self.resta() };
        if n > teto {
            return Err(Erro::ColecaoGrande(n));
        }
        Ok(n)
    }

    pub fn resta(&self) -> usize {
        self.buf.len() - self.pos
    }

    pub fn u8(&mut self) -> Result<u8, Erro> {
        let b = *self.buf.get(self.pos).ok_or(Erro::Fim)?;
        self.pos += 1;
        Ok(b)
    }

    pub fn bytes(&mut self, n: usize) -> Result<&'a [u8], Erro> {
        if self.resta() < n {
            return Err(Erro::Fim);
        }
        let s = &self.buf[self.pos..self.pos + n];
        self.pos += n;
        Ok(s)
    }

    fn arr<const N: usize>(&mut self) -> Result<[u8; N], Erro> {
        let s = self.bytes(N)?;
        let mut a = [0u8; N];
        a.copy_from_slice(s);
        Ok(a)
    }

    pub fn u16_le(&mut self) -> Result<u16, Erro> {
        Ok(u16::from_le_bytes(self.arr()?))
    }

    pub fn i16_le(&mut self) -> Result<i16, Erro> {
        Ok(i16::from_le_bytes(self.arr()?))
    }

    /// Varint sem sinal de até 32 bits.
    pub fn varint32(&mut self) -> Result<u32, Erro> {
        let mut v: u32 = 0;
        for i in 0..5 {
            let b = self.u8()?;
            v |= ((b & 0x7F) as u32) << (7 * i);
            if b & 0x80 == 0 {
                return Ok(v);
            }
        }
        Err(Erro::Fim)
    }

    /// Varint sem sinal de até 64 bits.
    pub fn varint64(&mut self) -> Result<u64, Erro> {
        let mut v: u64 = 0;
        for i in 0..10 {
            let b = self.u8()?;
            v |= ((b & 0x7F) as u64) << (7 * i);
            if b & 0x80 == 0 {
                return Ok(v);
            }
        }
        Err(Erro::Fim)
    }

    fn contagem(&mut self) -> Result<usize, Erro> {
        let n = self.varint32()? as usize;
        if n > MAX_ITENS {
            return Err(Erro::ColecaoGrande(n));
        }
        Ok(n)
    }

    fn texto(&mut self) -> Result<String, Erro> {
        let n = self.varint32()? as usize;
        let b = self.bytes(n)?;
        String::from_utf8(b.to_vec()).map_err(|_| Erro::Utf8)
    }
}

/// Tipo cujo valor não ocupa nenhum byte depois do tipo.
fn largura_zero(t: u8) -> bool {
    matches!(
        t,
        T_UNKNOWN
            | T_NULL
            | T_FALSE
            | T_TRUE
            | T_SHORT_ZERO
            | T_INT_ZERO
            | T_LONG_ZERO
            | T_FLOAT_ZERO
            | T_DOUBLE_ZERO
            | T_BYTE_ZERO
    )
}

fn zigzag32(v: u32) -> i32 {
    ((v >> 1) as i32) ^ -((v & 1) as i32)
}

fn zigzag64(v: u64) -> i64 {
    ((v >> 1) as i64) ^ -((v & 1) as i64)
}

/// Tabela de parâmetros (`chave u8 → valor`) de requisição, resposta e evento.
pub type Parametros = Vec<(u8, Valor)>;

/// Busca um parâmetro pela chave.
pub fn param(p: &Parametros, chave: u8) -> Option<&Valor> {
    p.iter().find(|(k, _)| *k == chave).map(|(_, v)| v)
}

/// Lê `contagem varint | (chave | tipo | valor)*`.
pub fn ler_parametros(r: &mut Leitor<'_>) -> Result<Parametros, Erro> {
    ler_parametros_n(r, 0)
}

fn ler_parametros_n(r: &mut Leitor<'_>, prof: usize) -> Result<Parametros, Erro> {
    // Cada parâmetro tem chave e tipo: 2 bytes ao menos.
    let n = r.contagem_elementos(false)?;
    let mut out = Vec::with_capacity(n.min(64));
    for _ in 0..n {
        let k = r.u8()?;
        let t = r.u8()?;
        out.push((k, ler_valor(r, t, prof)?));
    }
    Ok(out)
}

/// Lê um valor do tipo `t`.
pub fn ler_valor(r: &mut Leitor<'_>, t: u8, prof: usize) -> Result<Valor, Erro> {
    if prof > MAX_PROFUNDIDADE {
        return Err(Erro::Profundo);
    }
    r.gastar(1)?;
    if t >= T_CUSTOM_SLIM {
        return custom(r, t & 0x7F, true);
    }
    Ok(match t {
        T_UNKNOWN | T_NULL => Valor::Nulo,
        T_BOOLEAN => Valor::Bool(r.u8()? != 0),
        T_BYTE => Valor::Byte(r.u8()?),
        T_SHORT => Valor::Short(r.i16_le()?),
        T_FLOAT => Valor::Float(f32::from_le_bytes(r.arr()?)),
        T_DOUBLE => Valor::Double(f64::from_le_bytes(r.arr()?)),
        T_STRING => Valor::Texto(r.texto()?),
        T_CINT => Valor::Int(zigzag32(r.varint32()?)),
        T_CLONG => Valor::Long(zigzag64(r.varint64()?)),
        T_INT1 => Valor::Int(r.u8()? as i32),
        T_INT1_NEG => Valor::Int(-(r.u8()? as i32)),
        T_INT2 => Valor::Int(r.u16_le()? as i32),
        T_INT2_NEG => Valor::Int(-(r.u16_le()? as i32)),
        T_LONG1 => Valor::Long(r.u8()? as i64),
        T_LONG1_NEG => Valor::Long(-(r.u8()? as i64)),
        T_LONG2 => Valor::Long(r.u16_le()? as i64),
        T_LONG2_NEG => Valor::Long(-(r.u16_le()? as i64)),
        T_CUSTOM => {
            let id = r.u8()?;
            return custom(r, id, false);
        }
        T_DICTIONARY | T_HASHTABLE => dicionario(r, prof + 1)?,
        T_OBJECT_ARRAY => {
            // Cada elemento traz o próprio tipo: ao menos 1 byte.
            let n = r.contagem_elementos(false)?;
            let mut v = Vec::with_capacity(n.min(256));
            for _ in 0..n {
                let tt = r.u8()?;
                v.push(ler_valor(r, tt, prof + 1)?);
            }
            Valor::Lista(v)
        }
        T_OP_REQUEST => {
            r.u8()?;
            ler_parametros_n(r, prof + 1)?;
            Valor::Aninhado
        }
        T_OP_RESPONSE => {
            r.u8()?;
            r.i16_le()?;
            if r.resta() > 0 {
                let tt = r.u8()?;
                ler_valor(r, tt, prof + 1)?;
            }
            ler_parametros_n(r, prof + 1)?;
            Valor::Aninhado
        }
        T_EVENT_DATA => {
            r.u8()?;
            ler_parametros_n(r, prof + 1)?;
            Valor::Aninhado
        }
        T_FALSE => Valor::Bool(false),
        T_TRUE => Valor::Bool(true),
        T_SHORT_ZERO => Valor::Short(0),
        T_INT_ZERO => Valor::Int(0),
        T_LONG_ZERO => Valor::Long(0),
        T_FLOAT_ZERO => Valor::Float(0.0),
        T_DOUBLE_ZERO => Valor::Double(0.0),
        T_BYTE_ZERO => Valor::Byte(0),
        T_ARRAY => {
            // Array "aninhado": contagem | tipo | elementos.
            let n = r.contagem()?;
            let tt = r.u8()?;
            r.conferir_contagem(n, largura_zero(tt))?;
            let mut v = Vec::with_capacity(n.min(256));
            for _ in 0..n {
                v.push(ler_valor(r, tt, prof + 1)?);
            }
            Valor::Lista(v)
        }
        _ if t & T_ARRAY == T_ARRAY => array_tipado(r, t & !T_ARRAY, prof + 1)?,
        _ => return Err(Erro::TipoDesconhecido(t)),
    })
}

fn custom(r: &mut Leitor<'_>, id: u8, slim: bool) -> Result<Valor, Erro> {
    let n = r.varint32()? as usize;
    if n > r.resta() {
        if slim {
            // Slim sem tamanho confiável: o resto da mensagem é dele.
            let resto = r.resta();
            return Ok(Valor::Custom { id, dados: r.bytes(resto)?.to_vec() });
        }
        return Err(Erro::Fim);
    }
    Ok(Valor::Custom { id, dados: r.bytes(n)?.to_vec() })
}

fn dicionario(r: &mut Leitor<'_>, prof: usize) -> Result<Valor, Erro> {
    if prof > MAX_PROFUNDIDADE {
        return Err(Erro::Profundo);
    }
    let tk = r.u8()?;
    let tv = r.u8()?;
    // Tipo 0 = cada chave/valor traz o próprio tipo (1 byte ao menos).
    let sem_largura = tk != 0 && tv != 0 && largura_zero(tk) && largura_zero(tv);
    let n = r.contagem_elementos(sem_largura)?;
    let mut out = Vec::with_capacity(n.min(256));
    for _ in 0..n {
        let k_t = if tk == 0 { r.u8()? } else { tk };
        let k = ler_valor(r, k_t, prof)?;
        let v_t = if tv == 0 { r.u8()? } else { tv };
        let v = ler_valor(r, v_t, prof)?;
        out.push((k, v));
    }
    Ok(Valor::Mapa(out))
}

fn array_tipado(r: &mut Leitor<'_>, t: u8, prof: usize) -> Result<Valor, Erro> {
    if prof > MAX_PROFUNDIDADE {
        return Err(Erro::Profundo);
    }
    let n = r.contagem()?;
    Ok(match t {
        T_BOOLEAN => {
            // 8 valores por byte: o orçamento é que segura a multiplicação.
            let b = r.bytes(n.div_ceil(8))?;
            r.gastar(n)?;
            Valor::Lista((0..n).map(|i| Valor::Bool(b[i / 8] & (1 << (i % 8)) != 0)).collect())
        }
        T_BYTE => Valor::Bytes(r.bytes(n)?.to_vec()),
        T_CUSTOM => {
            let id = r.u8()?;
            r.conferir_contagem(n, false)?;
            r.gastar(n)?;
            let mut v = Vec::with_capacity(n.min(256));
            for _ in 0..n {
                v.push(custom(r, id, false)?);
            }
            Valor::Lista(v)
        }
        _ => {
            r.conferir_contagem(n, largura_zero(t))?;
            let mut v = Vec::with_capacity(n.min(256));
            for _ in 0..n {
                v.push(ler_valor(r, t, prof)?);
            }
            Valor::Lista(v)
        }
    })
}

// ---------------------------------------------------------------------------------------------------------------
// Codificador mínimo, só para os testes montarem pacotes de verdade em vez de hex escrito à mão.
#[cfg(test)]
pub mod enc {
    use super::*;

    pub fn varint(mut v: u64, out: &mut Vec<u8>) {
        loop {
            let b = (v & 0x7F) as u8;
            v >>= 7;
            if v == 0 {
                out.push(b);
                return;
            }
            out.push(b | 0x80);
        }
    }

    /// Escreve tipo + valor, escolhendo a forma compacta como o jogo faz.
    pub fn valor(v: &Valor, out: &mut Vec<u8>) {
        match v {
            Valor::Nulo => out.push(T_NULL),
            Valor::Bool(true) => out.push(T_TRUE),
            Valor::Bool(false) => out.push(T_FALSE),
            Valor::Byte(b) => {
                out.push(T_BYTE);
                out.push(*b);
            }
            Valor::Short(s) => {
                out.push(T_SHORT);
                out.extend_from_slice(&s.to_le_bytes());
            }
            Valor::Int(i) => {
                out.push(T_CINT);
                varint(((*i << 1) ^ (*i >> 31)) as u32 as u64, out);
            }
            Valor::Long(l) => {
                out.push(T_CLONG);
                varint(((*l << 1) ^ (*l >> 63)) as u64, out);
            }
            Valor::Float(f) => {
                out.push(T_FLOAT);
                out.extend_from_slice(&f.to_le_bytes());
            }
            Valor::Double(d) => {
                out.push(T_DOUBLE);
                out.extend_from_slice(&d.to_le_bytes());
            }
            Valor::Texto(s) => {
                out.push(T_STRING);
                varint(s.len() as u64, out);
                out.extend_from_slice(s.as_bytes());
            }
            Valor::Bytes(b) => {
                out.push(T_ARRAY | T_BYTE);
                varint(b.len() as u64, out);
                out.extend_from_slice(b);
            }
            Valor::Lista(l) => {
                out.push(T_OBJECT_ARRAY);
                varint(l.len() as u64, out);
                for x in l {
                    valor(x, out);
                }
            }
            Valor::Mapa(m) => {
                out.push(T_HASHTABLE);
                out.push(0);
                out.push(0);
                varint(m.len() as u64, out);
                for (k, v) in m {
                    valor(k, out);
                    valor(v, out);
                }
            }
            Valor::Custom { id, dados } => {
                out.push(T_CUSTOM);
                out.push(*id);
                varint(dados.len() as u64, out);
                out.extend_from_slice(dados);
            }
            Valor::Aninhado => out.push(T_NULL),
        }
    }

    pub fn parametros(p: &[(u8, Valor)], out: &mut Vec<u8>) {
        varint(p.len() as u64, out);
        for (k, v) in p {
            out.push(*k);
            valor(v, out);
        }
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    fn ida_e_volta(v: Valor) -> Valor {
        let mut b = Vec::new();
        enc::valor(&v, &mut b);
        let mut r = Leitor::new(&b);
        let t = r.u8().unwrap();
        let lido = ler_valor(&mut r, t, 0).unwrap();
        assert_eq!(r.resta(), 0, "sobrou byte em {v:?}");
        lido
    }

    #[test]
    fn tipos_basicos() {
        for v in [
            Valor::Nulo,
            Valor::Bool(true),
            Valor::Bool(false),
            Valor::Byte(200),
            Valor::Short(-1234),
            Valor::Int(-7),
            Valor::Int(i32::MAX),
            Valor::Int(i32::MIN),
            Valor::Long(58_119_100_063_470),
            Valor::Long(-1),
            Valor::Float(1.5),
            Valor::Double(-2.25),
            Valor::Texto("Martlock ção".into()),
            Valor::Bytes(vec![1, 2, 3]),
            Valor::Lista(vec![Valor::Int(1), Valor::Texto("a".into())]),
            Valor::Mapa(vec![(Valor::Byte(1), Valor::Long(9))]),
            Valor::Custom { id: 7, dados: vec![9, 9] },
        ] {
            assert_eq!(ida_e_volta(v.clone()), v);
        }
    }

    #[test]
    fn inteiros_compactos_do_jogo() {
        let casos: &[(&[u8], Valor)] = &[
            (&[T_INT1, 200], Valor::Int(200)),
            (&[T_INT1_NEG, 5], Valor::Int(-5)),
            (&[T_INT2, 0x34, 0x12], Valor::Int(0x1234)),
            (&[T_INT2_NEG, 0x01, 0x01], Valor::Int(-257)),
            (&[T_LONG1, 7], Valor::Long(7)),
            (&[T_LONG2_NEG, 0x00, 0x01], Valor::Long(-256)),
            (&[T_INT_ZERO], Valor::Int(0)),
            (&[T_LONG_ZERO], Valor::Long(0)),
            (&[T_BYTE_ZERO], Valor::Byte(0)),
            (&[T_SHORT_ZERO], Valor::Short(0)),
        ];
        for (b, esperado) in casos {
            let mut r = Leitor::new(b);
            let t = r.u8().unwrap();
            assert_eq!(&ler_valor(&mut r, t, 0).unwrap(), esperado);
        }
    }

    #[test]
    fn arrays_tipados() {
        // [true, false, true] em bits
        let b = [T_ARRAY | T_BOOLEAN, 3, 0b101];
        let mut r = Leitor::new(&b);
        let t = r.u8().unwrap();
        assert_eq!(
            ler_valor(&mut r, t, 0).unwrap(),
            Valor::Lista(vec![Valor::Bool(true), Valor::Bool(false), Valor::Bool(true)])
        );
        // array de strings
        let b = [T_ARRAY | T_STRING, 2, 1, b'a', 2, b'b', b'c'];
        let mut r = Leitor::new(&b);
        let t = r.u8().unwrap();
        assert_eq!(
            ler_valor(&mut r, t, 0).unwrap(),
            Valor::Lista(vec![Valor::Texto("a".into()), Valor::Texto("bc".into())])
        );
        // array de compressed int com zigzag (1 → 2, -1 → 1)
        let b = [T_ARRAY | T_CINT, 2, 2, 1];
        let mut r = Leitor::new(&b);
        let t = r.u8().unwrap();
        assert_eq!(ler_valor(&mut r, t, 0).unwrap(), Valor::Lista(vec![Valor::Int(1), Valor::Int(-1)]));
    }

    #[test]
    fn lixo_nao_entra_em_panico() {
        // contagem gigante, texto cortado, tipo inexistente, aninhamento infinito
        let casos: Vec<Vec<u8>> = vec![
            vec![T_OBJECT_ARRAY, 0xFF, 0xFF, 0xFF, 0x7F],
            vec![T_STRING, 50, b'a'],
            vec![0x3F],
            std::iter::repeat([T_OBJECT_ARRAY, 1]).take(100).flatten().collect(),
            vec![T_ARRAY | T_INT_ZERO, 0xFF, 0xFF, 0x07],
        ];
        for b in casos {
            let mut r = Leitor::new(&b);
            let t = r.u8().unwrap();
            assert!(ler_valor(&mut r, t, 0).is_err(), "{b:?} deveria falhar");
        }
    }

    /// Pacote hostil de ~1200 bytes que, sem orçamento, viraria ~18 milhões de `Valor` (centenas de MB).
    #[test]
    fn tipo_zero_nao_multiplica_memoria() {
        // Array de 65536 inteiros "zero" (0 byte cada), repetido 287 vezes num object array.
        let mut b = vec![T_OBJECT_ARRAY];
        enc::varint(287, &mut b);
        for _ in 0..287 {
            b.extend_from_slice(&[T_ARRAY | T_INT_ZERO, 0x80, 0x80, 0x04]);
        }
        let mut r = Leitor::new(&b);
        let t = r.u8().unwrap();
        assert!(matches!(ler_valor(&mut r, t, 0), Err(Erro::ColecaoGrande(_))));

        // Abaixo do teto por array (4096), mas 300 deles estouram o orçamento da mensagem.
        let mut b = vec![T_OBJECT_ARRAY];
        enc::varint(300, &mut b);
        for _ in 0..300 {
            b.push(T_ARRAY | T_INT_ZERO);
            enc::varint(4096, &mut b);
        }
        let mut r = Leitor::new(&b);
        let t = r.u8().unwrap();
        assert!(matches!(ler_valor(&mut r, t, 0), Err(Erro::ColecaoGrande(_))));

        // Mesma coisa com o tipo da coleção fixo (array aninhado 0x40) e com dicionário de chave e valor "zero".
        let mut b = vec![T_ARRAY];
        enc::varint(300, &mut b);
        b.push(T_ARRAY | T_NULL);
        for _ in 0..300 {
            enc::varint(4096, &mut b);
        }
        let mut r = Leitor::new(&b);
        let t = r.u8().unwrap();
        assert!(ler_valor(&mut r, t, 0).is_err());
        let b = [T_HASHTABLE, T_INT_ZERO, T_TRUE, 0xFF, 0xFF, 0x03];
        let mut r = Leitor::new(&b);
        let t = r.u8().unwrap();
        assert!(ler_valor(&mut r, t, 0).is_err());

        // Contagem maior que os bytes que sobram, em tipo que gasta byte: recusada antes de alocar.
        let b = [T_ARRAY | T_STRING, 0xFF, 0xFF, 0x03, 1, b'a'];
        let mut r = Leitor::new(&b);
        let t = r.u8().unwrap();
        assert!(matches!(ler_valor(&mut r, t, 0), Err(Erro::ColecaoGrande(_))));
    }

    /// O orçamento não atrapalha mensagem normal: um array grande de zeros e uma lista longa passam.
    #[test]
    fn orcamento_aceita_mensagem_normal() {
        let mut b = vec![T_ARRAY | T_INT_ZERO];
        enc::varint(4000, &mut b);
        let mut r = Leitor::new(&b);
        let t = r.u8().unwrap();
        assert!(matches!(ler_valor(&mut r, t, 0), Ok(Valor::Lista(v)) if v.len() == 4000));

        let lista = Valor::Lista((0..5000).map(Valor::Int).collect());
        assert_eq!(ida_e_volta(lista.clone()), lista);
    }
}
