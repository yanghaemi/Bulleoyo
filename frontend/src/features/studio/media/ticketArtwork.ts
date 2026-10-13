export interface ArtworkPosition {
  x: number
  y: number
}
export interface TicketArtworkText {
  title: string
  subtitle: string
  dateTime: string
  venue: string
}
export const TICKET_ARTWORK_SIZE = { width: 1800, height: 720 } as const

export function ticketSourceCrop(
  source: { width: number; height: number },
  position: ArtworkPosition,
) {
  const width = Math.min(source.width, source.height * 2.5)
  const height = width / 2.5
  return {
    x: ((source.width - width) * Math.max(0, Math.min(100, position.x))) / 100,
    y: ((source.height - height) * Math.max(0, Math.min(100, position.y))) / 100,
    width,
    height,
  }
}

/** Static decorative art only: this interface intentionally has no QR, ticket ID or status fields. */
export async function renderTicketArtwork(input: {
  mode: 'DESIGN' | 'UPLOAD'
  image?: HTMLImageElement
  position: ArtworkPosition
  accent: string
  text: TicketArtworkText
}): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = TICKET_ARTWORK_SIZE.width
  canvas.height = TICKET_ARTWORK_SIZE.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('CLIENT_CANVAS_FAILED')
  if (input.mode === 'DESIGN') {
    context.fillStyle = input.accent
    context.fillRect(0, 0, canvas.width, canvas.height)
  }
  if (input.image) {
    const source = { width: input.image.naturalWidth, height: input.image.naturalHeight }
    if (!source.width || !source.height) throw new Error('CLIENT_IMAGE_DECODE_FAILED')
    const crop = ticketSourceCrop(source, input.position)
    context.drawImage(
      input.image,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      canvas.width,
      canvas.height,
    )
  } else if (input.mode === 'UPLOAD') throw new Error('CLIENT_IMAGE_DECODE_FAILED')
  if (input.mode === 'DESIGN') {
    if (input.image) {
      context.fillStyle = 'rgba(0, 0, 0, 0.65)'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = input.accent
      context.fillRect(0, 0, 20, canvas.height)
    }
    context.fillStyle = '#ffffff'
    context.textBaseline = 'top'
    const line = (value: string, y: number, size: number, weight: number) => {
      context.font = `${weight} ${size}px sans-serif`
      let label = value
      while (label.length && context.measureText(label).width > 1584) label = label.slice(0, -1)
      if (label !== value) label = `${label.slice(0, -1)}…`
      context.fillText(label, 108, y, 1584)
    }
    line('LIVE PERFORMANCE', 72, 32, 600)
    line(input.text.title, 230, 126, 700)
    line(input.text.subtitle, 396, 54, 400)
    line([input.text.dateTime, input.text.venue].filter(Boolean).join(' · '), 576, 42, 500)
  }
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
  let transparent = false
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] < 255) {
      transparent = true
      break
    }
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('CLIENT_CANVAS_FAILED'))),
      transparent ? 'image/png' : 'image/jpeg',
      0.82,
    ),
  )
}
