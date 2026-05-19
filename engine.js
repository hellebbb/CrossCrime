// engine.js — MURDOKU: Cluedo × Sudoku
// Motor de generación + control de UI. Envuelto en IIFE para encapsular scope
// sin depender de soporte de ES modules en el entorno de carga.

(function () {
'use strict';

const CONFIG_DIFICULTAD = {
  muy_facil:   { tamano: 6,  sospechosos: 5,  habitaciones: 3, obstaculos: 4  },
  facil:       { tamano: 8,  sospechosos: 7,  habitaciones: 4, obstaculos: 6  },
  moderado:    { tamano: 10, sospechosos: 9,  habitaciones: 5, obstaculos: 10 },
  dificil:     { tamano: 12, sospechosos: 11, habitaciones: 6, obstaculos: 15 },
  muy_dificil: { tamano: 16, sospechosos: 15, habitaciones: 8, obstaculos: 25 },
};

// Nombres por letra inicial (un personaje con id 'A' obtiene un nombre con A)
const NOMBRES_POR_LETRA = {
  A: ["Adeline","Ana","Aranza","Antonio","Alma","Andrea","Alejo"],
  B: ["Braulio","Bernardo","Beatriz","Benjamín","Bianca","Bruno"],
  C: ["Cira","Camila","Carlos","Cecilia","Catalina","Cristóbal"],
  D: ["Dante","Diana","Damián","Daniela","Diego","Dolores"],
  E: ["Elena","Eduardo","Emma","Esteban","Eva","Emilio"],
  F: ["Francisca","Felipe","Frida","Fernanda","Fátima","Federico"],
  G: ["Greta","Gabriel","Gloria","Germán","Gala","Gustavo"],
  H: ["Hugo","Helena","Héctor","Hilda","Hannah","Horacio"],
  I: ["Iris","Ignacio","Irene","Iván","Inés","Ismael"],
  J: ["Jano","Julia","Joaquín","Jimena","Javier","Juana"],
  K: ["Kira","Karla","Kevin","Karen","Kai","Kira"],
  L: ["Lía","Leo","Lucía","Luis","Lola","León"],
  M: ["Mateo","Mía","Marcos","Marina","Marta","Manuel"],
  N: ["Nora","Nicolás","Natalia","Néstor","Noa","Nadia"],
  O: ["Olmo","Olivia","Octavio","Olga","Omar","Ofelia"],
};

const NOMBRES_VICTIMA = [
  "Virgilio","Valentina","Víctor","Vera","Valeria","Vicente","Violeta",
];

// Habitaciones temáticas: cada partida elige N nombres distintos
const NOMBRES_HABITACION = [
  "el salón","la biblioteca","el comedor","el estudio","la galería",
  "el vestíbulo","la sala de música","el jardín de invierno","la cocina",
  "el invernadero","la sala de billar","el observatorio","la trastienda",
];

// OBSTÁCULOS — bloquean paso, ningún personaje puede ocupar su celda
const NOMBRES_OBSTACULOS = [
  "una estantería","un librero","un piano","una chimenea","un armario",
  "una vitrina","un escritorio","una estatua","un reloj de péndulo",
  "un perchero","una jaula vacía","un maniquí","un cofre","un baúl",
  "una mesa de billar","una pecera de cristal","un samovar grande",
  "una armadura","un atril","un globo terráqueo","una caja fuerte",
  "un buró","un cuadro grande","una vasija enorme","un órgano",
  "un retablo","una urna","un trono","una caldera","una tina antigua",
  "un escudo","un yunque","un telar","una jaula con cuervo",
];

// USABLES — muebles donde un personaje SÍ puede estar encima (silla, cama, etc.)
const NOMBRES_USABLES = [
  "una silla","un sillón","una cama","un banco","una mesa de café",
  "un puff","una hamaca","un taburete","una banca","una butaca",
  "una otomana","un diván","una mecedora","una chaise longue",
  "un sofá","una banqueta","un asiento de ventana","un cojín grande",
  "una alfombra mullida","una poltrona",
];

// Verbo según el tipo de mueble (gender-neutral: pasado simple)
function verboMueble(m) {
  if (/cama|hamaca|otomana|diván|chaise/.test(m)) return 'se recostó en';
  if (/mesa|cojín|alfombra/.test(m)) return 'estaba sobre';
  return 'se sentó en';
}
function iconoMueble(m) {
  if (/cama/.test(m))                    return '🛏';
  if (/hamaca/.test(m))                  return '⌒';
  if (/otomana|diván|chaise/.test(m))    return '🛋';
  if (/sofá/.test(m))                    return '🛋';
  if (/alfombra/.test(m))                return '▦';
  if (/mesa/.test(m))                    return '▭';
  if (/cojín|puff/.test(m))              return '◆';
  return '🪑'; // sillas, sillones, butacas, taburetes, mecedoras, etc.
}

const PALETA_HAB = [
  "#fde4cf","#e4f1fe","#e9f5db","#fff1c1","#fbe5e1",
  "#e0d7f5","#d6efe1","#fcd5ce","#ddedea","#f0e1d4",
];

// Plantillas de pistas — varias formas de decir lo mismo para que las partidas no se sientan repetitivas
const PHRASE_FILA = [
  P => `${P.nombre} estaba en la fila ${P.r + 1}.`,
  P => `${P.nombre} ocupaba la fila número ${P.r + 1}.`,
  P => `Se vio a ${P.nombre} cruzar la fila ${P.r + 1}.`,
];
const PHRASE_COL = [
  P => `${P.nombre} estaba en la columna ${P.c + 1}.`,
  P => `${P.nombre} se mantuvo en la columna ${P.c + 1}.`,
  P => `La columna ${P.c + 1} fue el lugar de ${P.nombre}.`,
];
const PHRASE_HAB = [
  (P, sal) => `${P.nombre} se encontraba en ${sal}.`,
  (P, sal) => `Encontramos a ${P.nombre} dentro de ${sal}.`,
  (P, sal) => `${P.nombre} permaneció en ${sal} toda la noche.`,
];
const PHRASE_PARED = {
  norte: P => [`${P.nombre} estaba pegado a la pared norte.`, `La pared norte tenía a ${P.nombre} apoyado.`][randInt(2)],
  sur:   P => [`${P.nombre} estaba pegado a la pared sur.`,   `${P.nombre} se recargaba contra la pared sur.`][randInt(2)],
  este:  P => [`${P.nombre} estaba pegado a la pared este.`,  `La pared este sostenía a ${P.nombre}.`][randInt(2)],
  oeste: P => [`${P.nombre} estaba pegado a la pared oeste.`, `${P.nombre} se apoyaba en la pared oeste.`][randInt(2)],
};
const PHRASE_OBS = [
  (P, obj, dir) => `${P.nombre} tenía ${obj} al ${dir}.`,
  (P, obj, dir) => `Junto a ${P.nombre}, al ${dir}, había ${obj}.`,
  (P, obj, dir) => `${P.nombre} alcanzaba ${obj} si miraba al ${dir}.`,
];
const PHRASE_DIST = [
  (P, Q, d) => `${P.nombre} estaba a ${d} casillas de ${Q.nombre}.`,
  (P, Q, d) => `Entre ${P.nombre} y ${Q.nombre} había ${d} casillas de distancia.`,
  (P, Q, d) => `${P.nombre} se hallaba a ${d} pasos de ${Q.nombre}.`,
];
const PHRASE_HAB_PAR = [
  (P, Q) => `${P.nombre} compartía habitación con ${Q.nombre}.`,
  (P, Q) => `${P.nombre} y ${Q.nombre} estaban en el mismo cuarto.`,
];
const PHRASE_NOHAB_PAR = [
  (P, Q) => `${P.nombre} no compartía habitación con ${Q.nombre}.`,
  (P, Q) => `${P.nombre} y ${Q.nombre} estaban en cuartos distintos.`,
];
const PHRASE_DIR_PAR = {
  norte: (P, Q) => [`${P.nombre} estaba al norte de ${Q.nombre}.`, `${P.nombre} se encontraba por encima de ${Q.nombre}.`][randInt(2)],
  sur:   (P, Q) => [`${P.nombre} estaba al sur de ${Q.nombre}.`,   `${P.nombre} se encontraba por debajo de ${Q.nombre}.`][randInt(2)],
  oeste: (P, Q) => [`${P.nombre} estaba al oeste de ${Q.nombre}.`, `${P.nombre} caía a la izquierda de ${Q.nombre}.`][randInt(2)],
  este:  (P, Q) => [`${P.nombre} estaba al este de ${Q.nombre}.`,  `${P.nombre} caía a la derecha de ${Q.nombre}.`][randInt(2)],
};

const sleep = (ms = 0) => new Promise(r => setTimeout(r, ms));
const randInt = n => Math.floor(Math.random() * n);
const shuffle = a => { for (let i=a.length-1;i>0;i--){const j=randInt(i+1);[a[i],a[j]]=[a[j],a[i]];} return a; };
const pick = a => a[randInt(a.length)];
function pickWeighted(arr) {
  const total = arr.reduce((s,p) => s + p.peso, 0);
  if (total <= 0) return pick(arr);
  let r = Math.random() * total;
  for (const p of arr) { r -= p.peso; if (r <= 0) return p; }
  return arr[arr.length - 1];
}

class MurdokuEngine {
  constructor(dificultad) {
    this.dificultad = dificultad;
    this.config = CONFIG_DIFICULTAD[dificultad];
    this.tamano = this.config.tamano;
    this.reset();
  }

  reset() {
    const T = this.tamano;
    this.tableroReal = Array.from({ length: T }, () => Array(T).fill(null));
    this.tableroJugador = Array.from({ length: T }, () => Array(T).fill(null));
    this.notas = Array.from({ length: T }, () => Array.from({ length: T }, () => new Set()));
    this.habitaciones = Array.from({ length: T }, () => Array(T).fill(0));
    this.nombreHabitacion = {};       // {idHab: "el salón"}
    this.nombreObstaculo = {};        // {"r,c": "una estantería"} — bloquea celda
    this.mueble = {};                 // {"r,c": "una silla"} — usable, personajes encima sí
    this.sospechosos = [];
    this.victima = { id: 'V', nombre: pick(NOMBRES_VICTIMA), r: -1, c: -1 };
    this.asesinoId = null;
    this.pistas = [];
  }

  maxPasosSolver() {
    return this.tamano <= 6  ? 200_000
         : this.tamano <= 8  ? 600_000
         : this.tamano <= 10 ? 1_500_000
         : this.tamano <= 12 ? 4_000_000
         :                     10_000_000;
  }

  async generar(onProgress) {
    for (let intento = 0; intento < 30; intento++) {
      onProgress?.(`Generando tablero (intento ${intento + 1})...`);
      this.reset();
      this.generarHabitaciones();
      if (!this.generarSolucionValida()) { await sleep(0); continue; }
      this.colocarObstaculos();
      this.colocarMuebles();

      for (let ronda = 0; ronda < 6; ronda++) {
        onProgress?.(`Buscando pistas únicas (ronda ${ronda + 1})...`);
        if (await this.crearPistasUnaPorPersona()) return true;
        // Si no converge, añadir obstáculos extra para restringir más
        this.colocarObstaculosExtra(1 + Math.floor(ronda / 2));
        await sleep(0);
      }
    }
    return false;
  }

  // === 1. Habitaciones por crecimiento de regiones ===
  generarHabitaciones() {
    const T = this.tamano;
    const N = this.config.habitaciones;
    const grid = this.habitaciones;
    const frontiers = [];
    const usadas = new Set();
    for (let id = 1; id <= N; id++) {
      let r, c, k = 0;
      do { r = randInt(T); c = randInt(T); k++; } while (usadas.has(r * T + c) && k < 500);
      usadas.add(r * T + c);
      grid[r][c] = id;
      frontiers.push([{ r, c, id }]);
    }
    let restantes = T * T - N;
    let safety = 0;
    while (restantes > 0 && safety++ < T * T * 20) {
      let progreso = false;
      for (const f of frontiers) {
        if (f.length === 0) continue;
        const idx = randInt(f.length);
        const cell = f[idx];
        const dirs = shuffle([[-1,0],[1,0],[0,-1],[0,1]]);
        let expanded = false;
        for (const [dr, dc] of dirs) {
          const nr = cell.r + dr, nc = cell.c + dc;
          if (nr < 0 || nr >= T || nc < 0 || nc >= T) continue;
          if (grid[nr][nc] !== 0) continue;
          grid[nr][nc] = cell.id;
          f.push({ r: nr, c: nc, id: cell.id });
          restantes--; expanded = true; progreso = true; break;
        }
        if (!expanded) f.splice(idx, 1);
      }
      if (!progreso) break;
    }
    for (let r = 0; r < T; r++) for (let c = 0; c < T; c++) if (grid[r][c] === 0) {
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < T && nc >= 0 && nc < T && grid[nr][nc] !== 0) { grid[r][c] = grid[nr][nc]; break; }
      }
      if (grid[r][c] === 0) grid[r][c] = 1;
    }

    // Nombre temático único por habitación
    const habNombresShuffled = shuffle([...NOMBRES_HABITACION]);
    for (let id = 1; id <= N; id++) {
      this.nombreHabitacion[id] = habNombresShuffled[(id - 1) % habNombresShuffled.length];
    }
  }

  // Coloca muebles USABLES en celdas libres (incluso donde haya personajes).
  // Cada nombre se usa una sola vez por partida para que las pistas sean inequívocas.
  colocarMuebles() {
    const T = this.tamano;
    const cuantos = Math.max(2, Math.floor(this.config.obstaculos * 0.7));
    const nombresShuffled = shuffle([...NOMBRES_USABLES]);
    const candidatas = [];
    for (let r = 0; r < T; r++) for (let c = 0; c < T; c++) {
      if (this.tableroReal[r][c] !== 'X') candidatas.push({ r, c });
    }
    shuffle(candidatas);
    let n = 0;
    for (const { r, c } of candidatas) {
      if (n >= cuantos || n >= nombresShuffled.length) break;
      this.mueble[r + ',' + c] = nombresShuffled[n];
      n++;
    }
  }

  // === 2. Solución válida (víctima + asesino en misma habitación) ===
  generarSolucionValida() {
    const T = this.tamano;
    const K = this.config.sospechosos + 1; // sospechosos + víctima
    if (K > T) return false;
    for (let attempt = 0; attempt < 400; attempt++) {
      const filas = shuffle([...Array(T).keys()]).slice(0, K);
      const cols  = shuffle([...Array(T).keys()]).slice(0, K);
      const perm  = shuffle([...Array(K).keys()]);
      const posiciones = filas.map((f, i) => ({ r: f, c: cols[perm[i]] }));
      const ordenV = shuffle([...Array(K).keys()]);
      for (const vi of ordenV) {
        const habV = this.habitaciones[posiciones[vi].r][posiciones[vi].c];
        const coMates = [];
        for (let i = 0; i < K; i++) {
          if (i === vi) continue;
          if (this.habitaciones[posiciones[i].r][posiciones[i].c] === habV) coMates.push(i);
        }
        // REGLA: víctima a solas con el asesino — exactamente 1 acompañante
        if (coMates.length !== 1) continue;
        // Aplicar la solución
        this.sospechosos = [];
        for (let r = 0; r < T; r++) for (let c = 0; c < T; c++) this.tableroReal[r][c] = null;
        this.victima.r = posiciones[vi].r;
        this.victima.c = posiciones[vi].c;
        this.tableroReal[this.victima.r][this.victima.c] = 'V';
        const idxAses = coMates[0];
        let nIdx = 0;
        for (let i = 0; i < K; i++) {
          if (i === vi) continue;
          const id = String.fromCharCode(65 + nIdx);
          const nombresLetra = NOMBRES_POR_LETRA[id] || [id];
          const nombre = pick(nombresLetra);
          const s = { id, nombre, r: posiciones[i].r, c: posiciones[i].c };
          this.sospechosos.push(s);
          this.tableroReal[s.r][s.c] = id;
          if (i === idxAses) this.asesinoId = id;
          nIdx++;
        }
        return true;
      }
    }
    return false;
  }

  // === 3. Obstáculos ===
  colocarObstaculos() {
    const objetivo = this.config.obstaculos;
    this.colocarObstaculosExtra(objetivo);
  }

  colocarObstaculosExtra(cuantos) {
    const T = this.tamano;
    const usadas = new Set(Object.values(this.nombreObstaculo));
    const disponibles = shuffle(NOMBRES_OBSTACULOS.filter(n => !usadas.has(n)));
    let n = 0, intentos = 0, asignados = 0;
    while (n < cuantos && intentos < cuantos * 50 + 20) {
      intentos++;
      const r = randInt(T), c = randInt(T);
      if (this.tableroReal[r][c] !== null) continue;
      this.tableroReal[r][c] = 'X';
      this.nombreObstaculo[r + ',' + c] = disponibles[asignados] || 'un objeto bloqueador';
      asignados++;
      n++;
    }
  }

  todosPersonajes() { return [this.victima, ...this.sospechosos]; }

  // === 4. Generador de pistas: TODAS con un único primario (.a) ===
  generarPistasCandidatasPorChar() {
    const T = this.tamano;
    const todos = this.todosPersonajes();
    const porChar = {};
    for (const P of todos) porChar[P.id] = [];

    // Helper: cuenta cuántos personajes están en una habitación dada (para "único en el salón")
    const conteoPorHab = {};
    for (const P of todos) {
      const h = this.habitaciones[P.r][P.c];
      conteoPorHab[h] = (conteoPorHab[h] || 0) + 1;
    }

    for (const P of todos) {
      const habP = this.habitaciones[P.r][P.c];
      const nomHabP = this.nombreHabitacion[habP] || `la habitación ${habP}`;

      // FILA y COLUMNA exactas (abstractas, sin referencia visual)
      porChar[P.id].push({ texto: pick(PHRASE_FILA)(P), check: s => { const p = s[P.id]; if (!p) return null; return p.r === P.r; }, a: P.id, peso: 5 });
      porChar[P.id].push({ texto: pick(PHRASE_COL)(P),  check: s => { const p = s[P.id]; if (!p) return null; return p.c === P.c; }, a: P.id, peso: 5 });

      // Habitación por nombre temático
      porChar[P.id].push({
        texto: pick(PHRASE_HAB)(P, nomHabP),
        check: s => { const p = s[P.id]; if (!p) return null; return this.habitaciones[p.r][p.c] === habP; },
        a: P.id, peso: 6,
      });

      // "Único en el salón" — sólo si P es el único personaje en su habitación
      if (conteoPorHab[habP] === 1) {
        porChar[P.id].push({
          texto: `${P.nombre} estaba solo en ${nomHabP}.`,
          check: s => {
            const p = s[P.id]; if (!p) return null;
            const h = this.habitaciones[p.r][p.c];
            if (h !== habP) return false;
            for (const Q of todos) {
              if (Q.id === P.id) continue;
              const q = s[Q.id]; if (!q) return null;
              if (this.habitaciones[q.r][q.c] === habP) return false;
            }
            return true;
          },
          a: P.id, peso: 7,
        });
      }

      // Paredes
      if (P.r === 0)   porChar[P.id].push({ texto: PHRASE_PARED.norte(P), check: s => { const p = s[P.id]; if (!p) return null; return p.r === 0; },   a: P.id, peso: 5 });
      if (P.r === T-1) porChar[P.id].push({ texto: PHRASE_PARED.sur(P),   check: s => { const p = s[P.id]; if (!p) return null; return p.r === T-1; }, a: P.id, peso: 5 });
      if (P.c === 0)   porChar[P.id].push({ texto: PHRASE_PARED.oeste(P), check: s => { const p = s[P.id]; if (!p) return null; return p.c === 0; },   a: P.id, peso: 5 });
      if (P.c === T-1) porChar[P.id].push({ texto: PHRASE_PARED.este(P),  check: s => { const p = s[P.id]; if (!p) return null; return p.c === T-1; }, a: P.id, peso: 5 });

      // Obstáculo adyacente (mueble que bloquea, ej. estantería)
      const dirs = [["norte",-1,0],["sur",1,0],["oeste",0,-1],["este",0,1]];
      for (const [nd, dr, dc] of dirs) {
        const nr = P.r + dr, nc = P.c + dc;
        if (nr >= 0 && nr < T && nc >= 0 && nc < T && this.tableroReal[nr][nc] === 'X') {
          const nomObs = this.nombreObstaculo[nr + ',' + nc] || 'un objeto';
          porChar[P.id].push({
            texto: pick(PHRASE_OBS)(P, nomObs, nd),
            check: s => {
              const p = s[P.id]; if (!p) return null;
              const nr2 = p.r + dr, nc2 = p.c + dc;
              if (nr2 < 0 || nr2 >= T || nc2 < 0 || nc2 >= T) return false;
              return this.tableroReal[nr2][nc2] === 'X';
            },
            a: P.id, peso: 5,
          });
        }
      }

      // ENCIMA de un mueble usable (único en el tablero → pinpoint exacto)
      const muebPropio = this.mueble[P.r + ',' + P.c];
      if (muebPropio) {
        const cuantosIguales = Object.values(this.mueble).filter(m => m === muebPropio).length;
        if (cuantosIguales === 1) {
          const verbo = verboMueble(muebPropio);
          const cellRef = { r: P.r, c: P.c };
          porChar[P.id].push({
            texto: `${P.nombre} ${verbo} ${muebPropio}.`,
            check: s => { const p = s[P.id]; if (!p) return null; return p.r === cellRef.r && p.c === cellRef.c; },
            a: P.id, peso: 9,
          });
        }
      }

      // Mueble usable adyacente (no bloquea pero da referencia)
      for (const [nd, dr, dc] of dirs) {
        const nr = P.r + dr, nc = P.c + dc;
        if (nr < 0 || nr >= T || nc < 0 || nc >= T) continue;
        const muebAdj = this.mueble[nr + ',' + nc];
        if (!muebAdj) continue;
        const cuantosIguales = Object.values(this.mueble).filter(m => m === muebAdj).length;
        if (cuantosIguales !== 1) continue;
        const cellAdj = { r: nr, c: nc };
        porChar[P.id].push({
          texto: `${P.nombre} tenía ${muebAdj} al ${nd}.`,
          check: s => {
            const p = s[P.id]; if (!p) return null;
            return Math.abs(p.r - cellAdj.r) + Math.abs(p.c - cellAdj.c) === 1
                && (p.r === cellAdj.r || p.c === cellAdj.c);
          },
          a: P.id, peso: 6,
        });
      }

      // === Pistas de PERSONAJE vs OBJETO (obstáculos y muebles con nombre único) ===
      // Estas son las "narrativas" que el usuario pidió.

      const anchorRefs = []; // [{key:"r,c", nombre, r, c, esMueble}]
      for (const [key, nombre] of Object.entries(this.nombreObstaculo)) {
        const [or_, oc_] = key.split(',').map(Number);
        anchorRefs.push({ r: or_, c: oc_, nombre, esMueble: false });
      }
      for (const [key, nombre] of Object.entries(this.mueble)) {
        const [mr, mc] = key.split(',').map(Number);
        if (mr === P.r && mc === P.c) continue; // su propio mueble ya cubierto por "encima"
        anchorRefs.push({ r: mr, c: mc, nombre, esMueble: true });
      }

      for (const A of anchorRefs) {
        // Misma fila / misma columna que un objeto con nombre único
        if (P.r === A.r) {
          porChar[P.id].push({
            texto: `${P.nombre} estaba en la misma fila que ${A.nombre}.`,
            check: s => { const p = s[P.id]; if (!p) return null; return p.r === A.r; },
            a: P.id, peso: 6,
          });
        }
        if (P.c === A.c) {
          porChar[P.id].push({
            texto: `${P.nombre} estaba en la misma columna que ${A.nombre}.`,
            check: s => { const p = s[P.id]; if (!p) return null; return p.c === A.c; },
            a: P.id, peso: 6,
          });
        }
        // Dirección general respecto al objeto
        if (P.r < A.r) porChar[P.id].push({ texto: `${P.nombre} estaba al norte de ${A.nombre}.`, check: s => { const p = s[P.id]; if (!p) return null; return p.r < A.r; }, a: P.id, peso: 3 });
        else if (P.r > A.r) porChar[P.id].push({ texto: `${P.nombre} estaba al sur de ${A.nombre}.`, check: s => { const p = s[P.id]; if (!p) return null; return p.r > A.r; }, a: P.id, peso: 3 });
        if (P.c < A.c) porChar[P.id].push({ texto: `${P.nombre} estaba al oeste de ${A.nombre}.`, check: s => { const p = s[P.id]; if (!p) return null; return p.c < A.c; }, a: P.id, peso: 3 });
        else if (P.c > A.c) porChar[P.id].push({ texto: `${P.nombre} estaba al este de ${A.nombre}.`, check: s => { const p = s[P.id]; if (!p) return null; return p.c > A.c; }, a: P.id, peso: 3 });
      }

      // === Relaciones BINARIAS personaje-personaje ===
      // Sin distancia (muy ambigua), sin pares con la víctima (delatarían al asesino).
      for (const Q of todos) {
        if (Q.id === P.id) continue;
        const habQ = this.habitaciones[Q.r][Q.c];
        const involucraVictima = (P.id === 'V' || Q.id === 'V');

        // Habitación compartida o no — sólo si no involucra víctima
        if (habP === habQ && !involucraVictima) {
          porChar[P.id].push({
            texto: pick(PHRASE_HAB_PAR)(P, Q),
            check: s => { const a = s[P.id], b = s[Q.id]; if (!a || !b) return null; return this.habitaciones[a.r][a.c] === this.habitaciones[b.r][b.c]; },
            a: P.id, b: Q.id, peso: 5,
          });
        } else if (habP !== habQ && !involucraVictima) {
          porChar[P.id].push({
            texto: pick(PHRASE_NOHAB_PAR)(P, Q),
            check: s => { const a = s[P.id], b = s[Q.id]; if (!a || !b) return null; return this.habitaciones[a.r][a.c] !== this.habitaciones[b.r][b.c]; },
            a: P.id, b: Q.id, peso: 2,
          });
        }

        // Offset exacto: "justo una fila al norte de Y" (más específico que dirección genérica)
        if (P.r === Q.r - 1) porChar[P.id].push({ texto: `${P.nombre} estaba una fila más al norte que ${Q.nombre}.`, check: s => { const a = s[P.id], b = s[Q.id]; if (!a || !b) return null; return a.r === b.r - 1; }, a: P.id, b: Q.id, peso: 6 });
        else if (P.r === Q.r + 1) porChar[P.id].push({ texto: `${P.nombre} estaba una fila más al sur que ${Q.nombre}.`, check: s => { const a = s[P.id], b = s[Q.id]; if (!a || !b) return null; return a.r === b.r + 1; }, a: P.id, b: Q.id, peso: 6 });
        if (P.c === Q.c - 1) porChar[P.id].push({ texto: `${P.nombre} estaba una columna más al oeste que ${Q.nombre}.`, check: s => { const a = s[P.id], b = s[Q.id]; if (!a || !b) return null; return a.c === b.c - 1; }, a: P.id, b: Q.id, peso: 6 });
        else if (P.c === Q.c + 1) porChar[P.id].push({ texto: `${P.nombre} estaba una columna más al este que ${Q.nombre}.`, check: s => { const a = s[P.id], b = s[Q.id]; if (!a || !b) return null; return a.c === b.c + 1; }, a: P.id, b: Q.id, peso: 6 });

        // Dirección genérica
        if (P.r < Q.r)      porChar[P.id].push({ texto: PHRASE_DIR_PAR.norte(P, Q), check: s => { const a = s[P.id], b = s[Q.id]; if (!a || !b) return null; return a.r < b.r; }, a: P.id, b: Q.id, peso: 4 });
        else if (P.r > Q.r) porChar[P.id].push({ texto: PHRASE_DIR_PAR.sur(P, Q),   check: s => { const a = s[P.id], b = s[Q.id]; if (!a || !b) return null; return a.r > b.r; }, a: P.id, b: Q.id, peso: 4 });
        if (P.c < Q.c)      porChar[P.id].push({ texto: PHRASE_DIR_PAR.oeste(P, Q), check: s => { const a = s[P.id], b = s[Q.id]; if (!a || !b) return null; return a.c < b.c; }, a: P.id, b: Q.id, peso: 4 });
        else if (P.c > Q.c) porChar[P.id].push({ texto: PHRASE_DIR_PAR.este(P, Q),  check: s => { const a = s[P.id], b = s[Q.id]; if (!a || !b) return null; return a.c > b.c; }, a: P.id, b: Q.id, peso: 4 });
      }
    }
    return porChar;
  }

  ordenarPistas(elegidas, todos) {
    const ordenId = todos.map(P => P.id);
    return [...elegidas].sort((a, b) => ordenId.indexOf(a.a) - ordenId.indexOf(b.a));
  }

  async crearPistasUnaPorPersona() {
    const todos = this.todosPersonajes();
    const porChar = this.generarPistasCandidatasPorChar();
    for (const P of todos) {
      if (porChar[P.id].length === 0) return false;
      porChar[P.id].sort((a, b) => (b.peso - a.peso) + (Math.random() - 0.5) * 0.4);
    }
    const maxPasos = this.maxPasosSolver();
    const LIMITE_HC = 8; // limite alto para señal granular durante hill-climb

    const score = (r) => r.count + (r.abortado ? 50 : 0);

    // Inicial: si el personaje tiene una pista "encima de mueble único" (peso 9), úsala.
    // Para los demás, alterna entre fila/columna/habitación para diversificar.
    let elegidas = todos.map((P, i) => {
      const pool = porChar[P.id];
      const top = pool.find(p => p.peso >= 9);
      if (top) return top;
      // Si no hay encima-de-mueble, escoge según índice para variar
      const tipo = i % 3;
      if (tipo === 0) {
        const enFila = pool.find(p => p.peso === 5 && /en la fila/.test(p.texto)) || pool[0];
        return enFila;
      } else if (tipo === 1) {
        const enHab = pool.find(p => p.peso === 6 && /(en el|en la|encontraba en|permaneció en)/.test(p.texto)) || pool[0];
        return enHab;
      } else {
        const enCol = pool.find(p => p.peso === 5 && /(en la columna|columna número|columna fue)/.test(p.texto)) || pool[0];
        return enCol;
      }
    });

    let res = this.contarSoluciones(elegidas, 2, maxPasos);
    if (res.count === 1 && !res.abortado) {
      this.pistas = this.ordenarPistas(elegidas, todos);
      return true;
    }
    let mejorScore = score(this.contarSoluciones(elegidas, LIMITE_HC, maxPasos));

    const maxIters = this.tamano <= 8 ? 140 : this.tamano <= 12 ? 200 : 260;
    let sinMejora = 0;
    for (let iter = 0; iter < maxIters; iter++) {
      const ix = randInt(todos.length);
      const pool = porChar[todos[ix].id];
      if (pool.length === 1) continue;
      const topPool = Math.min(10, pool.length);
      const nueva = pool[randInt(topPool)];
      if (nueva === elegidas[ix]) continue;
      const cand = elegidas.slice();
      cand[ix] = nueva;
      const r = this.contarSoluciones(cand, LIMITE_HC, maxPasos);
      if (r.count === 1 && !r.abortado) {
        this.pistas = this.ordenarPistas(cand, todos);
        return true;
      }
      const s = score(r);
      if (s < mejorScore || (s === mejorScore && Math.random() < 0.2)) {
        mejorScore = s;
        elegidas = cand;
        sinMejora = 0;
      } else {
        sinMejora++;
      }
      // Reinicio aleatorio si nos atascamos
      if (sinMejora > 25) {
        elegidas = todos.map(P => {
          const pool = porChar[P.id];
          return pool[randInt(Math.min(6, pool.length))];
        });
        mejorScore = score(this.contarSoluciones(elegidas, LIMITE_HC, maxPasos));
        sinMejora = 0;
      }
      if (iter % 6 === 5) await sleep(0);
    }
    return false;
  }

  // === 5. Solver (backtracking optimizado con bitmasks) ===
  contarSoluciones(constraints, limite = 2, maxPasos = 500_000) {
    const T = this.tamano;
    const todos = this.todosPersonajes();
    const ids = todos.map(P => P.id);

    // Agrupar restricciones por personaje referido (a o b)
    const restPorChar = {};
    const unariasPorChar = {};
    for (const id of ids) { restPorChar[id] = []; unariasPorChar[id] = []; }
    for (const c of constraints) {
      if (c.a) restPorChar[c.a].push(c);
      if (c.b && c.b !== c.a) restPorChar[c.b].push(c);
      if (c.a && !c.b) unariasPorChar[c.a].push(c);
    }

    // Pre-filtrar candidatas por personaje aplicando restricciones unarias
    const candidatosPorChar = {};
    for (const P of todos) {
      const lista = [];
      const unarias = unariasPorChar[P.id];
      for (let r = 0; r < T; r++) for (let c = 0; c < T; c++) {
        if (this.tableroReal[r][c] === 'X') continue;
        if (unarias.length > 0) {
          const fake = { [P.id]: { r, c } };
          let ok = true;
          for (const u of unarias) { if (u.check(fake) === false) { ok = false; break; } }
          if (!ok) continue;
        }
        lista.push({ r, c, rBit: 1 << r, cBit: 1 << c });
      }
      if (lista.length === 0) return 0;
      candidatosPorChar[P.id] = lista;
    }

    // Orden DFS: más restringidos primero
    const orden = [...todos]
      .sort((a, b) => {
        const dr = restPorChar[b.id].length - restPorChar[a.id].length;
        if (dr !== 0) return dr;
        return candidatosPorChar[a.id].length - candidatosPorChar[b.id].length;
      })
      .map(P => P.id);

    let filasUsadas = 0;
    let colsUsadas = 0;
    const asign = {};
    let soluciones = 0;
    let pasos = 0;
    let abortado = false;

    const dfs = idx => {
      if (abortado || soluciones >= limite) return;
      if (++pasos > maxPasos) { abortado = true; return; }
      if (idx === orden.length) { soluciones++; return; }
      const id = orden[idx];
      const cands = candidatosPorChar[id];
      const restr = restPorChar[id];
      for (let i = 0; i < cands.length; i++) {
        const cell = cands[i];
        if ((filasUsadas & cell.rBit) !== 0 || (colsUsadas & cell.cBit) !== 0) continue;
        asign[id] = cell;
        let ok = true;
        for (let j = 0; j < restr.length; j++) {
          const v = restr[j].check(asign);
          if (v === false) { ok = false; break; }
        }
        if (ok) {
          filasUsadas |= cell.rBit;
          colsUsadas |= cell.cBit;
          dfs(idx + 1);
          filasUsadas &= ~cell.rBit;
          colsUsadas &= ~cell.cBit;
        }
        asign[id] = undefined;
        if (abortado || soluciones >= limite) return;
      }
    };

    dfs(0);
    return { count: soluciones, abortado };
  }
}

