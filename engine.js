// engine.js — MURDOKU: Cluedo × Sudoku
// Motor de generación + control de UI. Envuelto en IIFE para encapsular scope
// sin depender de soporte de ES modules en el entorno de carga.

(function () {
'use strict';

const CONFIG_DIFICULTAD = {
  muy_facil:   { tamano: 6,  sospechosos: 4,  habitaciones: 3, obstaculos: 4  },
  facil:       { tamano: 8,  sospechosos: 6,  habitaciones: 4, obstaculos: 6  },
  moderado:    { tamano: 10, sospechosos: 9,  habitaciones: 5, obstaculos: 10 },
  dificil:     { tamano: 12, sospechosos: 11, habitaciones: 6, obstaculos: 15 },
  muy_dificil: { tamano: 16, sospechosos: 15, habitaciones: 8, obstaculos: 25 },
};

const NOMBRES = [
  "Aitor","Bea","Cira","Dante","Elena","Fran","Greta","Hugo",
  "Iris","Jano","Kira","Lía","Mateo","Nora","Olmo",
];

const PALETA_HAB = [
  "#fde4cf","#e4f1fe","#e9f5db","#fff1c1","#fbe5e1",
  "#e0d7f5","#d6efe1","#fcd5ce","#ddedea","#f0e1d4",
];

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
    this.sospechosos = [];
    this.victima = { id: 'V', nombre: 'Virgilio', r: -1, c: -1 };
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
        if (coMates.length === 0) continue;
        // Aplicar la solución
        this.sospechosos = [];
        for (let r = 0; r < T; r++) for (let c = 0; c < T; c++) this.tableroReal[r][c] = null;
        this.victima.r = posiciones[vi].r;
        this.victima.c = posiciones[vi].c;
        this.tableroReal[this.victima.r][this.victima.c] = 'V';
        const idxAses = pick(coMates);
        let nIdx = 0;
        const nombresMezcla = shuffle([...NOMBRES]);
        for (let i = 0; i < K; i++) {
          if (i === vi) continue;
          const id = String.fromCharCode(65 + nIdx);
          const nombre = nombresMezcla[nIdx % nombresMezcla.length];
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
    let n = 0, intentos = 0;
    while (n < cuantos && intentos < cuantos * 50 + 20) {
      intentos++;
      const r = randInt(T), c = randInt(T);
      if (this.tableroReal[r][c] !== null) continue;
      this.tableroReal[r][c] = 'X';
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

    for (const P of todos) {
      // Paredes (unaria, muy restrictiva)
      if (P.r === 0)   porChar[P.id].push({ texto: `${P.nombre} estaba pegado a la pared norte.`,  check: s => { const p = s[P.id]; if (!p) return null; return p.r === 0; },   a: P.id, peso: 5 });
      if (P.r === T-1) porChar[P.id].push({ texto: `${P.nombre} estaba pegado a la pared sur.`,    check: s => { const p = s[P.id]; if (!p) return null; return p.r === T-1; }, a: P.id, peso: 5 });
      if (P.c === 0)   porChar[P.id].push({ texto: `${P.nombre} estaba pegado a la pared oeste.`,  check: s => { const p = s[P.id]; if (!p) return null; return p.c === 0; },   a: P.id, peso: 5 });
      if (P.c === T-1) porChar[P.id].push({ texto: `${P.nombre} estaba pegado a la pared este.`,   check: s => { const p = s[P.id]; if (!p) return null; return p.c === T-1; }, a: P.id, peso: 5 });

      // Obstáculo adyacente (unaria, restrictiva)
      const dirs = [["arriba",-1,0],["abajo",1,0],["a su izquierda",0,-1],["a su derecha",0,1]];
      for (const [nd, dr, dc] of dirs) {
        const nr = P.r + dr, nc = P.c + dc;
        if (nr >= 0 && nr < T && nc >= 0 && nc < T && this.tableroReal[nr][nc] === 'X') {
          porChar[P.id].push({
            texto: `${P.nombre} tenía un obstáculo ${nd}.`,
            check: s => {
              const p = s[P.id]; if (!p) return null;
              const nr2 = p.r + dr, nc2 = p.c + dc;
              if (nr2 < 0 || nr2 >= T || nc2 < 0 || nc2 >= T) return false;
              return this.tableroReal[nr2][nc2] === 'X';
            },
            a: P.id, peso: 4,
          });
        }
      }

      // Relaciones binarias (con otros personajes)
      for (const Q of todos) {
        if (Q.id === P.id) continue;
        const dist = Math.abs(P.r - Q.r) + Math.abs(P.c - Q.c);
        const habP = this.habitaciones[P.r][P.c];
        const habQ = this.habitaciones[Q.r][Q.c];

        porChar[P.id].push({
          texto: `${P.nombre} estaba a ${dist} casillas de ${Q.nombre}.`,
          check: s => { const a = s[P.id], b = s[Q.id]; if (!a || !b) return null; return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === dist; },
          a: P.id, b: Q.id, peso: 2,
        });

        if (habP === habQ) {
          porChar[P.id].push({
            texto: `${P.nombre} compartía habitación con ${Q.nombre}.`,
            check: s => { const a = s[P.id], b = s[Q.id]; if (!a || !b) return null; return this.habitaciones[a.r][a.c] === this.habitaciones[b.r][b.c]; },
            a: P.id, b: Q.id, peso: 3,
          });
        } else {
          porChar[P.id].push({
            texto: `${P.nombre} no compartía habitación con ${Q.nombre}.`,
            check: s => { const a = s[P.id], b = s[Q.id]; if (!a || !b) return null; return this.habitaciones[a.r][a.c] !== this.habitaciones[b.r][b.c]; },
            a: P.id, b: Q.id, peso: 1,
          });
        }

        if (P.r < Q.r)      porChar[P.id].push({ texto: `${P.nombre} estaba al norte de ${Q.nombre}.`, check: s => { const a = s[P.id], b = s[Q.id]; if (!a || !b) return null; return a.r < b.r; }, a: P.id, b: Q.id, peso: 2 });
        else if (P.r > Q.r) porChar[P.id].push({ texto: `${P.nombre} estaba al sur de ${Q.nombre}.`,   check: s => { const a = s[P.id], b = s[Q.id]; if (!a || !b) return null; return a.r > b.r; }, a: P.id, b: Q.id, peso: 2 });
        if (P.c < Q.c)      porChar[P.id].push({ texto: `${P.nombre} estaba al oeste de ${Q.nombre}.`, check: s => { const a = s[P.id], b = s[Q.id]; if (!a || !b) return null; return a.c < b.c; }, a: P.id, b: Q.id, peso: 2 });
        else if (P.c > Q.c) porChar[P.id].push({ texto: `${P.nombre} estaba al este de ${Q.nombre}.`,  check: s => { const a = s[P.id], b = s[Q.id]; if (!a || !b) return null; return a.c > b.c; }, a: P.id, b: Q.id, peso: 2 });
      }
    }
    return porChar;
  }

  async crearPistasUnaPorPersona() {
    const todos = this.todosPersonajes();
    const porChar = this.generarPistasCandidatasPorChar();
    for (const P of todos) {
      if (porChar[P.id].length === 0) return false;
      porChar[P.id].sort((a, b) => b.peso - a.peso);
    }
    const maxPasos = this.maxPasosSolver();

    // Construcción GREEDY: para cada personaje, elige (entre sus 6 mejores
    // pistas) la que minimiza el conteo de soluciones al añadirla al set
    // acumulado. Repite con varias semillas de orden si no converge.
    const semillas = this.tamano <= 8 ? 8 : this.tamano <= 12 ? 6 : 4;
    for (let semilla = 0; semilla < semillas; semilla++) {
      const ordenChars = [...todos];
      // Primera semilla = peso descendente; siguientes = aleatorias
      if (semilla === 0) {
        ordenChars.sort((a, b) => porChar[b.id][0].peso - porChar[a.id][0].peso);
      } else {
        shuffle(ordenChars);
      }
      const elegidas = [];
      const topN = this.tamano <= 8 ? 6 : 4;
      let abortar = false;
      for (const P of ordenChars) {
        const candidatas = porChar[P.id].slice(0, Math.min(topN, porChar[P.id].length));
        let mejorPista = null;
        let mejorConteo = Infinity;
        for (const pista of candidatas) {
          const probe = [...elegidas, pista];
          const conteo = this.contarSoluciones(probe, 2, maxPasos);
          if (conteo < mejorConteo) {
            mejorConteo = conteo;
            mejorPista = pista;
            if (conteo <= 1) break;
          }
        }
        if (!mejorPista) { abortar = true; break; }
        elegidas.push(mejorPista);
        if (mejorConteo === 0) { abortar = true; break; }
        await sleep(0);
      }
      if (abortar) continue;
      const final = this.contarSoluciones(elegidas, 2, maxPasos);
      if (final === 1) {
        const ordenId = todos.map(P => P.id);
        elegidas.sort((a, b) => ordenId.indexOf(a.a) - ordenId.indexOf(b.a));
        this.pistas = elegidas;
        return true;
      }
      await sleep(0);
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
    if (abortado) return Math.max(soluciones, limite);
    return soluciones;
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
      } else {
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

function onCellClick(r, c) {
  const eng = state.engine;
  if (eng.tableroJugador[r][c]) return; // celda fija → solo dblclick para retirar
  if (!state.fichaActiva) { showToast('Selecciona primero una ficha en el panel.', ''); return; }
  const notas = eng.notas[r][c];
  if (notas.has(state.fichaActiva)) notas.delete(state.fichaActiva);
  else notas.add(state.fichaActiva);
  renderTablero();
}

function onCellLongPress(r, c) {
  const eng = state.engine;
  if (eng.tableroJugador[r][c]) return;
  if (!state.fichaActiva) { showToast('Selecciona primero una ficha en el panel.', ''); return; }
  const id = state.fichaActiva;
  // Retirar de su posición previa
  const T = eng.tamano;
  for (let i = 0; i < T; i++) for (let j = 0; j < T; j++) if (eng.tableroJugador[i][j] === id) eng.tableroJugador[i][j] = null;
  eng.tableroJugador[r][c] = id;
  eng.notas[r][c].clear();
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
  window.addEventListener('resize', () => { if (state.engine) renderTablero(); });
  nuevoCaso();
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

})();
