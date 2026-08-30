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

export interface BakedSvgGuideBoundary {
  path: string;
  assetUrl: string;
  bounds: SvgGuideBounds;
  imageSize?: { width: number; height: number };
  generatedAt?: string;
}

export const bakedBoundaryTransform = (boundary: BakedSvgGuideBoundary, destination: SvgGuideBounds) => {
  const source = boundary.bounds;
  const imageWidth = Math.max(1, boundary.imageSize?.width || source.width);
  const imageHeight = Math.max(1, boundary.imageSize?.height || source.height);
  const sourceImageScale = Math.min(source.width / imageWidth, source.height / imageHeight);
  const destinationImageScale = Math.min(destination.width / imageWidth, destination.height / imageHeight);
  const sourceImageX = source.x + (source.width - imageWidth * sourceImageScale) / 2;
  const sourceImageY = source.y + (source.height - imageHeight * sourceImageScale) / 2;
  const destinationImageX = destination.x + (destination.width - imageWidth * destinationImageScale) / 2;
  const destinationImageY = destination.y + (destination.height - imageHeight * destinationImageScale) / 2;
  const scale = destinationImageScale / Math.max(Number.EPSILON, sourceImageScale);
  const translateX = destinationImageX - sourceImageX * scale;
  const translateY = destinationImageY - sourceImageY * scale;
  return `translate(${translateX} ${translateY}) scale(${scale})`;
};

const imageCache = new Map<string, Promise<HTMLImageElement>>();
interface SvgGuideMask {
  width: number;
  height: number;
  walkable: Uint8Array;
}
const routeMaskCache = new Map<string, Promise<SvgGuideMask>>();
const loadImage = (source: string) => {
  const cached = imageCache.get(source);
  if (cached) return cached;
  const request = new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('Unable to load SVG guide.'));
  image.src = source;
  });
  imageCache.set(source, request);
  request.catch(() => imageCache.delete(source));
  return request;
};

export const getSvgGuideImageSize = async (assetUrl: string) => {
  const image = await loadImage(assetUrl);
  return { width: image.naturalWidth || image.width, height: image.naturalHeight || image.height };
};

const loadRouteMask = async (assetUrl: string) => {
  const cached = routeMaskCache.get(assetUrl);
  if (cached) return cached;
  const request = loadImage(assetUrl).then(image => {
    // Preserve the guide's aspect ratio. A square raster was stretching the
    // 1200×700 constellation art, producing bad routes while doing ~40% more
    // pixel work than necessary.
    const width = 360;
    const height = Math.max(120, Math.round(width * image.height / Math.max(1, image.width)));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Unable to prepare SVG guide mask.');
    context.drawImage(image, 0, 0, width, height);
    const alpha = context.getImageData(0, 0, width, height).data;
    const walkable = new Uint8Array(width * height);
    for (let index = 0; index < walkable.length; index += 1) walkable[index] = alpha[index * 4 + 3] >= 40 ? 1 : 0;
    return { width, height, walkable };
  });
  routeMaskCache.set(assetUrl, request);
  request.catch(() => routeMaskCache.delete(assetUrl));
  return request;
};

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
  const [image, mask] = await Promise.all([loadImage(assetUrl), loadRouteMask(assetUrl)]);
  const rasterWidth = mask.width;
  const rasterHeight = mask.height;
  const walkable = (x: number, y: number) => mask.walkable[y * rasterWidth + x] === 1;
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
      x: (point.x - imageX) / Math.max(1, imageWidth) * rasterWidth,
      y: (point.y - imageY) / Math.max(1, imageHeight) * rasterHeight
    });
    const start = nearestWalkable(toRaster(source).x, toRaster(source).y, rasterWidth, rasterHeight, walkable);
    const end = nearestWalkable(toRaster(target).x, toRaster(target).y, rasterWidth, rasterHeight, walkable);
    if (!start || !end) return;
    const startIndex = start.y * rasterWidth + start.x;
    const endIndex = end.y * rasterWidth + end.x;
    const previous = new Int32Array(rasterWidth * rasterHeight).fill(-1);
    const queue = [startIndex];
    previous[startIndex] = startIndex;
    for (let cursor = 0; cursor < queue.length && previous[endIndex] === -1; cursor += 1) {
      const current = queue[cursor];
      const x = current % rasterWidth;
      const y = Math.floor(current / rasterWidth);
      for (const offsetX of [-1, 0, 1]) {
        for (const offsetY of [-1, 0, 1]) {
          if (offsetX === 0 && offsetY === 0) continue;
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          const nextIndex = nextY * rasterWidth + nextX;
          if (nextX < 0 || nextX >= rasterWidth || nextY < 0 || nextY >= rasterHeight || previous[nextIndex] !== -1 || !walkable(nextX, nextY)) continue;
          previous[nextIndex] = current;
          queue.push(nextIndex);
        }
      }
    }
    if (previous[endIndex] === -1) return;
    const path: Array<{ x: number; y: number }> = [];
    for (let current = endIndex; current !== startIndex; current = previous[current]) {
      path.push({ x: current % rasterWidth, y: Math.floor(current / rasterWidth) });
    }
    path.push(start);
    path.reverse();
    const worldPoints = path.filter((_, index) => index % 5 === 0 || index === path.length - 1).map(point => ({
      x: imageX + point.x / rasterWidth * imageWidth,
      y: imageY + point.y / rasterHeight * imageHeight
    }));
    routes[`${edge.sourceId}:${edge.targetId}`] = worldPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  });
  return routes;
};

