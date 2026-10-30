//! Do quadro capturado (Ethernet, loopback ou IP cru) até o conteúdo UDP. Só IPv4/IPv6 + UDP; fragmento de IP é
//! ignorado (o Photon manda datagramas de ~1200 bytes, abaixo do MTU).

/// Tipos de enlace do pcap (`pcap_datalink`).
pub const DLT_NULL: i32 = 0;
pub const DLT_EN10MB: i32 = 1;
pub const DLT_RAW: i32 = 12;
pub const DLT_LOOP: i32 = 108;
pub const DLT_RAW_101: i32 = 101;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Fluxo {
    pub origem: Vec<u8>,
    pub porta_origem: u16,
    pub destino: Vec<u8>,
    pub porta_destino: u16,
}

#[derive(Debug, PartialEq)]
pub struct Udp<'a> {
    pub fluxo: Fluxo,
    pub dados: &'a [u8],
}

/// Extrai o UDP de um quadro. `None` se não for UDP sobre IP ou estiver cortado.
pub fn udp(enlace: i32, q: &[u8]) -> Option<Udp<'_>> {
    let ip = match enlace {
        DLT_EN10MB => {
            if q.len() < 14 {
                return None;
            }
            let mut tipo = u16::from_be_bytes([q[12], q[13]]);
            let mut ini = 14;
            // VLAN 802.1Q (pode vir empilhada)
            while tipo == 0x8100 || tipo == 0x88A8 {
                if q.len() < ini + 4 {
                    return None;
                }
                tipo = u16::from_be_bytes([q[ini + 2], q[ini + 3]]);
                ini += 4;
            }
            if tipo != 0x0800 && tipo != 0x86DD {
                return None;
            }
            &q[ini..]
        }
        DLT_NULL | DLT_LOOP => q.get(4..)?,
        DLT_RAW | DLT_RAW_101 => q,
        _ => return None,
    };
    ip_udp(ip)
}

fn ip_udp(ip: &[u8]) -> Option<Udp<'_>> {
    let versao = ip.first()? >> 4;
    let (origem, destino, seg) = match versao {
        4 => {
            let ihl = ((ip[0] & 0x0F) as usize) * 4;
            if ihl < 20 || ip.len() < ihl || ip[9] != 17 {
                return None;
            }
            let frag = u16::from_be_bytes([ip[6], ip[7]]);
            if frag & 0x3FFF != 0 {
                return None; // fragmento de IP (mais fragmentos ou deslocamento)
            }
            let total = (u16::from_be_bytes([ip[2], ip[3]]) as usize).clamp(ihl, ip.len());
            (ip[12..16].to_vec(), ip[16..20].to_vec(), &ip[ihl..total])
        }
        6 => {
            if ip.len() < 40 || ip[6] != 17 {
                return None; // sem cabeçalho de extensão
            }
            let carga = u16::from_be_bytes([ip[4], ip[5]]) as usize;
            let fim = (40 + carga).min(ip.len());
            (ip[8..24].to_vec(), ip[24..40].to_vec(), &ip[40..fim])
        }
        _ => return None,
    };
    if seg.len() < 8 {
        return None;
    }
    let porta_origem = u16::from_be_bytes([seg[0], seg[1]]);
    let porta_destino = u16::from_be_bytes([seg[2], seg[3]]);
    let tam = (u16::from_be_bytes([seg[4], seg[5]]) as usize).clamp(8, seg.len());
    Some(Udp { fluxo: Fluxo { origem, porta_origem, destino, porta_destino }, dados: &seg[8..tam] })
}

#[cfg(test)]
pub mod testes {
    use super::*;

    /// Quadro Ethernet + IPv4 + UDP com o conteúdo dado.
    pub fn quadro(porta_origem: u16, porta_destino: u16, dados: &[u8]) -> Vec<u8> {
        let mut q = vec![0u8; 12];
        q.extend_from_slice(&0x0800u16.to_be_bytes());
        let total = 20 + 8 + dados.len();
        let mut ip = vec![0x45, 0, 0, 0, 0, 0, 0x40, 0, 64, 17, 0, 0, 10, 0, 0, 2, 5, 188, 1, 1];
        ip[2..4].copy_from_slice(&(total as u16).to_be_bytes());
        q.extend(ip);
        q.extend_from_slice(&porta_origem.to_be_bytes());
        q.extend_from_slice(&porta_destino.to_be_bytes());
        q.extend_from_slice(&((8 + dados.len()) as u16).to_be_bytes());
        q.extend_from_slice(&[0, 0]);
        q.extend_from_slice(dados);
        q.extend_from_slice(&[0xEE; 6]); // enchimento do Ethernet não pode entrar no UDP
        q
    }

    #[test]
    fn ethernet_ipv4_udp() {
        let q = quadro(5056, 50000, b"photon");
        let u = udp(DLT_EN10MB, &q).unwrap();
        assert_eq!(u.dados, b"photon");
        assert_eq!(u.fluxo.porta_origem, 5056);
        assert_eq!(u.fluxo.origem, vec![10, 0, 0, 2]);
    }

    #[test]
    fn vlan_loopback_e_lixo() {
        let q = quadro(5056, 1, b"x");
        let mut v = q[..12].to_vec();
        v.extend_from_slice(&[0x81, 0x00, 0x00, 0x05]);
        v.extend_from_slice(&q[12..]);
        assert_eq!(udp(DLT_EN10MB, &v).unwrap().dados, b"x");
        let mut lo = vec![2, 0, 0, 0];
        lo.extend_from_slice(&q[14..]);
        assert_eq!(udp(DLT_NULL, &lo).unwrap().dados, b"x");
        assert!(udp(DLT_EN10MB, &q[..20]).is_none());
        assert!(udp(999, &q).is_none());
        let mut tcp = q.clone();
        tcp[14 + 9] = 6;
        assert!(udp(DLT_EN10MB, &tcp).is_none());
    }
}
