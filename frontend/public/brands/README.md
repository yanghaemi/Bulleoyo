# Social sign-in assets

Used by `SocialLoginButton` as presentation only. Authentication continues through
the existing Web3Auth handler; no Google, Facebook, or Kakao SDK was added.

Official reference pages checked on 2026-09-18:

- Google G artwork and sign-in styling: https://developers.google.com/identity/branding-guidelines
- Facebook logo: https://www.meta.com/brand/resources/facebook/logo/
- Kakao login resources: https://developers.kakao.com/tool/resource/login
- Kakao button recomposition guidelines: https://developers.kakao.com/docs/ko/kakaologin/design-guide
- Google Sans: https://github.com/googlefonts/googlesans

Preserve provider artwork, proportions, and brand colors. These are provider brand
assets, not application-owned logos. Consult each provider's current usage terms
before changing the presentation. Google Sans's SIL Open Font License is included
in `google-sans-OFL.txt`.

All three providers use custom HTML buttons with separate official symbols and
localized text. A shared 20px icon column and 10px gap keep the symbols and text
starts aligned in both languages. They are not SDK-rendered buttons and do not
imply separate provider certification.

## Kakao standalone symbol provenance

`kakao-symbol.png` is an unchanged export of the visible symbol layer from the
official layered source, not a crop of the complete login button:

- Source: https://developers.kakao.com/tool/resource/static/img/button/login/kakao_login_original.psd
- Source SHA-256: `9a0f928796c67432e6bc7ad2075aed65b022193605bb5e3a8f4d037bff449ab4`
- Layer: `영문 / Large and Narrow  (366px X 90px) / Shape 2`
- PSD index path: `[2][2][2]`; original bounds `(592, 754, 630, 791)`.
- Export: `psd-tools` layer `composite()` at its native 38 × 37 pixels, retaining
  its vector mask and original layer opacity (230/255). No redraw, recoloring,
  full-button cropping, or source-layer geometry changes.
- PNG SHA-256: `0cad4aa12249c470c16d232abe4128bcc85aac1823728b767dbb11c8b7742413`

The Kakao guide explicitly allows recomposing the provided PSD for the service
UI while preserving the symbol. The PNG is displayed with `object-fit: contain`
inside the shared icon column. The button retains Kakao yellow and the prescribed
Korean/English labels. The older complete button PNGs remain as unused reference
assets.
