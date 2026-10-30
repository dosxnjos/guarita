// Texto para a VOZ: número por extenso em PT-BR (ou espanhol) e frases curtas dos avisos. Puro (sem DOM, sem relógio).
// A notificação leva o número exato com separador ("3.550"); a voz fala por extenso para a voz do Windows não
// ler "três ponto quinhentos e cinquenta" e para ficar curta (ver precoFalado).
// Língua: as funções aceitam `loc` no fim (padrão: a do app, pelo espelho de src/lib/i18n/core.ts).
// Testes: tests/fala.test.ts (português) e tests/i18n.test.ts (espanhol).
import { currentLocale, type Locale } from '../../../src/lib/i18n/core';

const UNIDADES = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

/** 0 < n < 1000 por extenso: "cem", "cento e vinte e três", "quinhentos". */
function grupo(n: number): string {
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100);
  const r = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c]);
  if (r) {
    if (r < 20) partes.push(UNIDADES[r]);
    else {
      const d = Math.floor(r / 10);
      const u = r % 10;
      partes.push(u ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]);
    }
  }
  return partes.join(' e ');
}

// Escalas: [singular, plural]. "mil" não varia e o 1 some ("mil", não "um mil").
const ESCALAS: [string, string][] = [
  ['', ''],
  ['mil', 'mil'],
  ['milhão', 'milhões'],
  ['bilhão', 'bilhões'],
  ['trilhão', 'trilhões'],
];

/**
 * Inteiro por extenso em PT-BR (masculino). Arredonda; negativo ganha "menos".
 * Regra do "e" entre grupos: entra antes do último grupo não nulo quando ele é menor que 100 ou centena redonda
 * ("três mil e quinhentos", "mil e cem", "dois milhões e cinquenta"); senão, só espaço
 * ("três mil quinhentos e vinte", "um milhão duzentos e trinta mil").
 */
export function porExtenso(valor: number, loc: Locale = currentLocale()): string {
  if (loc === 'es') return porExtensoEs(valor);
  if (!Number.isFinite(valor)) return '';
  let n = Math.round(Math.abs(valor));
  if (n === 0) return 'zero';
  const neg = valor < 0;
  const grupos: number[] = []; // do menor para o maior
  while (n > 0) {
    grupos.push(n % 1000);
    n = Math.floor(n / 1000);
  }
  if (grupos.length > ESCALAS.length) return String(Math.round(valor)); // fora da escala: deixa a voz ler o número
  const naoNulos = grupos.map((g, i) => (g ? i : -1)).filter((i) => i >= 0); // índices, do menor para o maior
  const ultimo = naoNulos[0];
  const partes: string[] = [];
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i];
    if (!g) continue;
    let txt: string;
    if (i === 0) txt = grupo(g);
    else if (i === 1) txt = g === 1 ? 'mil' : `${grupo(g)} mil`;
    else txt = `${grupo(g)} ${g === 1 ? ESCALAS[i][0] : ESCALAS[i][1]}`;
    const liga = partes.length > 0 && i === ultimo && (g < 100 || g % 100 === 0);
    partes.push(liga ? `e ${txt}` : txt);
  }
  return (neg ? 'menos ' : '') + partes.join(' ');
}

/**
 * Preço para falar: até 999.999 exato; acima, só os dois grupos mais altos, arredondado
 * (1.234.567 → "um milhão duzentos e trinta e cinco mil"). A notificação mostra o valor exato.
 */
export function precoFalado(preco: number, loc: Locale = currentLocale()): string {
  const n = Math.round(Math.abs(preco));
  if (n < 1_000_000) return porExtenso(n, loc);
  const grupos = Math.floor(Math.log10(n) / 3) + 1; // quantidade de grupos de 3 dígitos
  const passo = 1000 ** (grupos - 2);
  return porExtenso(Math.round(n / passo) * passo, loc);
}

