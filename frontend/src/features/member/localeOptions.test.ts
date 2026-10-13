import type { SupportedLanguage } from '@/shared/i18n'

import { countryNativeName, countryOptions } from './localeOptions'

describe('countryOptions', () => {
  const option = (code: string, locale: SupportedLanguage) =>
    countryOptions(locale).find((entry) => entry.value === code)

  it('uses native country names while secondary text follows the UI language', () => {
    expect(option('KR', 'en')).toEqual({ value: 'KR', label: '대한민국', sub: 'South Korea · KR' })
    expect(option('JP', 'ko')!.label).toBe('日本')
    expect(option('DE', 'ko')!.label).toBe('Deutschland')
    expect(option('US', 'en')!.sub).toBe('US')
  })

  it('keeps the native-name ordering when the UI language changes', () => {
    expect(countryOptions('en').map(({ value }) => value)).toEqual(
      countryOptions('ko').map(({ value }) => value),
    )
  })

  it('does not provide a native name for an unsupported country code', () => {
    expect(countryNativeName('ZZ')).toBeUndefined()
    expect(countryNativeName('toString')).toBeUndefined()
  })
})
