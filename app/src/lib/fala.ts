// Texto para a VOZ: número por extenso em PT-BR e frases curtas dos avisos. Puro (sem DOM, sem relógio).
// A notificação leva o número exato com separador ("3.550"); a voz fala por extenso para a voz do Windows não
// ler "três ponto quinhentos e cinquenta" e para ficar curta (ver precoFalado).
// Testes: tests/fala.test.ts.

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
export function porExtenso(valor: number): string {
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
export function precoFalado(preco: number): string {
  const n = Math.round(Math.abs(preco));
  if (n < 1_000_000) return porExtenso(n);
  const grupos = Math.floor(Math.log10(n) / 3) + 1; // quantidade de grupos de 3 dígitos
  const passo = 1000 ** (grupos - 2);
  return porExtenso(Math.round(n / passo) * passo);
}

/** Minutos para falar: "um minuto", "trinta minutos". */
export function minutosFalados(min: number): string {
  const m = Math.max(0, Math.round(min));
  return m === 1 ? 'um minuto' : `${porExtenso(m)} minutos`;
}

/** Dias para falar: "um dia", "três dias". */
export function diasFalados(d: number): string {
  const n = Math.max(0, Math.round(d));
  return n === 1 ? 'um dia' : `${porExtenso(n)} dias`;
}