// ===========================================================
// UI Controller
// ===========================================================

const state = {
  engine: null,
  fichaActiva: null,
  longPressed: false,
  pressTimer: null,
  autoCross: true,
};

const $ = id => document.getElementById(id);

function showToast(msg, tipo = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show ' + tipo;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { t.className = 'toast'; }, 2600);
}

function setSpinner(visible, mensaje = 'Generando caso...') {
  $('spinner').classList.toggle('show', visible);
  $('spinnerMsg').textContent = mensaje;
}

function render() {
  renderTablero();
  renderFichas();
  renderPistas();
}

function renderTablero() {
  const eng = state.engine;
  const wrap = $('tablero');
  wrap.innerHTML = '';
  const T = eng.tamano;
  const maxBoard = Math.min(640, window.innerWidth * 0.62, window.innerHeight * 0.82);
  const cell = Math.max(28, Math.floor(maxBoard / T));
  wrap.style.gridTemplateColumns = `repeat(${T}, ${cell}px)`;

  // Cálculo de filas/columnas tachadas (auto-cross)
  const filasOcupadas = new Set();
  const colsOcupadas = new Set();
  if (state.autoCross) {
    for (let r = 0; r < T; r++) for (let c = 0; c < T; c++) {
      if (eng.tableroJugador[r][c]) { filasOcupadas.add(r); colsOcupadas.add(c); }
    }
  }

  // Etiquetas de salón: una por habitación, en su primera celda libre
  const salonesEtiquetados = new Set();

  for (let r = 0; r < T; r++) {
    for (let c = 0; c < T; c++) {
      const div = document.createElement('div');
      div.className = 'celda';
      div.style.width = cell + 'px';
      div.style.height = cell + 'px';
      const hab = eng.habitaciones[r][c];
      div.style.background = PALETA_HAB[(hab - 1) % PALETA_HAB.length];
      div.style.borderTop    = (r === 0   || eng.habitaciones[r-1][c] !== hab) ? '3px solid var(--ink)' : '1px solid rgba(43,24,16,0.18)';
      div.style.borderBottom = (r === T-1 || eng.habitaciones[r+1][c] !== hab) ? '3px solid var(--ink)' : '1px solid rgba(43,24,16,0.18)';
      div.style.borderLeft   = (c === 0   || eng.habitaciones[r][c-1] !== hab) ? '3px solid var(--ink)' : '1px solid rgba(43,24,16,0.18)';
      div.style.borderRight  = (c === T-1 || eng.habitaciones[r][c+1] !== hab) ? '3px solid var(--ink)' : '1px solid rgba(43,24,16,0.18)';

      const real = eng.tableroReal[r][c];
      if (real === 'X') {
        div.classList.add('obstaculo');
        const nomObs = eng.nombreObstaculo[r + ',' + c] || 'obstáculo';
        div.title = nomObs;
      } else {
        // Etiqueta de salón: en la primera celda libre de cada habitación
        if (!salonesEtiquetados.has(hab) && cell >= 36) {
          salonesEtiquetados.add(hab);
          const lbl = document.createElement('div');
          lbl.className = 'room-label';
          lbl.textContent = eng.nombreHabitacion[hab] || '';
          div.appendChild(lbl);
        }
        // Mueble usable (silla, cama, etc.) — ícono visible + tooltip
        const mueb = eng.mueble[r + ',' + c];
        if (mueb) {
          div.classList.add('has-mueble');
          div.title = mueb;
          const mIcon = document.createElement('div');
          mIcon.className = 'mueble-icon';
          mIcon.textContent = iconoMueble(mueb);
          div.appendChild(mIcon);
        }

        const placed = eng.tableroJugador[r][c];
        if (placed === 'V') {
          const inner = document.createElement('div');
          inner.className = 'pieza-sospechoso es-victima';
          inner.textContent = '★';
          inner.title = eng.victima.nombre;
          div.appendChild(inner);
        } else if (placed) {
          const sp = eng.sospechosos.find(s => s.id === placed);
          const inner = document.createElement('div');
          inner.className = 'pieza-sospechoso';
          inner.textContent = sp.id;
          inner.title = sp.nombre;
          div.appendChild(inner);
        } else {
          const notas = eng.notas[r][c];
          if (notas.size > 0) {
            const ndiv = document.createElement('div');
            ndiv.className = 'notas';
            ndiv.textContent = [...notas].sort().join(' ');
            ndiv.style.fontSize = Math.max(8, Math.min(11, Math.floor(cell / 5))) + 'px';
            div.appendChild(ndiv);
          } else if (state.autoCross && (filasOcupadas.has(r) || colsOcupadas.has(c))) {
            const x = document.createElement('div');
            x.className = 'auto-cross';
            x.textContent = '×';
            div.appendChild(x);
          }
        }
        attachCellHandlers(div, r, c);
      }
      wrap.appendChild(div);
    }
  }
}

