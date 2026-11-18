// Troceado SIN PÉRDIDA de un JPEG en teselas (equivalente a `jpegtran -crop`).
//
// No decodifica la imagen a píxeles: lee los coeficientes DCT cuantizados del
// JPEG original y los vuelve a escribir, bloque a bloque, en un JPEG por tesela.
// Cada tesela contiene exactamente los mismos datos que su zona del original, así
// que se ve idéntica (salvo, como mucho, 1-2 px de color en sus bordes por el
// suavizado de la crominancia que hace el decodificador).
//
// Solo admite JPEG secuencial con Huffman (SOF0/SOF1, 8 bits) en un único scan
// entrelazado, que es lo que generan prácticamente todas las cámaras 360º. Para
// lo demás (progresivo, aritmético...) lanza UnsupportedJpegError y quien llama
// usa el troceado con recompresión.
//
// Este módulo no usa APIs del navegador: funciona igual en un Worker o en Node.

export class UnsupportedJpegError extends Error {}

interface HuffTable {
  // Tabla de decodificación (canónica) + LUT de 9 bits para los códigos cortos.
  maxcode: Int32Array; // [18]
  valptr: Int32Array; // [17]
  mincode: Int32Array; // [17]
  huffval: Uint8Array;
  lut: Int32Array; // (longitud << 8) | símbolo, 0 = no está en la LUT
}

interface Component {
  id: number;
  h: number;
  v: number;
  tq: number;
  td: number; // tabla DC
  ta: number; // tabla AC
}

export interface JpegInfo {
  width: number;
  height: number;
  sofMarker: number; // 0xC0 o 0xC1
  components: Component[];
  hmax: number;
  vmax: number;
  mcuW: number; // px
  mcuH: number; // px
  mcusX: number;
  mcusY: number;
  restartInterval: number;
  dqt: Uint8Array[]; // segmentos DQT completos (con marcador), se copian tal cual
  app0?: Uint8Array; // JFIF
  app14?: Uint8Array; // Adobe (indica la transformación de color)
  dc: (HuffTable | undefined)[];
  ac: (HuffTable | undefined)[];
  scanStart: number; // offset del primer byte de datos entrópicos
}

const LUT_BITS = 9;

function buildHuffTable(counts: Uint8Array, symbols: Uint8Array): HuffTable {
  const maxcode = new Int32Array(18).fill(-1);
  const valptr = new Int32Array(17);
  const mincode = new Int32Array(17);
  const lut = new Int32Array(1 << LUT_BITS);
  let code = 0;
  let k = 0;
  for (let len = 1; len <= 16; len++) {
    const n = counts[len - 1];
    valptr[len] = k;
    mincode[len] = code;
    for (let i = 0; i < n; i++) {
      if (len <= LUT_BITS) {
        const shift = LUT_BITS - len;
        const base = code << shift;
        for (let j = 0; j < 1 << shift; j++) lut[base + j] = (len << 8) | symbols[k];
      }
      code++;
      k++;
    }
    maxcode[len] = n ? code - 1 : -1;
    code <<= 1;
  }
  maxcode[17] = 0x7fffffff; // centinela
  return { maxcode, valptr, mincode, huffval: symbols, lut };
}

function u16(d: Uint8Array, p: number): number {
  return (d[p] << 8) | d[p + 1];
}

