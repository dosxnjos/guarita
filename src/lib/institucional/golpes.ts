// Golpes comuns em espanhol (tela /golpes em /es). O catálogo em português mora em shared/scams.ts (fontes lá); aqui
// fica só o espelho em espanhol, pelo mesmo id, para não mexer no módulo compartilhado. Sem tradução de um id, a tela
// mostra o português (tests/institucional.test.ts confere que todo id do catálogo tem par e o mesmo número de itens).
// Termos do jogo pelo glossário (docs/glossario-es.md): plata, gremio, botín, zona roja/negra, objeto, montura.
import { SCAMS, SCAM_REPORT_NOTE, type Scam } from '../../../shared/scams';
import type { NickMatch } from '../novato/similar';
import type { Locale } from '../i18n/core';

type ScamText = Omit<Scam, 'id'>;

export const SCAMS_ES: Readonly<Record<string, ScamText>> = {
  'troca-ultima-hora': {
    title: 'Cambio de objeto a último momento',
    summary: 'El objeto del intercambio se cambia por uno parecido (tier, encantamiento o calidad menor) justo antes de que confirmes.',
    how: 'Acuerdan un intercambio, la otra persona pone el objeto correcto, conversa, da largas y, un instante antes de que confirmes, lo cambia por uno que parece igual: T5.0 en lugar de T5.1, calidad Normal en lugar de Sobresaliente, o una cantidad menor de plata.',
    signs: [
      'Prisa para que aceptes ya ("rápido, me tengo que ir").',
      'Objetos que se quitan y se vuelven a poner en la ventana de intercambio.',
      'Mucha conversación en el chat mientras el intercambio está abierto.',
    ],
    protect: [
      'Antes de confirmar, pasa el mouse sobre cada objeto y revisa tier, encantamiento, calidad y cantidad.',
      'Revisa la cantidad de plata dígito por dígito.',
      'Si algo cambió en la ventana, cancela y vuelve a empezar con calma.',
      'Para objetos caros, prefiere el mercado (orden de venta o de compra) a los intercambios directos con desconocidos.',
    ],
  },
  'empresta-montaria': {
    title: '"¿Me prestas la montura?"',
    summary: 'Alguien, a veces con un nombre parecido al de un conocido, pide prestado el mamut, el buey o un objeto y desaparece.',
    how: 'El estafador dice que va demasiado cargado, que perdió su montura o que "solo va a llevar unas cosas" y la devuelve enseguida. A veces usa un nombre casi igual al de alguien de tu gremio (una "I" en lugar de una "l", un "0" en lugar de una "O"). Una vez que la montura sale de tu inventario, no hay vuelta atrás.',
    signs: [
      'Te piden algo caro prestado, con urgencia.',
      'Encuentro en un puesto avanzado o fuera de la ciudad.',
      'Nombre muy parecido al de un amigo, pero el perfil no coincide.',
    ],
    protect: [
      'No prestes monturas ni equipo: en el juego no existen los préstamos con garantía.',
      'Confirma por el Discord o el chat del gremio que la persona es quien dice ser.',
      'Usa aquí en la página la búsqueda de nombres parecidos antes de confiar en un nombre.',
    ],
  },
  'falso-lider': {
    title: 'Falso líder u oficial del gremio',
    summary: 'Alguien se hace pasar por un oficial y te pide el equipo para "reparar", "revisar" o "guardar".',
    how: 'Con un nombre parecido y una forma de hablar parecida a la de un oficial de verdad, el estafador te pide ir a la reparación, a la isla o al banco y entregarle el set. A veces usa una segunda cuenta para que parezca que otra persona confirma el pedido.',
    signs: [
      'Piden objetos fuera de los canales del gremio.',
      'Nombre con una letra cambiada respecto al del oficial real.',
      'Nadie más del liderazgo sabe del pedido.',
    ],
    protect: [
      'Un oficial de verdad no te pide el equipo por mensaje privado.',
      'Confirma en el canal del gremio, con el oficial por su nombre exacto.',
      'El personal de la SBI nunca pide objetos, contraseñas ni datos de acceso.',
    ],
  },
  'recrutamento-taxa': {
    title: 'Reclutamiento falso con cuota de entrada',
    summary: 'Un "gremio grande" promete regear, territorio y protección, pero cobra una entrada en plata u objetos.',
    how: 'El reclutador anuncia en el chat o en Discord vacantes en un gremio famoso y pide plata por adelantado para "asegurar el lugar", "pagar el primer regear" o "liberar el escondite". Después de cobrar desaparece, o el gremio ni siquiera es el que dijo.',
    signs: [
      'Pago antes de entrar.',
      'Promesas demasiado grandes para un novato.',
      'Reclutador que no está en el gremio que anuncia (revísalo en el killboard o en el dosier).',
    ],
    protect: [
      'Un gremio serio puede cobrar un impuesto sobre lo que ganas, nunca una entrada para asegurar el lugar.',
      'Busca al reclutador en el dosier de la Guarita y comprueba si su gremio es el anunciado.',
      'Entra al Discord oficial del gremio y confirma con el liderazgo.',
    ],
  },
  'pede-regear-some': {
    title: 'Gremio que pide objetos para el "regear" y desaparece',
    summary: 'Piden que los miembros depositen objetos o plata en el banco "para el regear" y después vacían el banco.',
    how: 'Un líder u oficial junta objetos y plata de los miembros con la promesa de repartirlos en regear o formar una reserva. Cuando el banco está lleno, se lleva todo y sale del gremio. Hay casos famosos de bancos con más de mil millones de plata vaciados por alguien que pasó meses ganándose la confianza.',
    signs: [
      'Te piden depositar objetos en el banco sin reglas escritas de regear.',
      'Pocas personas con acceso total al banco.',
      'Liderazgo nuevo que exige depósitos desde el principio.',
    ],
    protect: [
      'Un regear serio tiene reglas públicas (qué cubre, cómo probar la muerte) y quien paga es el gremio, no tú.',
      'No deposites más de lo que estás dispuesto a perder.',
      'Si lideras, limita el acceso al banco por rango.',
    ],
  },
  'escolta-emboscada': {
    title: 'Escolta pagada que te lleva a una emboscada',
    summary: 'Alguien ofrece escoltar tu transporte por una tarifa y te guía directo al grupo que te va a matar.',
    how: 'Necesitas cruzar una zona roja o negra con carga cara. Un "escolta" se ofrece, cobra por adelantado y elige la ruta. A mitad de camino aparece el grupo de gank justo donde te llevó, y el escolta "no puede ayudar".',
    signs: [
      'Insistencia en elegir la ruta y el horario.',
      'Pago por adelantado.',
      'Escolta que no es de tu gremio ni alguien que conozcas.',
    ],
    protect: [
      'Transporte caro: divídelo en viajes más pequeños o ve con tu gremio.',
      'Nunca le cuentes a nadie de afuera lo que llevas.',
      'Usa la página "Cuánto vale arriesgar" para saber cuánto puedes perder antes de salir.',
    ],
  },
  duplicacao: {
    title: '"Duplicación de objetos" o "bug de plata"',
    summary: 'Prometen duplicar tu objeto o tu plata si primero entregas el original.',
    how: 'El estafador dice que conoce un bug: entregas el objeto (o depositas la plata), él hace "el truco" y te lo devuelve al doble. No existe ningún truco; se queda con lo que entregaste. Y aunque existiera, usar un bug lleva al baneo.',
    signs: [
      '"Dámelo y te lo devuelvo al doble."',
      'Te piden guardar el secreto ("no le digas a nadie o lo arreglan").',
      'Pruebas en video o capturas que no puedes comprobar.',
    ],
    protect: [
      'Nadie duplica objetos en Albion. Ignóralo y sigue.',
      'Aprovechar un bug viola los Términos y puede llevar al baneo de tu cuenta.',
    ],
  },
  rmt: {
    title: 'Venta de plata u oro fuera del juego',
    summary: 'Un sitio o una persona vende plata, oro u objetos por dinero real: está prohibido y muchas veces es una doble estafa.',
    how: 'Ofrecen plata barata por transferencia o tarjeta. O pagas y no recibes nada, o recibes plata que salió de una cuenta robada y la SBI te la quita y banea tu cuenta. Algunos piden usuario y contraseña para "entregar más rápido". También circulan estafas de "criptomoneda de Albion".',
    signs: [
      'Precio muy por debajo del oro oficial.',
      'Te piden usuario, contraseña o código de verificación.',
      'Contacto por mensaje privado, sitio desconocido o una "moneda" que promete valer en el juego.',
    ],
    protect: [
      'El oro, solo en la tienda oficial del juego o cambiado por plata dentro del propio juego.',
      'Comprar plata fuera del juego (RMT) viola los Términos y puede llevar al baneo de la cuenta.',
      'No existe ninguna criptomoneda oficial de Albion.',
    ],
  },
  'link-falso': {
    title: 'Enlace falso de sorteo, Discord o "aviso de baneo"',
    summary: 'Un mensaje con un enlace para "ganar oro", "entrar al sorteo" o "evitar el baneo" que roba tu cuenta.',
    how: 'Llega un mensaje en el juego, en Discord o en el foro: "ganaste un sorteo", "tu cuenta será baneada, confirma aquí", "nuevo servidor de Discord del gremio". El enlace lleva a una página igual a la de inicio de sesión de Albion o de Discord, o descarga un archivo que instala un programa malicioso.',
    signs: [
      'Urgencia y miedo ("tu cuenta será baneada en 24 horas").',
      'Dirección del sitio con letras cambiadas o un dominio extraño.',
      'Archivo para descargar (PDF, .exe, .zip) "con las instrucciones".',
    ],
    protect: [
      'Entra al sitio oficial escribiendo tú mismo la dirección, nunca desde el enlace.',
      'Activa la verificación en dos pasos en Albion y en Discord.',
      'Desconfía de un sorteo en el que no recuerdas haber participado.',
    ],
  },
  'conta-compartilhada': {
    title: 'Cuenta compartida',
    summary: 'Le prestas tu cuenta a alguien para "subir de nivel" o "farmear" y pierdes los objetos, la plata o la cuenta misma.',
    how: 'Un amigo o un "booster" te pide los datos de acceso para conseguir fama, recolectar o pelear por ti. Con el acceso vende tus objetos, transfiere la plata o cambia el correo y la contraseña. Compartir la cuenta también va contra los Términos.',
    signs: [
      'Oferta de "subir" tu cuenta, gratis o pagada.',
      'Te piden usuario, contraseña o código de verificación.',
    ],
    protect: [
      'Nunca compartas usuario, contraseña ni código de verificación, ni siquiera con un amigo.',
      'Si ya los compartiste, cambia la contraseña y activa la verificación en dos pasos ahora.',
    ],
  },
  'duelo-apostado': {
    title: 'Duelo apostado que no se paga',
    summary: 'Te desafían a un duelo por plata u objetos y, si ganas, no pagan; si pierdes, te cobran.',
    how: 'La apuesta es solo de palabra: el juego no guarda el premio. Si el estafador pierde, desaparece. Variante: te piden que pelees "desnudo" (sin equipo) y aparece un amigo suyo para llevarse lo que dejaste en el suelo o en el inventario.',
    signs: [
      'Apuesta sin garantía.',
      'Te piden quitarte el equipo o ir a un lugar aislado.',
    ],
    protect: [
      'Da por hecho que la apuesta no existe: pelea solo por diversión.',
      'Nunca dejes objetos en el suelo o en una bolsa a la vista durante un desafío.',
    ],
  },
};