function attachCellHandlers(div, r, c) {
  div.addEventListener('pointerdown', e => {
    if (e.button !== undefined && e.button !== 0) return;
    state.longPressed = false;
    div.classList.add('press');
    clearTimeout(state.pressTimer);
    state.pressTimer = setTimeout(() => {
      state.longPressed = true;
      div.classList.remove('press');
      div.classList.add('long-press-flash');
      setTimeout(() => div.classList.remove('long-press-flash'), 250);
      onCellLongPress(r, c);
    }, 500);
  });
  const cancel = () => {
    clearTimeout(state.pressTimer);
    state.pressTimer = null;
    div.classList.remove('press');
  };
  div.addEventListener('pointerup', cancel);
  div.addEventListener('pointerleave', cancel);
  div.addEventListener('pointercancel', cancel);
  div.addEventListener('click', () => {
    if (state.longPressed) { state.longPressed = false; return; }
    onCellClick(r, c);
  });
  div.addEventListener('dblclick', () => onCellDblClick(r, c));
}

function filaOColumnaBloqueadas(eng, r, c) {
  const T = eng.tamano;
  for (let i = 0; i < T; i++) {
    if (i !== c && eng.tableroJugador[r][i]) return true;
    if (i !== r && eng.tableroJugador[i][c]) return true;
  }
  return false;
}

