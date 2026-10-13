import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import { PerformanceReview } from '@/features/studio/PerformanceReview'
import { StudioShell, type StudioTeamRef } from '@/features/studio/StudioShell'
import { PosterEditor } from '@/features/studio/media/PosterEditor'
import { TicketArtworkEditor } from '@/features/studio/media/TicketArtworkEditor'
import {
  performanceMediaUrl,
  uploadPerformanceMedia,
  type PerformanceMediaKind,
} from '@/shared/api/domains/performanceMedia'
import { useLocale } from '@/shared/i18n/useLocale'
import { usePerformanceDetail, useTicketTypes } from '@/shared/queries/performance'
import { useMyTeams } from '@/shared/queries/team'
import { Button, PageSkeleton, formatYoyo, formatKst } from '@/shared/ui'

function parseId(raw: string | undefined) {
  const id = Number.parseInt(raw ?? '', 10)
  return Number.isSafeInteger(id) && id > 0 ? id : undefined
}

function useMediaPage() {
  const { id } = useParams()
  const performanceId = parseId(id)
  const detail = usePerformanceDetail(performanceId ?? 0, { enabled: performanceId != null })
  const ticketTypes = useTicketTypes(performanceId ?? 0, { enabled: performanceId != null })
  const myTeams = useMyTeams()
  const teams: StudioTeamRef[] = useMemo(
    () =>
      (myTeams.data?.items ?? []).flatMap((team) =>
        team.teamId != null && team.teamName
          ? [{ teamId: team.teamId, teamName: team.teamName }]
          : [],
      ),
    [myTeams.data],
  )
  return { performanceId, detail, ticketTypes, teams }
}

function MediaFrame({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  const { detail, teams, performanceId } = useMediaPage()
  if (!performanceId || detail.isError) {
    return (
      <main className="grid min-h-dvh place-items-center px-4" role="alert">
        공연 정보를 불러오지 못했습니다.
      </main>
    )
  }
  if (detail.isPending) return <PageSkeleton variant="detail" />
  return (
    <StudioShell teams={teams} activeTeamId={teams[0]?.teamId} title={title}>
      <div className="w-full max-w-[960px] px-3 py-4 md:px-0 md:py-0">
        {children}
      </div>
    </StudioShell>
  )
}

function EditorPage({ kind }: { kind: PerformanceMediaKind }) {
  const { text, language } = useLocale()
  const navigate = useNavigate()
  const { performanceId, detail } = useMediaPage()
  const [savedUrl, setSavedUrl] = useState<string>()
  const isPoster = kind === 'poster'
  const next = isPoster ? 'artwork' : 'review'
  const upload = async (image: Blob) => {
    if (!performanceId) throw new Error('PERFORMANCE_NOT_FOUND')
    const saved = await uploadPerformanceMedia(performanceId, kind, image)
    setSavedUrl(saved.imageUrl)
    if (isPoster) await detail.refetch()
  }

  return (
    <MediaFrame title={isPoster ? text('공연 포스터', 'Show poster') : text('티켓 꾸미기', 'Decorate ticket')}>
      {isPoster ? (
        <PosterEditor onUpload={upload} />
      ) : (
        <TicketArtworkEditor
          initialTitle={detail.data?.title ?? ''}
          initialDateTime={detail.data?.startAt ? formatKst(detail.data.startAt, undefined, language) : ''}
          initialVenue={detail.data?.venueName ?? ''}
          onUpload={upload}
        />
      )}
      <div className="mt-5 flex flex-wrap justify-between gap-2">
        <Button
          variant="secondary"
          onClick={() => navigate(`/studio/performances/${performanceId}/edit`)}
        >
          {text('공연 정보로', 'Show information')}
        </Button>
        <Button
          disabled={!savedUrl && !(isPoster && detail.data?.posterImageUrl)}
          onClick={() => navigate(`/studio/performances/${performanceId}/${next}`)}
        >
          {text('다음', 'Continue')}
        </Button>
      </div>
    </MediaFrame>
  )
}

export function PerformancePosterPage() {
  return <EditorPage kind="poster" />
}

export function PerformanceArtworkPage() {
  return <EditorPage kind="ticket-artwork" />
}

export function PerformanceReviewPage() {
  const { text, language } = useLocale()
  const navigate = useNavigate()
  const { performanceId, detail, ticketTypes } = useMediaPage()
  const data = detail.data
  if (!performanceId || !data || detail.isPending || ticketTypes.isPending) {
    return <PageSkeleton variant="detail" />
  }
  const joint = data.jointPerformance === true
  return (
    <MediaFrame title={text('등록 전 확인', 'Review show')}>
      <PerformanceReview
        info={{
          title: data.title ?? text('공연', 'Show'),
          startAtLabel: data.startAt ? formatKst(data.startAt, undefined, language) : '—',
          endAtLabel: data.endAt ? formatKst(data.endAt, undefined, language) : undefined,
          venueName: data.venueName ?? '—',
          venueAddress: data.venueAddress,
        }}
        posterImageUrl={data.posterImageUrl}
        ticketArtworkImageUrl={performanceMediaUrl(performanceId, 'ticket-artwork')}
        ticketTypes={(ticketTypes.data?.ticketTypes ?? []).map((ticket, index) => ({
          key: String(ticket.ticketTypeId ?? index),
          name: ticket.name ?? text('티켓', 'Ticket'),
          priceLabel: formatYoyo(ticket.priceAmount ?? 0),
          totalQuantityLabel: text(
            `${ticket.totalQuantity ?? 0}매`,
            `${ticket.totalQuantity ?? 0} tickets`,
          ),
        }))}
        onEditInfo={() => navigate(`/studio/performances/${performanceId}/edit`)}
        onEditPoster={() => navigate(`/studio/performances/${performanceId}/poster`)}
        onEditTicketArtwork={() => navigate(`/studio/performances/${performanceId}/artwork`)}
        onEditTicketTypes={() => navigate(`/studio/performances/${performanceId}/edit`)}
        onContinue={() =>
          navigate(
            joint
              ? `/studio/performances/${performanceId}/edit`
              : `/studio/performances/${performanceId}/rules`,
            joint ? { state: { step: 1 } } : undefined,
          )
        }
      />
    </MediaFrame>
  )
}