// Lee las cabeceras hasta el inicio de los datos del (único) scan.
export function parseJpeg(d: Uint8Array): JpegInfo {
  if (d.length < 4 || d[0] !== 0xff || d[1] !== 0xd8) {
    throw new UnsupportedJpegError('no es un JPEG');
  }
  const dc: (HuffTable | undefined)[] = [];
  const ac: (HuffTable | undefined)[] = [];
  const dqt: Uint8Array[] = [];
  let app0: Uint8Array | undefined;
  let app14: Uint8Array | undefined;
  let restartInterval = 0;
  let frame:
    | { width: number; height: number; sofMarker: number; comps: Component[] }
    | undefined;

  let p = 2;
  while (p < d.length) {
    if (d[p] !== 0xff) throw new UnsupportedJpegError('estructura JPEG inválida');
    let marker = d[p + 1];
    while (marker === 0xff) marker = d[++p + 1]; // bytes de relleno
    p += 2;
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;
    if (marker === 0xd9) break;
    const len = u16(d, p);
    const seg = d.subarray(p + 2, p + len);
    const whole = d.subarray(p - 2, p + len);

    if (marker === 0xc0 || marker === 0xc1) {
      if (seg[0] !== 8) throw new UnsupportedJpegError('precisión distinta de 8 bits');
      const height = u16(seg, 1);
      const width = u16(seg, 3);
      const n = seg[5];
      const comps: Component[] = [];
      for (let i = 0; i < n; i++) {
        const o = 6 + i * 3;
        comps.push({ id: seg[o], h: seg[o + 1] >> 4, v: seg[o + 1] & 15, tq: seg[o + 2], td: 0, ta: 0 });
      }
      if (!width || !height) throw new UnsupportedJpegError('dimensiones no válidas');
      frame = { width, height, sofMarker: marker, comps };
    } else if (marker >= 0xc2 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      throw new UnsupportedJpegError('JPEG progresivo, sin pérdida o aritmético');
    } else if (marker === 0xc4) {
      let q = 0;
      while (q < seg.length) {
        const tc = seg[q] >> 4;
        const th = seg[q] & 15;
        const counts = seg.subarray(q + 1, q + 17);
        let total = 0;
        for (let i = 0; i < 16; i++) total += counts[i];
        const symbols = seg.slice(q + 17, q + 17 + total);
        (tc === 0 ? dc : ac)[th] = buildHuffTable(counts, symbols);
        q += 17 + total;
      }
    } else if (marker === 0xdb) {
      dqt.push(whole.slice());
    } else if (marker === 0xdd) {
      restartInterval = u16(seg, 0);
    } else if (marker === 0xe0 && !app0) {
      app0 = whole.slice();
    } else if (marker === 0xee && !app14) {
      app14 = whole.slice();
    } else if (marker === 0xda) {
      if (!frame) throw new UnsupportedJpegError('SOS antes de SOF');
      const ns = seg[0];
      if (ns !== frame.comps.length) {
        throw new UnsupportedJpegError('scans no entrelazados');
      }
      for (let i = 0; i < ns; i++) {
        const cid = seg[1 + i * 2];
        const c = frame.comps.find((x) => x.id === cid);
        if (!c || frame.comps[i] !== c) throw new UnsupportedJpegError('orden de componentes');
        c.td = seg[2 + i * 2] >> 4;
        c.ta = seg[2 + i * 2] & 15;
      }
      const o = 1 + ns * 2;
      if (seg[o] !== 0 || seg[o + 1] !== 63 || seg[o + 2] !== 0) {
        throw new UnsupportedJpegError('scan no secuencial');
      }
      const comps = frame.comps;
      // Con un solo componente la MCU es siempre un bloque de 8x8.
      if (comps.length === 1) {
        comps[0].h = 1;
        comps[0].v = 1;
      }
      for (const c of comps) {
        if (!dc[c.td] || !ac[c.ta]) throw new UnsupportedJpegError('falta una tabla Huffman');
      }
      const hmax = Math.max(...comps.map((c) => c.h));
      const vmax = Math.max(...comps.map((c) => c.v));
      const mcuW = 8 * hmax;
      const mcuH = 8 * vmax;
      return {
        width: frame.width,
        height: frame.height,
        sofMarker: frame.sofMarker,
        components: comps,
        hmax,
        vmax,
        mcuW,
        mcuH,
        mcusX: Math.ceil(frame.width / mcuW),
        mcusY: Math.ceil(frame.height / mcuH),
        restartInterval,
        dqt,
        app0,
        app14,
        dc,
        ac,
        scanStart: p + len,
      };
    }
    p += len;
  }
  throw new UnsupportedJpegError('no se encontró el scan');
}

// --- Reparto en teselas -----------------------------------------------------

export interface TileGrid {
  cols: number;
  rows: number;
  size: number; // lado de la tesela en px (cuadrada)
}

// Lado máximo de tesela: 2048 px cabe como textura en cualquier GPU y sigue
// siendo un trozo manejable para un móvil.
export const MAX_TILE = 2048;
const MIN_TILE = 256;

