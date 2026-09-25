import type { City } from '../world/CityGenerator';
import { HALF } from '../world/constants';

export interface MapMarker {
  x: number;
  z: number;
  kind: 'item' | 'car' | 'house';
}

const SCALE = 2; // pixels par mètre dans la carte pré-rendue
const VIEW_RADIUS = 55; // mètres visibles autour du joueur

/** Mini-carte du téléphone : carte de la ville pré-rendue + marqueurs. */
export class Minimap {
  private readonly base: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly size: number;
  private acc = 0;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly city: City) {
    this.ctx = canvas.getContext('2d')!;
    const ext = city.extent + 4;
    this.size = Math.ceil(ext * 2 * SCALE);
    this.base = document.createElement('canvas');
    this.base.width = this.base.height = this.size;
    const b = this.base.getContext('2d')!;
    const toPx = (v: number) => (v + ext) * SCALE;
    b.fillStyle = '#a9c98a';
    b.fillRect(0, 0, this.size, this.size);
    b.fillStyle = '#5b5c6e';
    b.fillRect(toPx(-city.extent), toPx(-city.extent), city.extent * 2 * SCALE, city.extent * 2 * SCALE);
    for (const bl of city.blocks) {
      const colors: Record<string, string> = {
        park: '#93cf73',
        start: '#93cf73',
        parking: '#8a899a',
        residential: '#b8dca0',
        house: '#b8dca0',
      };
      b.fillStyle = '#e4dcd2';
      b.fillRect(toPx(bl.x - HALF), toPx(bl.z - HALF), HALF * 2 * SCALE, HALF * 2 * SCALE);
      const inner = colors[bl.type];
      if (inner) {
        b.fillStyle = inner;
        b.fillRect(toPx(bl.x - 15), toPx(bl.z - 15), 30 * SCALE, 30 * SCALE);
      }
    }
    b.fillStyle = '#c9a6d8';
    for (const f of city.footprints) {
      b.fillRect(toPx(f.minX), toPx(f.minZ), (f.maxX - f.minX) * SCALE, (f.maxZ - f.minZ) * SCALE);
    }
    b.strokeStyle = 'rgba(45,38,64,0.25)';
    b.lineWidth = 1;
    for (const f of city.footprints) {
      b.strokeRect(toPx(f.minX), toPx(f.minZ), (f.maxX - f.minX) * SCALE, (f.maxZ - f.minZ) * SCALE);
    }
  }

  draw(dt: number, px: number, pz: number, heading: number, markers: MapMarker[]): void {
    this.acc += dt;
    if (this.acc < 0.08) return;
    this.acc = 0;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const ext = this.city.extent + 4;
    const k = w / (VIEW_RADIUS * 2); // px écran par mètre
    ctx.save();
    ctx.fillStyle = '#a9c98a';
    ctx.fillRect(0, 0, w, h);
    // Carte orientée nord en haut (z+ vers le bas)
    const sx = (px + ext) * SCALE - VIEW_RADIUS * SCALE;
    const sz = (pz + ext) * SCALE - VIEW_RADIUS * SCALE;
    ctx.drawImage(this.base, sx, sz, VIEW_RADIUS * 2 * SCALE, VIEW_RADIUS * 2 * SCALE, 0, 0, w, h);

    const toScreen = (x: number, z: number) => {
      let dx = (x - px) * k;
      let dz = (z - pz) * k;
      const r = Math.hypot(dx, dz);
      const max = w / 2 - 12;
      const clamped = r > max;
      if (clamped) {
        dx = (dx / r) * max;
        dz = (dz / r) * max;
      }
      return { x: w / 2 + dx, y: h / 2 + dz, clamped };
    };

    for (const m of markers) {
      const s = toScreen(m.x, m.z);
      ctx.globalAlpha = s.clamped ? 0.75 : 1;
      if (m.kind === 'item') {
        ctx.fillStyle = '#ffd24a';
        ctx.strokeStyle = '#2d2640';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (m.kind === 'car') {
        ctx.fillStyle = '#3fb6b0';
        ctx.strokeStyle = '#2d2640';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(s.x - 8, s.y - 5, 16, 10, 3);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillStyle = '#e8504a';
        ctx.strokeStyle = '#2d2640';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y - 9);
        ctx.lineTo(s.x + 8, s.y - 1);
        ctx.lineTo(s.x + 6, s.y - 1);
        ctx.lineTo(s.x + 6, s.y + 7);
        ctx.lineTo(s.x - 6, s.y + 7);
        ctx.lineTo(s.x - 6, s.y - 1);
        ctx.lineTo(s.x - 8, s.y - 1);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // Joueur : flèche orientée
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-heading);
    ctx.fillStyle = '#ff6f59';
    ctx.strokeStyle = '#fff7ee';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 10);
    ctx.lineTo(7, -7);
    ctx.lineTo(0, -3);
    ctx.lineTo(-7, -7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
