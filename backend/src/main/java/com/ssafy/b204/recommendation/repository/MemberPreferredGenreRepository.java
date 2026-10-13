package com.ssafy.b204.recommendation.repository;

import com.ssafy.b204.recommendation.entity.MemberPreferredGenre;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/** 회원 선호 장르 — API-member-05·06과 API-recommendation-01이 읽는다. */
public interface MemberPreferredGenreRepository
        extends JpaRepository<MemberPreferredGenre, MemberPreferredGenre.Key> {

    List<MemberPreferredGenre> findByMemberId(Long memberId);

    /** API-member-06은 <b>전체 교체</b>다 — 부분 갱신이 없어 지우고 다시 넣는다. */
    void deleteByMemberId(Long memberId);
}
