// Verificação Ed25519 das interações do Discord (só Web Crypto: roda no Worker e no Node dos testes).
// O Discord assina `timestamp + corpo bruto` e manda X-Signature-Ed25519 (hex) e X-Signature-Timestamp.
// Assinatura inválida ou ausente → o chamador responde 401 (o portal testa isso ao salvar a URL).

/** Janela aceita entre o timestamp assinado e o relógio do Worker (contra reenvio de requisição antiga). */
export const MAX_SKEW_SECONDS = 5 * 60;

export interface VerifyResult {
  ok: boolean;
  /** Corpo bruto lido (só quando ok; o Request não pode ser lido duas vezes). */
  body: string;
  /** Motivo curto da rejeição, para log (nunca vai para a resposta). */
  reason?: string;
}

const enc = new TextEncoder();
// Chave importada por isolate: importar custa CPU e a chave pública não muda entre requisições.
const keyCache = new Map<string, Promise<CryptoKey>>();

/** Hex → bytes; null se não for hex válido de tamanho par. */
export function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  const h = hex.trim();
  if (h.length === 0 || h.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(h)) return null;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function importPublicKey(hex: string): Promise<CryptoKey> {
  const raw = hexToBytes(hex);
  if (!raw || raw.length !== 32) throw new Error('chave pública do Discord inválida (esperado 32 bytes em hex)');
  try {
    return await crypto.subtle.importKey('raw', raw, { name: 'Ed25519' }, false, ['verify']);
  } catch (err) {
    // Runtimes antigos do workerd só conheciam o nome não padronizado.
    if (err instanceof Error && err.name === 'NotSupportedError') {
      return await crypto.subtle.importKey('raw', raw, { name: 'NODE-ED25519', namedCurve: 'NODE-ED25519' } as unknown as Algorithm, false, ['verify']);
    }
    throw err;
  }
}

function getKey(hex: string): Promise<CryptoKey> {
  let p = keyCache.get(hex);
  if (!p) {
    p = importPublicKey(hex);
    // Falha não fica em cache (ex.: segredo corrigido sem reciclar o isolate).
    p.catch(() => keyCache.delete(hex));
    keyCache.set(hex, p);
  }
  return p;
}

/** Verifica assinatura + timestamp sobre o corpo já lido. Pura o bastante para testar sem Request. */
export async function verifySignature(
  publicKeyHex: string,
  signatureHex: string | null,
  timestamp: string | null,
  body: string,
  nowMs = Date.now(),
): Promise<{ ok: boolean; reason?: string }> {
  if (!publicKeyHex) return { ok: false, reason: 'DISCORD_PUBLIC_KEY ausente' };
  if (!signatureHex || !timestamp) return { ok: false, reason: 'cabeçalhos de assinatura ausentes' };
  if (!/^\d{1,12}$/.test(timestamp)) return { ok: false, reason: 'timestamp malformado' };
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > MAX_SKEW_SECONDS) return { ok: false, reason: 'timestamp fora da janela' };
  const sig = hexToBytes(signatureHex);
  if (!sig || sig.length !== 64) return { ok: false, reason: 'assinatura malformada' };
  let key: CryptoKey;
  try {
    key = await getKey(publicKeyHex);
  } catch (err) {
    return { ok: false, reason: String(err instanceof Error ? err.message : err) };
  }
  try {
    const ok = await crypto.subtle.verify({ name: key.algorithm.name }, key, sig, enc.encode(timestamp + body));
    return ok ? { ok: true } : { ok: false, reason: 'assinatura não confere' };
  } catch (err) {
    return { ok: false, reason: 'falha ao verificar: ' + String(err) };
  }
}

/** Lê o corpo do Request e verifica. Use o `body` devolvido em vez de ler o Request de novo. */
export async function verifyDiscordRequest(request: Request, publicKeyHex: string, nowMs = Date.now()): Promise<VerifyResult> {
  const signature = request.headers.get('X-Signature-Ed25519');
  const timestamp = request.headers.get('X-Signature-Timestamp');
  // Sem cabeçalho nem lê o corpo: rejeição barata.
  if (!signature || !timestamp) return { ok: false, body: '', reason: 'cabeçalhos de assinatura ausentes' };
  const body = await request.text();
  const r = await verifySignature(publicKeyHex, signature, timestamp, body, nowMs);
  return r.ok ? { ok: true, body } : { ok: false, body: '', reason: r.reason };
}
