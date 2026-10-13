const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.closest('[hidden], [aria-hidden="true"]'),
  )
}

export function trapFocus(event: KeyboardEvent, container: HTMLElement) {
  if (event.key !== 'Tab') return

  const focusableElements = getFocusableElements(container)
  if (focusableElements.length === 0) {
    event.preventDefault()
    container.focus()
    return
  }

  const firstFocusableElement = focusableElements[0]
  const lastFocusableElement = focusableElements[focusableElements.length - 1]
  const activeElement = document.activeElement

  if (
    event.shiftKey &&
    (activeElement === firstFocusableElement ||
      activeElement === container ||
      !container.contains(activeElement))
  ) {
    event.preventDefault()
    lastFocusableElement.focus()
  } else if (
    !event.shiftKey &&
    (activeElement === lastFocusableElement || !container.contains(activeElement))
  ) {
    event.preventDefault()
    firstFocusableElement.focus()
  }
}

export function restoreFocusIfSafe(
  previouslyFocusedElement: HTMLElement | null,
  container: HTMLElement | null,
) {
  if (!previouslyFocusedElement || !document.contains(previouslyFocusedElement)) return

  const activeElement = document.activeElement
  const focusStayedInModal =
    activeElement === document.body ||
    (activeElement instanceof Node && container?.contains(activeElement))

  if (focusStayedInModal) previouslyFocusedElement.focus()
}