function onCellClick(r, c) {
  const eng = state.engine;
  if (eng.tableroJugador[r][c]) return; // celda fija → solo dblclick para retirar
  if (filaOColumnaBloqueadas(eng, r, c)) return; // fila o columna ya tiene pieza
  if (!state.fichaActiva) { showToast('Selecciona primero una ficha en el panel.', ''); return; }
  const notas = eng.notas[r][c];
  if (notas.has(state.fichaActiva)) notas.delete(state.fichaActiva);
  else notas.add(state.fichaActiva);
  renderTablero();
}

function onCellLongPress(r, c) {
  const eng = state.engine;
  if (eng.tableroJugador[r][c]) return;
  if (filaOColumnaBloqueadas(eng, r, c)) {
    showToast('Esa fila o columna ya tiene una pieza fijada.', 'error');
    return;
  }
  if (!state.fichaActiva) { showToast('Selecciona primero una ficha en el panel.', ''); return; }
  const id = state.fichaActiva;
  const T = eng.tamano;
  // Retirar de su posición previa
  for (let i = 0; i < T; i++) for (let j = 0; j < T; j++) if (eng.tableroJugador[i][j] === id) eng.tableroJugador[i][j] = null;
  // Borrar TODAS las notas de este personaje en cualquier celda
  for (let i = 0; i < T; i++) for (let j = 0; j < T; j++) eng.notas[i][j].delete(id);
  // Fijar
  eng.tableroJugador[r][c] = id;
  // Limpiar notas en toda la fila y columna del destino
  for (let i = 0; i < T; i++) {
    eng.notas[r][i].clear();
    eng.notas[i][c].clear();
  }
  render();
}