export const SCAM_REPORT_NOTE_ES =
  'La moderación del juego ya dijo en el foro oficial que no castiga las estafas en intercambios voluntarios. Hacerse pasar ' +
  'por otro jugador se trata aparte: si alguien se hizo pasar por ti o por un amigo, junta capturas con fecha y el nombre ' +
  'exacto y abre un ticket en el soporte oficial. La mejor defensa sigue siendo no entregar nada antes de recibir.';

/** Catálogo na língua pedida (mesma ordem e ids do português; sem tradução de um id, fica o português). Pura. */
export function scamsFor(loc: Locale): Scam[] {
  if (loc !== 'es') return SCAMS;
  return SCAMS.map((s) => {
    const t = SCAMS_ES[s.id];
    return t ? { id: s.id, ...t } : s;
  });
}

export function scamReportNote(loc: Locale): string {
  return loc === 'es' ? SCAM_REPORT_NOTE_ES : SCAM_REPORT_NOTE;
}

/**
 * Motivo do nick parecido na língua pedida. O português vem pronto de classifyNick (src/lib/novato/similar.ts); o
 * espanhol é montado pelo tipo e pela distância, reaproveitando os pares de letras do texto em português. Pura.
 */
export function nickReason(m: Pick<NickMatch, 'kind' | 'distance' | 'reason'>, loc: Locale): string {
  if (loc !== 'es') return m.reason;
  switch (m.kind) {
    case 'exato':
      return 'El nombre exacto que escribiste.';
    case 'caixa':
      return 'El mismo nombre, solo cambian mayúsculas y minúsculas.';
    case 'homoglifo': {
      // Pares no português: “l” virou “I” (a letra digitada e a encontrada; até 3, separados por vírgula).
      const pairs = [...m.reason.matchAll(/“(.+?)” virou “(.+?)”/gu)].map((x) => `“${x[1]}” cambió a “${x[2]}”`);
      return `Igual en la pantalla, con letras que se confunden${pairs.length ? `: ${pairs.join(', ')}` : ''}.`;
    }
    default:
      return m.distance === 1 ? 'Cambia una letra.' : `Cambian ${m.distance} letras.`;
  }
}

/** Selo do tipo de nick parecido. Pura. */
export function nickKindLabel(kind: NickMatch['kind'], loc: Locale): string {
  if (kind === 'homoglifo') return loc === 'es' ? 'Igual en la pantalla' : 'Igual na tela';
  if (kind === 'caixa') return loc === 'es' ? 'Cambian mayúsculas' : 'Muda a caixa';
  return 'Parecido';
}
