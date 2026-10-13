package com.ssafy.b204.coin;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ssafy.b204.common.security.JwtTokenProvider;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.member.repository.MemberRepository;
import com.ssafy.b204.support.Bearer;
import com.ssafy.b204.support.IntegrationTestBase;
import com.ssafy.b204.support.LiveApiSpecRecorder;
import com.ssafy.b204.wallet.entity.Wallet;
import com.ssafy.b204.wallet.repository.WalletRepository;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/**
 * API-coin-07·08 을 <b>HTTP 로 한 번 친다</b>.
 *
 * <p>{@code CoinApiIntegrationTest} 는 {@code CoinGrantService} 를 직접 불러 <b>JSON 직렬화를 한 번도
 * 거치지 않는다</b>. 그래서 전역 {@code non_null} 이 {@code GrantCoinResponse} 의 어떤 키를 지우는지
 * 관측된 적이 없었다 — 명세의 {@code required} 를 확인할 근거가 없다는 뜻이다.
 *
 * <p>기능 재검증이 아니다. 목적은 <b>응답 JSON 을 실물로 보는 것</b>이고, 명세 대조는
 * {@link LiveApiSpecRecorder} 가 모든 MockMvc 응답에 자동으로 건다. 여기서는 최단 경로만 만든다.
 *
 * <p>클래스에 {@code @Transactional} 을 걸지 않는다 — 지급은 멱등키 선점(Redis)과 chain_job 커밋을
 * 함께 쓰고, 테스트 트랜잭션에 묶으면 그 경계가 실제와 달라진다.
 */
@AutoConfigureMockMvc
class CoinGrantHttpTest extends IntegrationTestBase {

    @Autowired MockMvc mvc;
    @Autowired JwtTokenProvider tokens;
    @Autowired MemberRepository memberRepository;
    @Autowired WalletRepository walletRepository;

    @Test
    @DisplayName("지급(202)과 지급 이력(200)을 HTTP 로 관측한다")
    void grantAndHistoryOverHttp() throws Exception {
        Member admin = memberRepository.save(member("admin", true));
        Member target = memberRepository.save(member("target", false));
        walletRepository.save(Wallet.builder()
                .member(target)
                .provider(Wallet.Provider.WEB3AUTH)
                .address(randomAddress())
                .status(Wallet.Status.LINKED)
                .build());

        RequestPostProcessor as = Bearer.of(tokens, admin);

        // coin_07 — 202. 온체인 확정 없이 나오는 접수 응답이다.
        mvc.perform(put("/api/v1/admin/coin/grants").with(as)
                        .header("Idempotency-Key", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"memberId\":" + target.getMemberId()
                                + ",\"amount\":200000,\"memo\":\"demo\"}"))
                .andExpect(status().isAccepted());

        // coin_08 — M-03 지급 이력 화면이 통째로 이 응답 하나로 그려진다.
        mvc.perform(get("/api/v1/admin/coin/grants").with(as)
                        .param("source", "ADMIN")
                        .param("memberId", String.valueOf(target.getMemberId())))
                .andExpect(status().isOk());
    }

    private static Member member(String prefix, boolean admin) {
        return Member.builder()
                .email(prefix + "-" + UUID.randomUUID() + "@b204.test")
                .name(prefix)
                .authProvider(Member.AuthProvider.GOOGLE)
                .providerUserId(UUID.randomUUID().toString())
                .countryCode("KR")
                .admin(admin)
                .build();
    }

    /** 지갑 주소는 UNIQUE라 테스트마다 다른 값을 쓴다. */
    private static String randomAddress() {
        return "0x" + UUID.randomUUID().toString().replace("-", "")
                + UUID.randomUUID().toString().replace("-", "").substring(0, 8);
    }
}
