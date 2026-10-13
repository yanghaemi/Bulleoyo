import { useEffect, useState } from 'react'
import type { ArtworkPosition } from './ticketArtwork'

/** Each mode owns one instance, so switching modes never discards the inactive file. */
export function useArtworkImage() {
  const [file, setFile] = useState<File>()
  const [preview, setPreview] = useState<{ file: File; url: string }>()
  const [image, setImage] = useState<HTMLImageElement>()
  const [error, setError] = useState<'type' | 'size' | 'decode'>()
  const [position, setPosition] = useState<ArtworkPosition>({ x: 50, y: 50 })
  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setPreview({ file, url })
    return () => URL.revokeObjectURL(url)
  }, [file])

  const select = (next: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(next.type)) {
      setError('type')
      return
    }
    if (!next.size || next.size > 20 * 1024 * 1024) {
      setError('size')
      return
    }
    setFile(next)
    setImage(undefined)
    setError(undefined)
    setPosition({ x: 50, y: 50 })
  }
  const remove = () => {
    setFile(undefined)
    setImage(undefined)
    setError(undefined)
    setPosition({ x: 50, y: 50 })
  }
  return {
    file,
    image,
    error,
    position,
    setPosition,
    select,
    remove,
    url: preview?.file === file ? preview?.url : undefined,
    loaded: (element: HTMLImageElement) => {
      if (!element.naturalWidth || !element.naturalHeight) {
        setError('decode')
        return
      }
      setImage(element)
    },
    failed: () => {
      setImage(undefined)
      setError('decode')
    },
  }
}
