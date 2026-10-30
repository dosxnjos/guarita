// Push no navegador: registra /sw.js, inscreve com a chave VAPID e guarda o id da inscrição. Dono: módulo (e).
const STORAGE_KEY = 'guarita.sub';

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** Id salvo neste aparelho, ou null se ainda não inscrito. */
export function currentSubId(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

/** Esquece o id salvo (o servidor disse que a inscrição sumiu): a tela volta a oferecer "Ativar". */
export function forgetSubId(): void {
  saveSubId(null);
}

/** A API respondeu que a inscrição deste aparelho não existe mais? (404 de /api/alerts). Pura. */
export function isSubGone(err: unknown): boolean {
  const e = err as { status?: unknown; message?: unknown } | null;
  return !!e && e.status === 404 && typeof e.message === 'string' && /inscriç/i.test(e.message);
}

function saveSubId(id: string | null): void {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* modo privado: o id vale só nesta sessão */
  }
}

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}

async function errorText(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

async function postSubscription(sub: PushSubscription, subId: string | null): Promise<Response> {
  const body = subId ? { ...sub.toJSON(), subId } : sub.toJSON();
  return fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Inscreve e devolve o id da inscrição (dono dos alertas deste aparelho). Lança Error com mensagem pronta para a tela.
 * O servidor só reaproveita uma inscrição existente se receber o id atual (prova de posse). Sem id salvo, ou se o
 * servidor recusar (409), cancela a inscrição do navegador e faz uma nova: endpoint novo, id novo.
 */
export async function enablePush(): Promise<string> {
  if (!pushSupported()) {
    throw new Error('Este navegador não aceita notificações. No iPhone, instale a Guarita na tela de início antes (Compartilhar → Adicionar à Tela de Início).');
  }
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;

  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'As notificações estão bloqueadas para este site. Libere nas configurações do navegador (ícone de cadeado ao lado do endereço) e tente de novo.'
        : 'Sem permissão para notificar. Toque em "Permitir" quando o navegador perguntar.',
    );
  }

  const vapidRes = await fetch('/api/push/vapid');
  if (!vapidRes.ok) throw new Error(await errorText(vapidRes, 'Não foi possível ativar as notificações agora. Tente de novo em instantes.'));
  const { key } = (await vapidRes.json()) as { key: string };
  const appKey = b64urlToBytes(key);

  const saved = currentSubId();
  // Inscrição antiga feita com outra chave não recebe nada; sem id salvo, o servidor não a devolveria: refaz.
  let sub = await reg.pushManager.getSubscription();
  if (sub && (!saved || !sameKey(sub.options.applicationServerKey, appKey))) {
    await sub.unsubscribe().catch(() => false);
    sub = null;
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey });

  let res = await postSubscription(sub, saved);
  if (res.status === 409) {
    // O servidor conhece o endpoint, mas não com este id: inscrição nova.
    await sub.unsubscribe().catch(() => false);
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey });
    res = await postSubscription(sub, null);
  }
  if (!res.ok) throw new Error(await errorText(res, 'Não foi possível registrar as notificações. Tente de novo em instantes.'));
  const { subId } = (await res.json()) as { subId: string };
  saveSubId(subId);
  return subId;
}

/** Cancela a inscrição neste aparelho e apaga no servidor (os alertas push deste aparelho somem junto). */
export async function disablePush(): Promise<void> {
  const subId = currentSubId();
  let endpoint: string | undefined;
  if (pushSupported()) {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      endpoint = sub.endpoint;
      await sub.unsubscribe().catch(() => false);
    }
  }
  if (subId) {
    const res = await fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(endpoint ? { subId, endpoint } : { subId }),
    }).catch(() => null);
    // Falha de rede: o navegador já cancelou; o servidor apaga a inscrição sozinho no próximo envio (410).
    if (res && !res.ok && res.status !== 403) throw new Error(await errorText(res, 'Não foi possível desativar no servidor agora.'));
  }
  saveSubId(null);
}
