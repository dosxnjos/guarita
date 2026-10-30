//! Npcap carregado em tempo de execução (nada de SDK no build): `wpcap.dll` da pasta do Npcap. Sem o Npcap, a
//! captura só explica como instalar. Só leitura passiva: nenhuma função de envio (`pcap_sendpacket`) é carregada.

use std::ffi::{c_char, c_int, c_long, c_uint, c_void, CStr, CString};
use std::sync::Arc;

#[cfg(windows)]
pub const PASTA_NPCAP: &str = r"C:\Windows\System32\Npcap";

pub const ERRBUF: usize = 256;
const PCAP_IF_LOOPBACK: c_uint = 0x1;
const PCAP_NETMASK_UNKNOWN: c_uint = 0xFFFF_FFFF;

#[repr(C)]
struct PcapIf {
    next: *mut PcapIf,
    name: *mut c_char,
    description: *mut c_char,
    addresses: *mut c_void,
    flags: c_uint,
}

#[repr(C)]
struct Timeval {
    tv_sec: c_long,
    tv_usec: c_long,
}

#[repr(C)]
pub struct PcapPkthdr {
    ts: Timeval,
    caplen: c_uint,
    len: c_uint,
}

#[repr(C)]
struct BpfProgram {
    bf_len: c_uint,
    bf_insns: *mut c_void,
}

type FindAllDevs = unsafe extern "C" fn(*mut *mut PcapIf, *mut c_char) -> c_int;
type FreeAllDevs = unsafe extern "C" fn(*mut PcapIf);
type OpenLive = unsafe extern "C" fn(*const c_char, c_int, c_int, c_int, *mut c_char) -> *mut c_void;
type Compile = unsafe extern "C" fn(*mut c_void, *mut BpfProgram, *const c_char, c_int, c_uint) -> c_int;
type SetFilter = unsafe extern "C" fn(*mut c_void, *mut BpfProgram) -> c_int;
type FreeCode = unsafe extern "C" fn(*mut BpfProgram);
type NextEx = unsafe extern "C" fn(*mut c_void, *mut *mut PcapPkthdr, *mut *const u8) -> c_int;
type Datalink = unsafe extern "C" fn(*mut c_void) -> c_int;
type Close = unsafe extern "C" fn(*mut c_void);
type GetErr = unsafe extern "C" fn(*mut c_void) -> *const c_char;
type LibVersion = unsafe extern "C" fn() -> *const c_char;

/// Funções do Npcap carregadas. As bibliotecas ficam vivas enquanto houver uma referência.
pub struct Npcap {
    #[allow(dead_code)]
    bibliotecas: Vec<libloading::Library>,
    find_all: FindAllDevs,
    free_all: FreeAllDevs,
    open_live: OpenLive,
    compile: Compile,
    set_filter: SetFilter,
    free_code: FreeCode,
    next_ex: NextEx,
    datalink: Datalink,
    close: Close,
    get_err: GetErr,
    pub versao: String,
}

// As funções do pcap podem ser chamadas de qualquer thread (cada handle fica numa thread só).
unsafe impl Send for Npcap {}
unsafe impl Sync for Npcap {}

#[derive(Debug, Clone)]
pub struct Interface {
    pub nome: String,
}

/// Por que não deu para carregar o Npcap.
#[derive(Debug, Clone, PartialEq)]
pub enum FalhaCarga {
    /// A DLL não existe (Npcap não instalado).
    NaoEncontrado,
    /// Existe, mas falta função ou não carregou (versão estranha, WinPcap antigo).
    Invalido(String),
}

fn cstr(p: *const c_char) -> String {
    if p.is_null() {
        return String::new();
    }
    unsafe { CStr::from_ptr(p) }.to_string_lossy().into_owned()
}

impl Npcap {
    /// Carrega `Packet.dll` e `wpcap.dll` da pasta do Npcap (caminho completo: `Packet.dll` primeiro, senão o
    /// Windows não acha a dependência do `wpcap.dll`, que não está no caminho de busca).
    #[cfg(windows)]
    pub fn carregar() -> Result<Arc<Npcap>, FalhaCarga> {
        let pasta = std::path::Path::new(PASTA_NPCAP);
        let wpcap = pasta.join("wpcap.dll");
        if !wpcap.exists() {
            return Err(FalhaCarga::NaoEncontrado);
        }
        let packet = unsafe { libloading::Library::new(pasta.join("Packet.dll")) }
            .map_err(|e| FalhaCarga::Invalido(format!("Packet.dll: {e}")))?;
        let lib = unsafe { libloading::Library::new(&wpcap) }
            .map_err(|e| FalhaCarga::Invalido(format!("wpcap.dll: {e}")))?;
        unsafe fn f<T: Copy>(lib: &libloading::Library, nome: &[u8]) -> Result<T, FalhaCarga> {
            lib.get::<T>(nome).map(|s| *s).map_err(|e| {
                FalhaCarga::Invalido(format!("{}: {e}", String::from_utf8_lossy(&nome[..nome.len() - 1])))
            })
        }
        unsafe {
            let versao: LibVersion = f(&lib, b"pcap_lib_version\0")?;
            let n = Npcap {
                find_all: f(&lib, b"pcap_findalldevs\0")?,
                free_all: f(&lib, b"pcap_freealldevs\0")?,
                open_live: f(&lib, b"pcap_open_live\0")?,
                compile: f(&lib, b"pcap_compile\0")?,
                set_filter: f(&lib, b"pcap_setfilter\0")?,
                free_code: f(&lib, b"pcap_freecode\0")?,
                next_ex: f(&lib, b"pcap_next_ex\0")?,
                datalink: f(&lib, b"pcap_datalink\0")?,
                close: f(&lib, b"pcap_close\0")?,
                get_err: f(&lib, b"pcap_geterr\0")?,
                versao: cstr(versao()),
                bibliotecas: vec![packet, lib],
            };
            Ok(Arc::new(n))
        }
    }

