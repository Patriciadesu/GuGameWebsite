export interface SvgGuideRouteNode {
  id: string;
  x: number;
  y: number;
}

export interface SvgGuideRouteEdge {
  sourceId: string;
  targetId: string;
}

export interface SvgGuideBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

const loadImage = (source: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('Unable to load SVG guide.'));
  image.src = source;
});

const nearestWalkable = (x: number, y: number, width: number, height: number, walkable: (x: number, y: number) => boolean) => {
  const startX = Math.max(0, Math.min(width - 1, Math.round(x)));
  const startY = Math.max(0, Math.min(height - 1, Math.round(y)));
  for (let radius = 0; radius <= 16; radius += 1) {
    for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
      for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
        const nextX = startX + offsetX;
        const nextY = startY + offsetY;
        if (nextX >= 0 && nextX < width && nextY >= 0 && nextY < height && walkable(nextX, nextY)) return { x: nextX, y: nextY };
      }
    }
  }
  return null;
};

export const buildSvgGuideRoutes = async (
  assetUrl: string,
  bounds: SvgGuideBounds,
  nodes: SvgGuideRouteNode[],
  edges: SvgGuideRouteEdge[]
) => {
  const image = await loadImage(assetUrl);
  const rasterSize = 360;
  const canvas = document.createElement('canvas');
  canvas.width = rasterSize;
  canvas.height = rasterSize;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return {};
  context.drawImage(image, 0, 0, rasterSize, rasterSize);
  const alpha = context.getImageData(0, 0, rasterSize, rasterSize).data;
  const walkable = (x: number, y: number) => alpha[(y * rasterSize + x) * 4 + 3] >= 40;
  const imageScale = Math.min(bounds.width / image.width, bounds.height / image.height);
  const imageWidth = image.width * imageScale;
  const imageHeight = image.height * imageScale;
  const imageX = bounds.x + (bounds.width - imageWidth) / 2;
  const imageY = bounds.y + (bounds.height - imageHeight) / 2;
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const routes: Record<string, string> = {};

  edges.forEach(edge => {
    const source = nodeById.get(edge.sourceId);
    const target = nodeById.get(edge.targetId);
    if (!source || !target) return;
    const toRaster = (point: SvgGuideRouteNode) => ({
      x: (point.x - imageX) / Math.max(1, imageWidth) * rasterSize,
      y: (point.y - imageY) / Math.max(1, imageHeight) * rasterSize
    });
    const start = nearestWalkable(toRaster(source).x, toRaster(source).y, rasterSize, rasterSize, walkable);
    const end = nearestWalkable(toRaster(target).x, toRaster(target).y, rasterSize, rasterSize, walkable);
    if (!start || !end) return;
    const startIndex = start.y * rasterSize + start.x;
    const endIndex = end.y * rasterSize + end.x;
    const previous = new Int32Array(rasterSize * rasterSize).fill(-1);
    const queue = [startIndex];
    previous[startIndex] = startIndex;
    for (let cursor = 0; cursor < queue.length && previous[endIndex] === -1; cursor += 1) {
      const current = queue[cursor];
      const x = current % rasterSize;
      const y = Math.floor(current / rasterSize);
      for (const offsetX of [-1, 0, 1]) {
        for (const offsetY of [-1, 0, 1]) {
          if (offsetX === 0 && offsetY === 0) continue;
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          const nextIndex = nextY * rasterSize + nextX;
          if (nextX < 0 || nextX >= rasterSize || nextY < 0 || nextY >= rasterSize || previous[nextIndex] !== -1 || !walkable(nextX, nextY)) continue;
          previous[nextIndex] = current;
          queue.push(nextIndex);
        }
      }
    }
    if (previous[endIndex] === -1) return;
    const path: Array<{ x: number; y: number }> = [];
    for (let current = endIndex; current !== startIndex; current = previous[current]) {
      path.push({ x: current % rasterSize, y: Math.floor(current / rasterSize) });
    }
    path.push(start);
    path.reverse();
    const worldPoints = path.filter((_, index) => index % 5 === 0 || index === path.length - 1).map(point => ({
      x: imageX + point.x / rasterSize * imageWidth,
      y: imageY + point.y / rasterSize * imageHeight
    }));
    routes[`${edge.sourceId}:${edge.targetId}`] = worldPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  });
  return routes;
};

// Extract the visible silhouette as small edge segments. Keeping the segments
// separate preserves concave corners and holes; a convex hull would turn every
// unique guide into the same generic polygon.
export const buildSvgGuideOutline = async (assetUrl: string, bounds: SvgGuideBounds) => {
  const image = await loadImage(assetUrl);
  // 120px keeps the silhouette recognizable without producing a jagged,
  // overly-detailed wrapper path.
  const size = 120;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return '';
  context.drawImage(image, 0, 0, size, size);
  const alpha = context.getImageData(0, 0, size, size).data;
  const imageScale = Math.min(bounds.width / image.width, bounds.height / image.height);
  const imageWidth = image.width * imageScale;
  const imageHeight = image.height * imageScale;
  const imageX = bounds.x + (bounds.width - imageWidth) / 2;
  const imageY = bounds.y + (bounds.height - imageHeight) / 2;
  const baseWalkable = (x: number, y: number) => x >= 0 && x < size && y >= 0 && y < size && alpha[(y * size + x) * 4 + 3] >= 40;
  const paddingCells = Math.max(1, Math.ceil(5 / Math.max(1, imageWidth / size)));
  const walkable = (x: number, y: number) => {
    for (let offsetY = -paddingCells; offsetY <= paddingCells; offsetY += 1) {
      for (let offsetX = -paddingCells; offsetX <= paddingCells; offsetX += 1) {
        if (offsetX * offsetX + offsetY * offsetY <= paddingCells * paddingCells && baseWalkable(x + offsetX, y + offsetY)) return true;
      }
    }
    return false;
  };
  const toWorldX = (x: number) => imageX + x / size * imageWidth;
  const toWorldY = (y: number) => imageY + y / size * imageHeight;
  const segments: string[] = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!walkable(x, y)) continue;
      if (!walkable(x, y - 1)) segments.push(`M ${toWorldX(x)} ${toWorldY(y)} L ${toWorldX(x + 1)} ${toWorldY(y)}`);
      if (!walkable(x + 1, y)) segments.push(`M ${toWorldX(x + 1)} ${toWorldY(y)} L ${toWorldX(x + 1)} ${toWorldY(y + 1)}`);
      if (!walkable(x, y + 1)) segments.push(`M ${toWorldX(x + 1)} ${toWorldY(y + 1)} L ${toWorldX(x)} ${toWorldY(y + 1)}`);
      if (!walkable(x - 1, y)) segments.push(`M ${toWorldX(x)} ${toWorldY(y + 1)} L ${toWorldX(x)} ${toWorldY(y)}`);
    }
  }
  return segments.join(' ');
};