// Elige la rejilla de teselas para una equirectangular `width` x `height`
// (exactamente 2:1). Las teselas son cuadradas, `cols` es potencia de 2 (lo
// exige Photo Sphere Viewer) y `rows = cols / 2`. Si `align` > 1, el lado debe
// ser múltiplo de él (tamaño de MCU, para poder recortar sin pérdida).
// Devuelve la rejilla con las teselas más grandes que no pasen de MAX_TILE.
export function chooseGrid(width: number, height: number, align = 1): TileGrid | null {
  if (width !== height * 2) return null;
  for (let cols = 2; cols <= 64; cols *= 2) {
    const size = width / cols;
    if (size < MIN_TILE) break;
    if (size > MAX_TILE) continue;
    if (Number.isInteger(size) && size % align === 0) {
      return { cols, rows: cols / 2, size };
    }
  }
  return null;
}

// --- Lectura de bits --------------------------------------------------------

class BitReader {
  private buf = 0;
  private cnt = 0;
  pos: number;
  private readonly d: Uint8Array;

  constructor(d: Uint8Array, pos: number) {
    this.d = d;
    this.pos = pos;
  }

  private fill(): void {
    const d = this.d;
    while (this.cnt <= 24) {
      let b = 0;
      if (this.pos < d.length) {
        b = d[this.pos];
        if (b === 0xff) {
          const nx = d[this.pos + 1];
          if (nx === 0x00) {
            this.pos += 2;
          } else {
            b = 0; // marcador: no avanzar, rellenar con ceros
          }
        } else {
          this.pos++;
        }
      }
      this.buf = (this.buf << 8) | b;
      this.cnt += 8;
    }
  }

  bits(n: number): number {
    if (n === 0) return 0;
    if (this.cnt < n) this.fill();
    this.cnt -= n;
    return (this.buf >>> this.cnt) & ((1 << n) - 1);
  }

  decode(t: HuffTable): number {
    if (this.cnt < 16) this.fill();
    const peek = (this.buf >>> (this.cnt - LUT_BITS)) & ((1 << LUT_BITS) - 1);
    const e = t.lut[peek];
    if (e) {
      this.cnt -= e >> 8;
      return e & 0xff;
    }
    let code = this.bits(LUT_BITS);
    let len = LUT_BITS;
    while (code > t.maxcode[len]) {
      code = (code << 1) | this.bits(1);
      len++;
      if (len > 16) throw new Error('código Huffman inválido');
    }
    return t.huffval[t.valptr[len] + code - t.mincode[len]];
  }

  // Salta a un marcador RSTn tras un intervalo de reinicio.
  restart(): void {
    this.buf = 0;
    this.cnt = 0;
    const d = this.d;
    // Busca el siguiente 0xFF Dn (puede haber bytes de relleno).
    while (this.pos + 1 < d.length) {
      if (d[this.pos] === 0xff && d[this.pos + 1] >= 0xd0 && d[this.pos + 1] <= 0xd7) {
        this.pos += 2;
        return;
      }
      this.pos++;
    }
  }
}

function extend(v: number, s: number): number {
  return v < 1 << (s - 1) ? v - (1 << s) + 1 : v;
}

// --- Escritura --------------------------------------------------------------

class ByteWriter {
  buf: Uint8Array;
  len = 0;
  constructor(size: number) {
    this.buf = new Uint8Array(size);
  }
  private grow(n: number): void {
    if (this.len + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.len + n) size *= 2;
    const nb = new Uint8Array(size);
    nb.set(this.buf.subarray(0, this.len));
    this.buf = nb;
  }
  byte(b: number): void {
    this.grow(1);
    this.buf[this.len++] = b;
  }
  bytes(a: Uint8Array): void {
    this.grow(a.length);
    this.buf.set(a, this.len);
    this.len += a.length;
  }
  u16(v: number): void {
    this.byte(v >> 8);
    this.byte(v & 0xff);
  }
  result(): Uint8Array {
    return this.buf.slice(0, this.len);
  }
}

