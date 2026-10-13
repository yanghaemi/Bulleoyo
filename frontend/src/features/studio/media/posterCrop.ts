export interface PosterCrop {
  rotation: 0 | 90 | 180 | 270
  zoom: number
  x: number
  y: number
}

interface Size {
  width: number
  height: number
}
export const POSTER_SIZE = { width: 1080, height: 1440 } as const
export const INITIAL_POSTER_CROP: PosterCrop = { rotation: 0, zoom: 1, x: 0, y: 0 }

function rotatedSize(source: Size, rotation: PosterCrop['rotation']): Size {
  return rotation === 90 || rotation === 270
    ? { width: source.height, height: source.width }
    : source
}

export function posterScale(source: Size, crop: PosterCrop): number {
  const size = rotatedSize(source, crop.rotation)
  return Math.max(POSTER_SIZE.width / size.width, POSTER_SIZE.height / size.height) * crop.zoom
}

export function clampPosterCrop(source: Size, crop: PosterCrop): PosterCrop {
  const zoom = Math.min(3, Math.max(1, crop.zoom))
  const scale = posterScale(source, { ...crop, zoom })
  const size = rotatedSize(source, crop.rotation)
  const maxX = Math.max(0, (size.width * scale - POSTER_SIZE.width) / 2)
  const maxY = Math.max(0, (size.height * scale - POSTER_SIZE.height) / 2)
  return {
    ...crop,
    zoom,
    x: Math.max(-maxX, Math.min(maxX, crop.x)) || 0,
    y: Math.max(-maxY, Math.min(maxY, crop.y)) || 0,
  }
}

/** Local rendering only. The caller must explicitly provide the real upload operation. */
export async function renderPoster(image: HTMLImageElement, crop: PosterCrop): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = POSTER_SIZE.width
  canvas.height = POSTER_SIZE.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('CLIENT_CANVAS_FAILED')
  const source = { width: image.naturalWidth, height: image.naturalHeight }
  if (!source.width || !source.height) throw new Error('CLIENT_IMAGE_DECODE_FAILED')
  const bounded = clampPosterCrop(source, crop)
  const scale = posterScale(source, bounded)
  context.translate(canvas.width / 2 + bounded.x, canvas.height / 2 + bounded.y)
  context.rotate((bounded.rotation * Math.PI) / 180)
  context.drawImage(
    image,
    (-source.width * scale) / 2,
    (-source.height * scale) / 2,
    source.width * scale,
    source.height * scale,
  )
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
  let transparent = false
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] < 255) {
      transparent = true
      break
    }
  }
  // Preserve alpha when present; opaque images use the planned JPEG quality.
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('CLIENT_CANVAS_FAILED'))),
      transparent ? 'image/png' : 'image/jpeg',
      0.82,
    ),
  )
}
