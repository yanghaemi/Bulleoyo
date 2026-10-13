import i18n, { normalizeLanguage } from '@/shared/i18n'

/** Non-React validators and error messages resolve the active locale when invoked. */
export function studioText(ko: string, en: string): string {
  return normalizeLanguage(i18n.resolvedLanguage ?? i18n.language) === 'ko' ? ko : en
}