class BitWriter {
  private acc = 0;
  private n = 0;
  readonly out: ByteWriter;
  constructor(out: ByteWriter) {
    this.out = out;
  }
  write(code: number, size: number): void {
    // size <= 16 + 11; se escribe en dos tramos para no desbordar 32 bits.
    if (size > 16) {
      this.write(code >>> 16, size - 16);
      this.write(code & 0xffff, 16);
      return;
    }
    this.acc = (this.acc << size) | (code & ((1 << size) - 1));
    this.n += size;
    while (this.n >= 8) {
      this.n -= 8;
      const b = (this.acc >>> this.n) & 0xff;
      this.out.byte(b);
      if (b === 0xff) this.out.byte(0x00);
    }
    this.acc &= (1 << this.n) - 1;
  }
  flush(): void {
    if (this.n > 0) this.write((1 << (8 - this.n)) - 1, 8 - this.n); // relleno con unos
  }
}

function bitSize(v: number): number {
  let a = v < 0 ? -v : v;
  let s = 0;
  while (a) {
    s++;
    a >>= 1;
  }
  return s;
}

// Tabla Huffman óptima a partir de frecuencias (jpeg_gen_optimal_table de libjpeg,
// Anexo K.2 de la norma). Devuelve bits[1..16] y los símbolos ordenados.
function optimalTable(freqIn: Int32Array): { bits: Uint8Array; vals: Uint8Array } {
  const freq = Int32Array.from(freqIn); // 257 entradas
  const codesize = new Int32Array(257);
  const others = new Int32Array(257).fill(-1);
  freq[256] = 1; // garantiza que ningún código sea todo unos
  for (;;) {
    let c1 = -1;
    let v = 1e9;
    for (let i = 0; i <= 256; i++) if (freq[i] && freq[i] <= v) { v = freq[i]; c1 = i; }
    let c2 = -1;
    v = 1e9;
    for (let i = 0; i <= 256; i++) if (freq[i] && freq[i] <= v && i !== c1) { v = freq[i]; c2 = i; }
    if (c2 < 0) break;
    freq[c1] += freq[c2];
    freq[c2] = 0;
    codesize[c1]++;
    while (others[c1] >= 0) { c1 = others[c1]; codesize[c1]++; }
    others[c1] = c2;
    codesize[c2]++;
    while (others[c2] >= 0) { c2 = others[c2]; codesize[c2]++; }
  }
  const bitsX = new Int32Array(33);
  for (let i = 0; i <= 256; i++) if (codesize[i]) bitsX[codesize[i]]++;
  // Limita las longitudes a 16 bits.
  for (let i = 32; i > 16; i--) {
    while (bitsX[i] > 0) {
      let j = i - 2;
      while (bitsX[j] === 0) j--;
      bitsX[i] -= 2;
      bitsX[i - 1]++;
      bitsX[j + 1] += 2;
      bitsX[j]--;
    }
  }
  let i = 16;
  while (bitsX[i] === 0) i--;
  bitsX[i]--; // quita el símbolo reservado 256
  const bits = new Uint8Array(17);
  for (let k = 1; k <= 16; k++) bits[k] = bitsX[k];
  const vals: number[] = [];
  for (let len = 1; len <= 32; len++) {
    for (let s = 0; s < 256; s++) if (codesize[s] === len) vals.push(s);
  }
  return { bits, vals: Uint8Array.from(vals) };
}

// Códigos canónicos para codificar (ehufco / ehufsi).
function encodeTable(bits: Uint8Array, vals: Uint8Array): { code: Int32Array; size: Int32Array } {
  const code = new Int32Array(256);
  const size = new Int32Array(256);
  let c = 0;
  let k = 0;
  for (let len = 1; len <= 16; len++) {
    for (let i = 0; i < bits[len]; i++) {
      code[vals[k]] = c;
      size[vals[k]] = len;
      c++;
      k++;
    }
    c <<= 1;
  }
  return { code, size };
}

// --- Troceado ---------------------------------------------------------------

export interface LosslessTilesResult {
  grid: TileGrid;
  // tiles[col][row]
  tiles: Uint8Array[][];
}