type OutlinePoint = { x: number; y: number };

const pointKey = (point: OutlinePoint) => `${point.x},${point.y}`;

const smoothContour = (points: OutlinePoint[], toWorldX: (x: number) => number, toWorldY: (y: number) => number, closed: boolean) => {
  if (points.length < 3) return '';
  // Collapse long runs of collinear raster edges before creating the curve.
  const corners = points.filter((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    return (point.x - previous.x) * (next.y - point.y) !== (point.y - previous.y) * (next.x - point.x);
  });
  const contour = corners.length >= 3 ? corners : points;
  const midpoint = (a: OutlinePoint, b: OutlinePoint): OutlinePoint => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  if (!closed) {
    let path = `M ${toWorldX(contour[0].x)} ${toWorldY(contour[0].y)}`;
    for (let index = 1; index < contour.length - 1; index += 1) {
      const point = contour[index];
      const nextMidpoint = midpoint(point, contour[index + 1]);
      path += ` Q ${toWorldX(point.x)} ${toWorldY(point.y)} ${toWorldX(nextMidpoint.x)} ${toWorldY(nextMidpoint.y)}`;
    }
    const last = contour[contour.length - 1];
    path += ` L ${toWorldX(last.x)} ${toWorldY(last.y)}`;
    return path;
  }
  const start = midpoint(contour[contour.length - 1], contour[0]);
  let path = `M ${toWorldX(start.x)} ${toWorldY(start.y)}`;
  for (let index = 0; index < contour.length; index += 1) {
    const point = contour[index];
    const next = contour[(index + 1) % contour.length];
    // Quadratic midpoint curves round each corner without overshooting the
    // silhouette (which can happen with cubic controls on small hulls).
    const control = point;
    const nextMidpoint = midpoint(point, next);
    path += ` Q ${toWorldX(control.x)} ${toWorldY(control.y)} ${toWorldX(nextMidpoint.x)} ${toWorldY(nextMidpoint.y)}`;
  }
  return `${path} Z`;
};

