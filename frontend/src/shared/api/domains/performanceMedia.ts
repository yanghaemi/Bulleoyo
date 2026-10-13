import { uploadFormData } from '@/shared/api/client'

export type PerformanceMediaKind = 'poster' | 'ticket-artwork'

export interface SavedPerformanceMedia {
  imageUrl: string
}

export function performanceMediaUrl(performanceId: number | string, kind: PerformanceMediaKind) {
  return `/api/v1/performances/${performanceId}/media/${kind}`
}

export async function uploadPerformanceMedia(
  performanceId: number,
  kind: PerformanceMediaKind,
  image: Blob,
): Promise<SavedPerformanceMedia> {
  const form = new FormData()
  form.append('file', image, `${kind}.${image.type === 'image/png' ? 'png' : image.type === 'image/webp' ? 'webp' : 'jpg'}`)
  return uploadFormData<SavedPerformanceMedia>(`/performances/${performanceId}/media/${kind}`, form)
}