function onCellDblClick(r, c) {
  const eng = state.engine;
  if (eng.tableroJugador[r][c]) {
    eng.tableroJugador[r][c] = null;
    render();
  }
}

function renderFichas() {
  const cont = $('sospechosos');
  cont.innerHTML = '';
  const eng = state.engine;
  const ficha = (P, esVictima = false) => {
    const div = document.createElement('div');
    div.className = 'chip' + (esVictima ? ' victima' : '');
    if (state.fichaActiva === P.id) div.classList.add('activa');
    let colocado = false;
    for (let r = 0; r < eng.tamano && !colocado; r++)
      for (let c = 0; c < eng.tamano && !colocado; c++)
        if (eng.tableroJugador[r][c] === P.id) colocado = true;
    if (colocado) div.classList.add('colocado');
    div.textContent = (esVictima ? '★ ' : '') + P.id + ' · ' + P.nombre + (esVictima ? ' (víctima)' : '');
    div.addEventListener('click', () => {
      state.fichaActiva = state.fichaActiva === P.id ? null : P.id;
      renderFichas();
    });
    cont.appendChild(div);
  };
  ficha(eng.victima, true);
  for (const s of eng.sospechosos) ficha(s, false);
}

function renderPistas() {
  const ol = $('pistas');
  ol.innerHTML = '';
  for (const p of state.engine.pistas) {
    const li = document.createElement('li');
    li.textContent = p.texto;
    ol.appendChild(li);
  }
}

