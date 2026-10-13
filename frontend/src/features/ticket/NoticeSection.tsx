import { useLocale } from '@/shared/i18n/useLocale'

/** API supplies no event-specific admission policy; never invent times or gates. */
export function NoticeSection() {
  const { text } = useLocale()
  const notices = [
    {
      title: text('입장 방법', 'At the entrance'),
      body: text(
        '입장할 때 이 화면의 QR 코드를 보여 주세요. 사용 완료된 티켓으로는 다시 입장할 수 없어요.',
        'Show the QR code on this screen at the entrance. Used tickets cannot be used for entry again.',
      ),
    },
    {
      title: text('공연별 안내', 'Show-specific information'),
      body: text(
        '입장 시간, 반입 및 촬영 규정은 주최 팀과 공연장의 안내를 확인해 주세요.',
        'Check the organizer and venue notices for admission times, prohibited items and recording policies.',
      ),
    },
  ]
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface">
      <h2 className="border-b border-line px-5 py-4 font-sans text-sm font-bold text-ink">
        {text('관람 안내', 'Before the show')}
      </h2>
      <dl className="px-5 py-2">
        {notices.map((notice) => (
          <div key={notice.title} className="border-b border-line py-4 last:border-b-0">
            <dt className="mb-2 font-sans text-xs font-semibold text-ink">{notice.title}</dt>
            <dd className="m-0 font-sans text-xs leading-relaxed text-muted">{notice.body}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
