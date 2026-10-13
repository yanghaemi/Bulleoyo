import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StageFlare } from './StageFlare'

const gpu = vi.hoisted(() => ({
  effect: vi.fn(),
  tick: undefined as undefined | (() => void),
  set: vi.fn(),
}))
vi.mock('./gpuSupport', () => ({ webGpuEligible: () => true, cssColor: () => [1, 1, 1] }))
vi.mock('./stageRig', () => ({
  createStageRig: async () => ({
    aim: vi.fn(),
    hold: vi.fn(),
    lunge: vi.fn(),
    stop: vi.fn(),
  }),
}))
vi.mock('vgpu', () => ({
  init: async () => ({ dispose: vi.fn() }),
  surface: () => ({ size: [800, 800], onResize: () => () => {}, dispose: vi.fn() }),
  effect: (...args: unknown[]) => {
    gpu.effect(...args)
    return { set: gpu.set }
  },
  clock: () => ({ time: 0 }),
  frameLoop: (_context: unknown, tick: (frame: unknown) => void) => {
    gpu.tick = () => tick({ pass: vi.fn() })
    return { stop: vi.fn() }
  },
}))

beforeEach(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  gpu.effect.mockClear()
  gpu.set.mockClear()
})

describe('stage light follows uploaded artwork', () => {
  it.each([
    [1080, 1440, 0.2, 4 / 15], // 3:4 artwork: 320 × 426.67, not the 320 × 480 slot
    [800, 800, 0.2, 0.2],
    [400, 1000, 0.12, 0.3],
  ])('uses visible contained image bounds for %i × %i', async (width, height, halfX, halfY) => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.tagName === 'CANVAS'
        ? new DOMRect(0, 0, 800, 800)
        : new DOMRect(240, 100, 320, 480)
    })
    render(
      <div>
        <StageFlare />
        <div data-fx="frame">
          <img
            alt="공연"
            src="poster.jpg"
            style={{ objectFit: 'contain' }}
            ref={(image) => {
              if (image)
                Object.defineProperties(image, {
                  naturalWidth: { value: width },
                  naturalHeight: { value: height },
                })
            }}
          />
        </div>
      </div>,
    )
    await waitFor(() => expect(gpu.effect).toHaveBeenCalled())
    const initial = gpu.effect.mock.calls[0][2].set.params
    expect(initial.cardHalf[0]).toBeCloseTo(halfX)
    expect(initial.cardHalf[1]).toBeCloseTo(halfY)
    expect(initial.cardCenter).toEqual([0.5, 0.425])
    await act(async () => gpu.tick?.())
  })

  it('invalidates object-fit on artwork load but not on every transition frame', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.tagName === 'CANVAS'
        ? new DOMRect(0, 0, 800, 800)
        : new DOMRect(240, 100, 320, 480)
    })
    const style = vi.spyOn(globalThis, 'getComputedStyle')
    render(
      <div>
        <StageFlare />
        <div data-fx="frame">
          <img
            alt="공연"
            src="poster.jpg"
            style={{ objectFit: 'contain' }}
            ref={(image) => {
              if (image)
                Object.defineProperties(image, {
                  naturalWidth: { value: 1080 },
                  naturalHeight: { value: 1440 },
                })
            }}
          />
        </div>
      </div>,
    )
    await waitFor(() => expect(gpu.effect).toHaveBeenCalled())
    const image = screen.getByRole('img', { name: '공연' })
    style.mockClear()

    image.style.objectFit = 'cover'
    fireEvent.load(image)
    await act(async () => {
      gpu.tick?.()
      gpu.tick?.()
    })

    expect(style.mock.calls.filter(([element]) => element === image)).toHaveLength(1)
    const latestCard = gpu.set.mock.calls
      .map(([value]) => value.params)
      .filter((params) => params.cardHalf)
      .at(-1)
    expect(latestCard.cardHalf).toEqual([0.2, 0.3])
  })

  it('invalidates cached object-fit when a responsive layout changes', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.tagName === 'CANVAS'
        ? new DOMRect(0, 0, 800, 800)
        : new DOMRect(240, 100, 320, 480)
    })
    const style = vi.spyOn(globalThis, 'getComputedStyle')
    render(
      <div>
        <StageFlare />
        <div data-fx="frame">
          <img
            alt="공연"
            src="poster.jpg"
            style={{ objectFit: 'contain' }}
            ref={(image) => {
              if (image)
                Object.defineProperties(image, {
                  naturalWidth: { value: 1080 },
                  naturalHeight: { value: 1440 },
                })
            }}
          />
        </div>
      </div>,
    )
    await waitFor(() => expect(gpu.effect).toHaveBeenCalled())
    const image = screen.getByRole('img', { name: '공연' })
    style.mockClear()

    image.style.objectFit = 'cover'
    fireEvent(window, new Event('resize'))
    await act(async () => gpu.tick?.())

    expect(style.mock.calls.filter(([element]) => element === image)).toHaveLength(1)
    const latestCard = gpu.set.mock.calls
      .map(([value]) => value.params)
      .filter((params) => params.cardHalf)
      .at(-1)
    expect(latestCard.cardHalf).toEqual([0.2, 0.3])
  })
})
