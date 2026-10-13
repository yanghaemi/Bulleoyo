import { useTranslation } from 'react-i18next'
import { normalizeLanguage } from '@/shared/i18n'

/** UI copy follows the explicit language choice; user-entered content stays untouched. */
export function useLocale() {
  const { i18n } = useTranslation()
  const language = normalizeLanguage(i18n.resolvedLanguage ?? i18n.language)
  const text = useCallback((ko: string, en: string) => (language === 'ko' ? ko : en), [language])
  return { language, text }
}
import { useCallback } from 'react'