    #[cfg(not(windows))]
    pub fn carregar() -> Result<Arc<Npcap>, FalhaCarga> {
        Err(FalhaCarga::NaoEncontrado)
    }

    /// Interfaces de rede, menos loopback.
    pub fn interfaces(&self) -> Result<Vec<Interface>, String> {
        let mut lista: *mut PcapIf = std::ptr::null_mut();
        let mut err = [0 as c_char; ERRBUF];
        if unsafe { (self.find_all)(&mut lista, err.as_mut_ptr()) } != 0 {
            return Err(cstr(err.as_ptr()));
        }
        let mut out = Vec::new();
        let mut p = lista;
        while !p.is_null() {
            let i = unsafe { &*p };
            if i.flags & PCAP_IF_LOOPBACK == 0 {
                out.push(Interface { nome: cstr(i.name) });
            }
            p = i.next;
        }
        if !lista.is_null() {
            unsafe { (self.free_all)(lista) };
        }
        Ok(out)
    }

    /// Abre a interface só para ler, sem modo promíscuo, com o filtro BPF dado. `espera_ms` é o tempo máximo de
    /// cada leitura (a thread confere se deve parar entre uma e outra).
    pub fn abrir(self: &Arc<Self>, nome: &str, filtro: &str, snaplen: i32, espera_ms: i32) -> Result<Captura, String> {
        let dev = CString::new(nome).map_err(|e| e.to_string())?;
        let mut err = [0 as c_char; ERRBUF];
        let h = unsafe { (self.open_live)(dev.as_ptr(), snaplen, 0, espera_ms, err.as_mut_ptr()) };
        if h.is_null() {
            return Err(cstr(err.as_ptr()));
        }
        let cap = Captura { npcap: self.clone(), h };
        let f = CString::new(filtro).map_err(|e| e.to_string())?;
        let mut prog = BpfProgram { bf_len: 0, bf_insns: std::ptr::null_mut() };
        unsafe {
            if (self.compile)(h, &mut prog, f.as_ptr(), 1, PCAP_NETMASK_UNKNOWN) != 0 {
                return Err(format!("filtro: {}", cstr((self.get_err)(h))));
            }
            let r = (self.set_filter)(h, &mut prog);
            (self.free_code)(&mut prog);
            if r != 0 {
                return Err(format!("filtro: {}", cstr((self.get_err)(h))));
            }
        }
        Ok(cap)
    }
}

/// Um handle aberto. Fecha ao sair de escopo. Não é `Send`: nasce e morre na thread da interface.
pub struct Captura {
    npcap: Arc<Npcap>,
    h: *mut c_void,
}

pub enum Leitura<'a> {
    Pacote(&'a [u8]),
    Nada,
    Erro(String),
}

impl Captura {
    pub fn enlace(&self) -> i32 {
        unsafe { (self.npcap.datalink)(self.h) }
    }

    /// Próximo pacote (ou `Nada` quando a espera passou sem tráfego).
    pub fn proximo(&mut self) -> Leitura<'_> {
        let mut hdr: *mut PcapPkthdr = std::ptr::null_mut();
        let mut dados: *const u8 = std::ptr::null();
        match unsafe { (self.npcap.next_ex)(self.h, &mut hdr, &mut dados) } {
            1 if !hdr.is_null() && !dados.is_null() => {
                let n = unsafe { (*hdr).caplen } as usize;
                Leitura::Pacote(unsafe { std::slice::from_raw_parts(dados, n) })
            }
            0 | 1 => Leitura::Nada,
            _ => Leitura::Erro(cstr(unsafe { (self.npcap.get_err)(self.h) })),
        }
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    /// Sem o Npcap instalado (caso desta máquina de build), a carga diz "não encontrado" em vez de quebrar.
    #[test]
    fn sem_npcap_diz_nao_encontrado() {
        #[cfg(windows)]
        let instalado = std::path::Path::new(PASTA_NPCAP).join("wpcap.dll").exists();
        #[cfg(not(windows))]
        let instalado = false;
        match Npcap::carregar() {
            Err(FalhaCarga::NaoEncontrado) => assert!(!instalado),
            Ok(n) => {
                assert!(instalado);
                assert!(n.versao.contains("Npcap"), "versão: {}", n.versao);
                // Listar interfaces não captura nada; só confere que as funções carregadas respondem.
                let _ = n.interfaces();
            }
            Err(FalhaCarga::Invalido(e)) => panic!("Npcap presente mas inválido: {e}"),
        }
    }
}

impl Drop for Captura {
    fn drop(&mut self) {
        unsafe { (self.npcap.close)(self.h) };
    }
}