// Extract connected silhouette loops rather than returning independent edge
// segments. The old segment output made SVG outlines look broken and prevented
// SVG strokes from being genuinely smooth, especially after dilation.
export const buildSvgGuideOutline = async (assetUrl: string, bounds: SvgGuideBounds) => {
  const image = await loadImage(assetUrl);
  // Reserve a transparent rim so the 30px expansion never clips a contour at
  // the raster edge; clipped masks cannot form a closed marching-squares loop.
  const size = 160;
  const inset = 16;
  const drawableSize = size - inset * 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return '';
  context.drawImage(image, inset, inset, drawableSize, drawableSize);
  const alpha = context.getImageData(0, 0, size, size).data;
  const imageScale = Math.min(bounds.width / image.width, bounds.height / image.height);
  const imageWidth = image.width * imageScale;
  const imageHeight = image.height * imageScale;
  const imageX = bounds.x + (bounds.width - imageWidth) / 2;
  const imageY = bounds.y + (bounds.height - imageHeight) / 2;
  const baseWalkable = (x: number, y: number) => x >= 0 && x < size && y >= 0 && y < size && alpha[(y * size + x) * 4 + 3] >= 40;
  const paddingCells = Math.max(1, Math.ceil(30 / Math.max(1, imageWidth / drawableSize)));
  const walkable = (x: number, y: number) => {
    for (let offsetY = -paddingCells; offsetY <= paddingCells; offsetY += 1) {
      for (let offsetX = -paddingCells; offsetX <= paddingCells; offsetX += 1) {
        if (offsetX * offsetX + offsetY * offsetY <= paddingCells * paddingCells && baseWalkable(x + offsetX, y + offsetY)) return true;
      }
    }
    return false;
  };
  const toWorldX = (x: number) => imageX + (x - inset) / drawableSize * imageWidth;
  const toWorldY = (y: number) => imageY + (y - inset) / drawableSize * imageHeight;
  const edges: Array<{ start: OutlinePoint; end: OutlinePoint }> = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!walkable(x, y)) continue;
      if (!walkable(x, y - 1)) edges.push({ start: { x, y }, end: { x: x + 1, y } });
      if (!walkable(x + 1, y)) edges.push({ start: { x: x + 1, y }, end: { x: x + 1, y: y + 1 } });
      if (!walkable(x, y + 1)) edges.push({ start: { x: x + 1, y: y + 1 }, end: { x, y: y + 1 } });
      if (!walkable(x - 1, y)) edges.push({ start: { x, y: y + 1 }, end: { x, y } });
    }
  }
  // Marching squares traces the visible alpha boundary itself. A convex hull
  // shortcuts across concave or detached parts of a guide, which is why the
  // lower-left SVG lobe could end up outside the previous boundary.
  const contours: Array<Array<[OutlinePoint, OutlinePoint]>> = [];
  const segments: Array<[OutlinePoint, OutlinePoint]> = [];
  const edgePoint = (x: number, y: number, edge: 'top' | 'right' | 'bottom' | 'left'): OutlinePoint => {
    if (edge === 'top') return { x: x + 0.5, y };
    if (edge === 'right') return { x: x + 1, y: y + 0.5 };
    if (edge === 'bottom') return { x: x + 0.5, y: y + 1 };
    return { x, y: y + 0.5 };
  };
  const addSegment = (x: number, y: number, start: Parameters<typeof edgePoint>[2], end: Parameters<typeof edgePoint>[2]) =>
    segments.push([edgePoint(x, y, start), edgePoint(x, y, end)]);
  const cases: Record<number, Array<[Parameters<typeof edgePoint>[2], Parameters<typeof edgePoint>[2]]>> = {
    0: [], 1: [['left', 'top']], 2: [['top', 'right']], 3: [['left', 'right']],
    4: [['right', 'bottom']], 5: [['left', 'top'], ['right', 'bottom']], 6: [['top', 'bottom']], 7: [['left', 'bottom']],
    8: [['bottom', 'left']], 9: [['top', 'bottom']], 10: [['top', 'right'], ['bottom', 'left']], 11: [['right', 'bottom']],
    12: [['left', 'right']], 13: [['top', 'right']], 14: [['left', 'top']], 15: []
  };
  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const state = (walkable(x, y) ? 1 : 0) | (walkable(x + 1, y) ? 2 : 0) | (walkable(x + 1, y + 1) ? 4 : 0) | (walkable(x, y + 1) ? 8 : 0);
      cases[state].forEach(([start, end]) => addSegment(x, y, start, end));
    }
  }
  const segmentsByPoint = new Map<string, number[]>();
  segments.forEach(([start, end], index) => {
    [start, end].forEach(point => {
      const key = pointKey(point);
      segmentsByPoint.set(key, [...(segmentsByPoint.get(key) || []), index]);
    });
  });
  const unused = new Set(segments.map((_, index) => index));
  while (unused.size > 0) {
    const firstIndex = unused.values().next().value as number;
    const [firstStart, firstEnd] = segments[firstIndex];
    const points: OutlinePoint[] = [firstStart, firstEnd];
    unused.delete(firstIndex);
    let current = firstEnd;
    while (pointKey(current) !== pointKey(firstStart)) {
      const candidate = (segmentsByPoint.get(pointKey(current)) || []).find(index => unused.has(index));
      if (candidate === undefined) break;
      unused.delete(candidate);
      const [start, end] = segments[candidate];
      current = pointKey(start) === pointKey(current) ? end : start;
      points.push(current);
    }
    if (points.length > 3 && pointKey(points[0]) === pointKey(points[points.length - 1])) {
      points.pop();
      contours.push(points.map((point, index) => [point, points[(index + 1) % points.length]]));
    }
  }
  return contours.map(contour => smoothContour(contour.map(([start]) => start), toWorldX, toWorldY, true)).join(' ');
};