/** Minutos para falar: "um minuto", "trinta minutos" (es: "un minuto", "veintiún minutos"). */
export function minutosFalados(min: number, loc: Locale = currentLocale()): string {
  const m = Math.max(0, Math.round(min));
  if (loc === 'es') return m === 1 ? 'un minuto' : `${porExtensoEs(m, true)} minutos`;
  return m === 1 ? 'um minuto' : `${porExtenso(m, loc)} minutos`;
}

/** Dias para falar: "um dia", "três dias" (es: "un día", "tres días"). */
export function diasFalados(d: number, loc: Locale = currentLocale()): string {
  const n = Math.max(0, Math.round(d));
  if (loc === 'es') return n === 1 ? 'un día' : `${porExtensoEs(n, true)} días`;
  return n === 1 ? 'um dia' : `${porExtenso(n, loc)} dias`;
}

// ---------- espanhol ----------
// Regras: 0 a 29 com nome próprio ("dieciséis", "veintitrés"); de 31 em diante "treinta y uno"; 100 é "cien" e
// 101 a 199 "ciento..."; entre grupos não há "y" ("tres mil quinientos"); "uno" vira "un" antes de substantivo e de
// "mil"/"millón" ("veintiún mil", "un millón", "treinta y un minutos"); 10^9 é "mil millones" (nunca "billón",
// que em espanhol é 10^12).

const UNIDADES_ES = [
  'cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece',
  'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós',
  'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve',
];
const DEZENAS_ES = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CENTENAS_ES = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

/** "uno" no fim vira "un" ("veintiuno" → "veintiún"). */
function apocopar(txt: string): string {
  if (txt.endsWith('veintiuno')) return `${txt.slice(0, -9)}veintiún`;
  if (txt === 'uno' || txt.endsWith(' uno')) return `${txt.slice(0, -3)}un`;
  return txt;
}

/** 0 < n < 1000 por extenso em espanhol. */
function grupoEs(n: number, apoc: boolean): string {
  if (n === 100) return 'cien';
  const c = Math.floor(n / 100);
  const r = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS_ES[c]);
  if (r) {
    if (r < 30) partes.push(UNIDADES_ES[r]);
    else {
      const u = r % 10;
      partes.push(u ? `${DEZENAS_ES[Math.floor(r / 10)]} y ${UNIDADES_ES[u]}` : DEZENAS_ES[Math.floor(r / 10)]);
    }
  }
  const txt = partes.join(' ');
  return apoc ? apocopar(txt) : txt;
}

/** 0 < n < 10^6 ("mil", "veintiún mil quinientos"). `apoc`: o último grupo termina em "un" (antes de substantivo). */
function abaixoDeMilhao(n: number, apoc: boolean): string {
  const mil = Math.floor(n / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (mil) partes.push(mil === 1 ? 'mil' : `${grupoEs(mil, true)} mil`);
  if (resto) partes.push(grupoEs(resto, apoc));
  return partes.join(' ');
}

/**
 * Inteiro por extenso em espanhol (masculino). Arredonda; negativo ganha "menos". `apoc` = "un" no fim (antes de
 * substantivo: "veintiún minutos"); sem ele, "uno" ("veintiuno"). Pura.
 */
export function porExtensoEs(valor: number, apoc = false): string {
  if (!Number.isFinite(valor)) return '';
  const n = Math.round(Math.abs(valor));
  if (n === 0) return 'cero';
  if (n >= 1e18) return String(Math.round(valor)); // fora da escala: deixa a voz ler o número
  const neg = valor < 0;
  const partes: string[] = [];
  // Escalas de 10^6 em 10^6: billones (10^12), millones (10^6), o resto abaixo de um milhão.
  const billones = Math.floor(n / 1e12);
  const millones = Math.floor((n % 1e12) / 1e6);
  const resto = n % 1e6;
  if (billones) partes.push(billones === 1 ? 'un billón' : `${abaixoDeMilhao(billones, true)} billones`);
  if (millones) partes.push(millones === 1 ? 'un millón' : `${abaixoDeMilhao(millones, true)} millones`);
  if (resto) partes.push(abaixoDeMilhao(resto, apoc));
  return (neg ? 'menos ' : '') + partes.join(' ');
}