// Trocea `data` (JPEG) en la rejilla dada. La rejilla debe estar alineada a la
// MCU (usa chooseGrid(width, height, max(mcuW, mcuH))).
// `onBand` informa del avance (bandas horizontales completadas / total).
export function losslessTiles(
  data: Uint8Array,
  info: JpegInfo,
  grid: TileGrid,
  onBand?: (done: number, total: number) => void,
): LosslessTilesResult {
  const { components: comps, mcusX, mcuW, mcuH } = info;
  if (grid.size % mcuW || grid.size % mcuH) throw new UnsupportedJpegError('rejilla no alineada');
  const mcuColsPerTile = grid.size / mcuW;
  const mcuRowsPerTile = grid.size / mcuH;

  // Coeficientes de una banda (una fila de teselas), en orden zigzag, por componente.
  const bpl = comps.map((c) => mcusX * c.h); // bloques por línea
  const bandRows = comps.map((c) => mcuRowsPerTile * c.v); // filas de bloques por banda
  const bandCoefs = comps.map((_, i) => new Int16Array(bpl[i] * bandRows[i] * 64));

  const reader = new BitReader(data, info.scanStart);
  const preds = new Int32Array(comps.length);
  const dcT = comps.map((c) => info.dc[c.td]!);
  const acT = comps.map((c) => info.ac[c.ta]!);
  let mcuCount = 0;
  const totalMcus = mcusX * info.mcusY;

  const tiles: Uint8Array[][] = Array.from({ length: grid.cols }, () => []);

  for (let band = 0; band < grid.rows; band++) {
    for (const b of bandCoefs) b.fill(0);
    for (let my = 0; my < mcuRowsPerTile; my++) {
      for (let mx = 0; mx < mcusX; mx++) {
        if (info.restartInterval && mcuCount && mcuCount % info.restartInterval === 0) {
          reader.restart();
          preds.fill(0);
        }
        for (let ci = 0; ci < comps.length; ci++) {
          const c = comps[ci];
          const coefs = bandCoefs[ci];
          for (let v = 0; v < c.v; v++) {
            for (let h = 0; h < c.h; h++) {
              const bx = mx * c.h + h;
              const by = my * c.v + v;
              const off = (by * bpl[ci] + bx) * 64;
              // DC
              const t = reader.decode(dcT[ci]);
              const diff = t ? extend(reader.bits(t), t) : 0;
              preds[ci] += diff;
              coefs[off] = preds[ci];
              // AC
              const act = acT[ci];
              for (let k = 1; k < 64; ) {
                const rs = reader.decode(act);
                const r = rs >> 4;
                const s = rs & 15;
                if (s === 0) {
                  if (r === 15) {
                    k += 16;
                    continue;
                  }
                  break; // EOB
                }
                k += r;
                if (k > 63) throw new Error('datos AC fuera de rango');
                coefs[off + k] = extend(reader.bits(s), s);
                k++;
              }
            }
          }
        }
        mcuCount++;
      }
    }
    for (let col = 0; col < grid.cols; col++) {
      tiles[col][band] = encodeTile(info, grid, bandCoefs, bpl, col * mcuColsPerTile, mcuColsPerTile, mcuRowsPerTile);
    }
    onBand?.(band + 1, grid.rows);
  }
  if (mcuCount !== totalMcus) throw new Error('número de MCUs inesperado');
  return { grid, tiles };
}

// Recorre los símbolos de una tesela. `emit(tableKind, tableIndex, symbol,
// extraBits, extraSize)` se llama en el mismo orden en la pasada de estadísticas
// y en la de escritura, así que ambas ven exactamente los mismos símbolos.
function walkTile(
  info: JpegInfo,
  coefsByComp: Int16Array[],
  bpl: number[],
  mx0: number,
  mcuCols: number,
  mcuRows: number,
  emit: (ac: boolean, comp: number, sym: number, extra: number, extraSize: number) => void,
): void {
  const comps = info.components;
  const preds = new Int32Array(comps.length);
  for (let my = 0; my < mcuRows; my++) {
    for (let mx = mx0; mx < mx0 + mcuCols; mx++) {
      for (let ci = 0; ci < comps.length; ci++) {
        const c = comps[ci];
        const coefs = coefsByComp[ci];
        for (let v = 0; v < c.v; v++) {
          for (let h = 0; h < c.h; h++) {
            const off = ((my * c.v + v) * bpl[ci] + mx * c.h + h) * 64;
            const dcv = coefs[off];
            const diff = dcv - preds[ci];
            preds[ci] = dcv;
            const s = bitSize(diff);
            emit(false, ci, s, diff < 0 ? diff - 1 : diff, s);
            let run = 0;
            for (let k = 1; k < 64; k++) {
              const a = coefs[off + k];
              if (a === 0) {
                run++;
                continue;
              }
              while (run > 15) {
                emit(true, ci, 0xf0, 0, 0);
                run -= 16;
              }
              const sz = bitSize(a);
              emit(true, ci, (run << 4) | sz, a < 0 ? a - 1 : a, sz);
              run = 0;
            }
            if (run > 0) emit(true, ci, 0x00, 0, 0);
          }
        }
      }
    }
  }
}