function comprobarTablero() {
  const eng = state.engine;
  const T = eng.tamano;
  const asign = {};
  const todos = eng.todosPersonajes();
  const faltan = [];
  for (const P of todos) {
    let pos = null;
    for (let r = 0; r < T && !pos; r++)
      for (let c = 0; c < T && !pos; c++)
        if (eng.tableroJugador[r][c] === P.id) pos = { r, c };
    if (pos) asign[P.id] = pos;
    else faltan.push(P.nombre);
  }
  if (faltan.length > 0) {
    showToast(`Faltan por colocar: ${faltan.slice(0, 3).join(', ')}${faltan.length > 3 ? '...' : ''}`, 'error');
    return;
  }
  const filas = new Set(), cols = new Set();
  for (const id in asign) {
    const p = asign[id];
    if (filas.has(p.r)) { showToast('Dos personajes en la misma fila.', 'error'); return; }
    if (cols.has(p.c)) { showToast('Dos personajes en la misma columna.', 'error'); return; }
    filas.add(p.r); cols.add(p.c);
  }
  for (const p of eng.pistas) {
    if (p.check(asign) === false) { showToast('Pista incumplida: «' + p.texto + '»', 'error'); return; }
  }
  if (asign.V.r !== eng.victima.r || asign.V.c !== eng.victima.c) {
    showToast('La víctima no está en sus coordenadas reales.', 'error');
    return;
  }
  const habV = eng.habitaciones[eng.victima.r][eng.victima.c];
  let asesino = null;
  for (const s of eng.sospechosos) {
    const p = asign[s.id];
    if (eng.habitaciones[p.r][p.c] === habV) { asesino = s; break; }
  }
  const correcto = asesino && asesino.id === eng.asesinoId;
  $('modalTitulo').textContent = correcto ? '¡Caso resuelto!' : 'Acusación errónea';
  $('modalCuerpo').innerHTML = correcto
    ? `Has demostrado que <b>${asesino.nombre}</b> (${asesino.id}) estaba en la misma habitación que <b>${eng.victima.nombre}</b>.<br><br>Caso cerrado, detective.`
    : `Tu disposición no señala al verdadero asesino. Revisa las pistas.`;
  $('modal').classList.add('show');
}

