// Uniform spatial grid for enemy<->enemy neighbor queries.
// Never naive O(n^2): cell size == interaction radius, scan 3x3 neighborhood.

export class SpatialGrid {
  private cellSize: number;
  private cols = 0;
  private rows = 0;
  private originX = 0;
  private originY = 0;
  private cells: number[][] = []; // each cell holds indices into the entity array

  constructor(cellSize: number) {
    this.cellSize = Math.max(8, cellSize);
  }

  /** Reset to cover a region (call once per frame before inserting). */
  reset(minX: number, minY: number, width: number, height: number): void {
    this.originX = minX;
    this.originY = minY;
    this.cols = Math.max(1, Math.ceil(width / this.cellSize));
    this.rows = Math.max(1, Math.ceil(height / this.cellSize));
    const total = this.cols * this.rows;
    if (this.cells.length < total) {
      while (this.cells.length < total) this.cells.push([]);
    }
    for (let i = 0; i < total; i++) this.cells[i].length = 0;
  }

  private cellIndex(x: number, y: number): number {
    let cx = Math.floor((x - this.originX) / this.cellSize);
    let cy = Math.floor((y - this.originY) / this.cellSize);
    if (cx < 0) cx = 0;
    else if (cx >= this.cols) cx = this.cols - 1;
    if (cy < 0) cy = 0;
    else if (cy >= this.rows) cy = this.rows - 1;
    return cy * this.cols + cx;
  }

  insert(index: number, x: number, y: number): void {
    this.cells[this.cellIndex(x, y)].push(index);
  }

  /** Visit indices in the 3x3 block around (x,y). */
  forEachNeighbor(x: number, y: number, fn: (index: number) => void): void {
    const cx = Math.floor((x - this.originX) / this.cellSize);
    const cy = Math.floor((y - this.originY) / this.cellSize);
    for (let oy = -1; oy <= 1; oy++) {
      const ny = cy + oy;
      if (ny < 0 || ny >= this.rows) continue;
      for (let ox = -1; ox <= 1; ox++) {
        const nx = cx + ox;
        if (nx < 0 || nx >= this.cols) continue;
        const cell = this.cells[ny * this.cols + nx];
        for (let i = 0; i < cell.length; i++) fn(cell[i]);
      }
    }
  }
}
