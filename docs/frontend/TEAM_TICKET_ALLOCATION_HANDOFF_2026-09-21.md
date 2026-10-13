# 팀별 티켓 수량 배분 연동 요청

## 사용자 요구

관객이 티켓을 여러 장 구매할 때 주문 전체를 한 팀에 귀속하지 않고, 한 주문 안에서 팀별로 수량을 나눌 수 있어야 한다.

예: 일반 티켓 3장 구매 → 블루노트 1장, 노이즈캔슬 2장.

프론트는 총 티켓 수와 팀별 배분 수량의 합이 같을 때만 주문 확인을 허용한다. 현재 화면까지 구현됐지만 운영 API는 `chosenTeamId` 한 개만 받아 다중 팀 배분 결제는 차단한다.

## 현재 구조에서 막히는 지점

- `POST /api/v1/orders` 요청은 `chosenTeamId` 하나만 받는다.
- `ticket_order.selected_team_id`가 주문 하나에 팀 하나만 저장한다.
- 결제 calldata는 `purchase(showId, orderRef, teamIndex, amount, quantity)`라 전체 수량을 한 `teamIndex`에 더한다.
- `Purchased`·`Refunded` receipt 검증도 단일 `teamIndex`와 전체 `quantity`를 대조한다.
- 개별 티켓 환불이 있으므로 발급된 각 티켓이 어느 팀 배분에 속하는지도 식별할 수 있어야 한다.

## 요청 API 초안

```json
{
  "performanceId": 12,
  "items": [
    { "ticketTypeId": 101, "quantity": 3 }
  ],
  "teamAllocations": [
    { "teamId": 7, "quantity": 1 },
    { "teamId": 11, "quantity": 2 }
  ],
  "totalAmount": 60000
}
```

응답의 주문 생성·상세에도 다음 값을 내려주면 된다.

```json
{
  "teamAllocations": [
    { "teamId": 7, "teamName": "블루노트", "teamIndex": 0, "quantity": 1 },
    { "teamId": 11, "teamName": "노이즈캔슬", "teamIndex": 1, "quantity": 2 }
  ]
}
```

마이그레이션 기간에는 기존 `chosenTeamId` 요청을 `teamAllocations: [{ teamId: chosenTeamId, quantity: totalQuantity }]`로 변환해 호환할 수 있다. 새 요청에서 두 필드를 동시에 받지는 않는 편이 안전하다.

## 서버 검증 조건

1. `teamAllocations`는 비어 있지 않아야 한다.
2. 모든 `quantity`는 1 이상의 정수여야 한다.
3. 같은 `teamId`가 중복되면 안 된다.
4. 모든 팀은 해당 공연의 수락된 참여팀이어야 한다.
5. `sum(teamAllocations.quantity) == sum(items.quantity)`여야 한다.
6. 기존 공연 단위 구매 상한 4장은 그대로 적용한다.
7. 총 금액은 지금처럼 서버가 티켓 항목 기준으로 재계산한다.
8. 멱등키는 전체 `teamAllocations`를 포함한 요청 본문과 결속해야 한다.

권장 오류 코드는 `TICKET_TEAM_ALLOCATION_REQUIRED`, `TICKET_TEAM_ALLOCATION_INVALID`, `TICKET_TEAM_ALLOCATION_QUANTITY_MISMATCH`다. 기존 공통 검증 오류로 합치면 프론트에서 정확한 사유를 안내하기 어렵다.

## 저장·환불 고려사항

- 주문-팀 배분 테이블을 별도로 둔다. 예: `ticket_order_team_allocation(order_id, team_id, team_index, quantity)`.
- 개별 티켓 취소 시 어떤 팀 카운터를 차감할지 알아야 하므로 발급 티켓에도 `allocated_team_id` 또는 allocation FK가 필요하다.
- 발급 시 팀별 수량만큼 티켓을 결정적으로 매핑해야 한다. 재시도해도 같은 티켓-팀 관계가 만들어져야 한다.
- 공연 전체 취소는 주문의 모든 팀 배분 카운터를 정확히 한 번씩 되돌려야 한다.

## 컨트랙트·결제 고려사항

현재 `purchase` ABI로는 한 트랜잭션에서 여러 팀 카운터를 올릴 수 없다. 주문을 여러 개로 쪼개는 방식은 결제·재고·환불·멱등성 의미를 바꾸므로 사용하지 않는다.

권장 방향은 한 주문·한 결제를 유지하면서 배열을 받는 새 함수 또는 V2 함수를 두는 것이다.

```solidity
purchaseV2(
  uint256 showId,
  bytes32 orderRef,
  uint8[] teamIndexes,
  uint16[] quantities,
  uint256 amount
)
```

- 배열 길이는 같고 1~4 범위여야 한다.
- 팀 인덱스는 유효하고 중복되면 안 된다.
- 수량 합은 1~4여야 한다.
- 팀별 `choiceCount`를 각각 증가시킨다.
- 환불 시 최초 유효 환불에서 모든 팀별 수량을 각각 차감해야 한다.
- receipt는 주문 총액·총수량뿐 아니라 팀별 배분 전체를 서버 상태와 대조해야 한다.

## 완료 기준

- `1+2`, `2+1`, `1+1+1`, 단일 팀 전량 배분이 모두 주문·결제·발급된다.
- 합계 부족·초과, 중복 팀, 비참여 팀 요청은 명확한 코드로 거절된다.
- 같은 멱등키 재시도에서 주문·재고·카운터가 중복되지 않는다.
- 개별 티켓 환불과 공연 전체 취소 뒤 팀별 DB 집계와 온체인 카운터가 일치한다.
- 주문 생성·상세, 결제 준비·확정, 정산·검증 API와 OpenAPI 생성 타입까지 함께 갱신된다.