async function nuevoCaso() {
  const dif = $('dificultad').value;
  setSpinner(true, 'Generando caso...');
  state.fichaActiva = null;
  await sleep(20);
  const eng = new MurdokuEngine(dif);
  const t0 = performance.now();
  const ok = await eng.generar(msg => setSpinner(true, msg));
  setSpinner(false);
  if (!ok) {
    showToast('No se pudo generar un caso único; inténtalo otra vez.', 'error');
    return;
  }
  state.engine = eng;
  window.__murdoku = { engine: eng };
  render();
  showToast(`Caso listo en ${Math.round(performance.now() - t0)} ms.`, 'victoria');
}

function limpiarTablero() {
  const eng = state.engine;
  const T = eng.tamano;
  for (let r = 0; r < T; r++) for (let c = 0; c < T; c++) {
    eng.tableroJugador[r][c] = null;
    eng.notas[r][c].clear();
  }
  render();
}

function rendirse() {
  const eng = state.engine;
  const T = eng.tamano;
  for (let r = 0; r < T; r++) for (let c = 0; c < T; c++) {
    const v = eng.tableroReal[r][c];
    if (v && v !== 'X') eng.tableroJugador[r][c] = v;
    else if (!v) eng.tableroJugador[r][c] = null;
    eng.notas[r][c].clear();
  }
  render();
  const asesino = eng.sospechosos.find(s => s.id === eng.asesinoId);
  showToast('Solución revelada. Asesino: ' + asesino.nombre, 'error');
}

function init() {
  $('nuevo').addEventListener('click', nuevoCaso);
  $('validar').addEventListener('click', comprobarTablero);
  $('limpiar').addEventListener('click', limpiarTablero);
  $('revelar').addEventListener('click', rendirse);
  $('modalCerrar').addEventListener('click', () => $('modal').classList.remove('show'));
  const ac = $('autoCross');
  if (ac) {
    state.autoCross = ac.checked;
    ac.addEventListener('change', () => {
      state.autoCross = ac.checked;
      if (state.engine) renderTablero();
    });
  }
  window.addEventListener('resize', () => { if (state.engine) renderTablero(); });
  nuevoCaso();
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

})();
