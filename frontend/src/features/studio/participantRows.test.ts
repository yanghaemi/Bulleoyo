import { buildParticipantRows, buildParticipantRowsFromList } from './participantRows'

it('주최자 행 뒤에 있는 내 팀의 초대를 모두 표시한다', () => {
  const rows = buildParticipantRows(
    [{ teamId: 1, teamName: '주최', host: true }],
    [
      { teamId: 1, host: true, participationStatus: 'ACCEPTED' },
      { teamId: 2, host: false, participationStatus: 'INVITED' },
      { teamId: 3, host: false, participationStatus: 'INVITED' },
    ],
    [
      { teamId: 1, teamName: '주최' },
      { teamId: 2, teamName: '밴드2' },
      { teamId: 3, teamName: '밴드3' },
    ],
  )
  expect(rows.map((row) => row.teamId)).toEqual([1, 2, 3])
  expect(rows.every((row) => row.myTeam)).toBe(true)
  expect(rows[1].leaderWalletLinked).toBeUndefined()
})

it('수락된 팀은 중복하지 않고 소유가 확인되지 않은 초대를 지어내지 않는다', () => {
  expect(
    buildParticipantRows(
      [{ teamId: 2, teamName: '밴드2', host: false }],
      [
        { teamId: 2, host: false, participationStatus: 'INVITED' },
        { teamId: 99, host: false, participationStatus: 'INVITED' },
      ],
      [{ teamId: 2, teamName: '밴드2' }],
    ),
  ).toEqual([
    {
      teamId: 2,
      teamName: '밴드2',
      host: false,
      participationStatus: 'ACCEPTED',
      leaderWalletLinked: true,
      myTeam: true,
    },
  ])
})

it('참여팀 조회(performance_19)는 INVITED 팀과 초대·수락 시각을 그대로 옮긴다', () => {
  const rows = buildParticipantRowsFromList(
    [
      {
        teamId: 1,
        teamName: '주최',
        host: true,
        participationStatus: 'ACCEPTED',
        invitedAt: '2026-09-26T01:00:00Z',
        acceptedAt: '2026-09-26T01:00:00Z',
      },
      {
        teamId: 5,
        teamName: '남의 팀',
        host: false,
        participationStatus: 'INVITED',
        invitedAt: '2026-09-26T02:00:00Z',
      },
    ],
    [{ teamId: 1, host: true, participationStatus: 'ACCEPTED' }],
    [{ teamId: 1, teamName: '주최' }],
  )
  expect(rows).toEqual([
    {
      teamId: 1,
      teamName: '주최',
      host: true,
      participationStatus: 'ACCEPTED',
      leaderWalletLinked: true,
      invitedAt: '2026-09-26T01:00:00Z',
      acceptedAt: '2026-09-26T01:00:00Z',
      myTeam: true,
    },
    {
      teamId: 5,
      teamName: '남의 팀',
      host: false,
      participationStatus: 'INVITED',
      leaderWalletLinked: undefined,
      invitedAt: '2026-09-26T02:00:00Z',
      acceptedAt: undefined,
      myTeam: false,
    },
  ])
})