function encodeTile(
  info: JpegInfo,
  grid: TileGrid,
  coefsByComp: Int16Array[],
  bpl: number[],
  mx0: number,
  mcuCols: number,
  mcuRows: number,
): Uint8Array {
  const comps = info.components;
  // Tablas de salida: se reutilizan los índices DC/AC del original.
  const dcIdx = [...new Set(comps.map((c) => c.td))];
  const acIdx = [...new Set(comps.map((c) => c.ta))];
  const dcFreq = new Map(dcIdx.map((i) => [i, new Int32Array(257)]));
  const acFreq = new Map(acIdx.map((i) => [i, new Int32Array(257)]));

  // Pasada 1: estadísticas para tablas Huffman óptimas.
  walkTile(info, coefsByComp, bpl, mx0, mcuCols, mcuRows, (ac, ci, sym) => {
    const c = comps[ci];
    (ac ? acFreq.get(c.ta)! : dcFreq.get(c.td)!)[sym]++;
  });
  const dcTabs = new Map<number, { bits: Uint8Array; vals: Uint8Array }>();
  const acTabs = new Map<number, { bits: Uint8Array; vals: Uint8Array }>();
  for (const [i, f] of dcFreq) dcTabs.set(i, optimalTable(f));
  for (const [i, f] of acFreq) acTabs.set(i, optimalTable(f));
  const dcEnc = new Map([...dcTabs].map(([i, t]) => [i, encodeTable(t.bits, t.vals)]));
  const acEnc = new Map([...acTabs].map(([i, t]) => [i, encodeTable(t.bits, t.vals)]));

  // Cabeceras.
  const out = new ByteWriter(grid.size * grid.size);
  out.u16(0xffd8);
  if (info.app0) out.bytes(info.app0);
  if (info.app14) out.bytes(info.app14);
  for (const q of info.dqt) out.bytes(q);
  // SOF
  out.u16(0xff00 | info.sofMarker);
  out.u16(8 + comps.length * 3);
  out.byte(8);
  out.u16(grid.size);
  out.u16(grid.size);
  out.byte(comps.length);
  for (const c of comps) {
    out.byte(c.id);
    out.byte((c.h << 4) | c.v);
    out.byte(c.tq);
  }
  // DHT
  const writeDht = (cls: number, idx: number, t: { bits: Uint8Array; vals: Uint8Array }) => {
    out.u16(0xffc4);
    out.u16(2 + 1 + 16 + t.vals.length);
    out.byte((cls << 4) | idx);
    for (let k = 1; k <= 16; k++) out.byte(t.bits[k]);
    out.bytes(t.vals);
  };
  for (const [i, t] of dcTabs) writeDht(0, i, t);
  for (const [i, t] of acTabs) writeDht(1, i, t);
  // SOS
  out.u16(0xffda);
  out.u16(6 + comps.length * 2);
  out.byte(comps.length);
  for (const c of comps) {
    out.byte(c.id);
    out.byte((c.td << 4) | c.ta);
  }
  out.byte(0);
  out.byte(63);
  out.byte(0);

  // Pasada 2: datos.
  const bw = new BitWriter(out);
  walkTile(info, coefsByComp, bpl, mx0, mcuCols, mcuRows, (ac, ci, sym, extra, extraSize) => {
    const c = comps[ci];
    const e = ac ? acEnc.get(c.ta)! : dcEnc.get(c.td)!;
    bw.write(e.code[sym], e.size[sym]);
    if (extraSize) bw.write(extra & ((1 << extraSize) - 1), extraSize);
  });
  bw.flush();
  out.u16(0xffd9);
  return out.result();
}
