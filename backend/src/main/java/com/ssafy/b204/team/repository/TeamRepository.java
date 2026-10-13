package com.ssafy.b204.team.repository;

import com.ssafy.b204.team.entity.Team;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TeamRepository extends JpaRepository<Team, Long> {

    /** API-team-02 내 팀 목록 — 리더인 팀만. 해산한 팀은 제외한다. */
    List<Team> findByLeader_MemberIdAndStatus(Long memberId, Team.Status status);

    Optional<Team> findByName(String name);

    boolean existsByName(String name);

    /**
     * API-team-06 팀 검색 — 이름 부분 일치(대소문자 무시). 해산 팀은 {@code status}로 거른다.
     *
     * <p>{@code pattern}은 호출부가 {@code %}·{@code _}·{@code !}를 {@code !}로 이스케이프한
     * <b>검색어 원문</b>이다. 와일드카드는 여기서 {@code concat}으로만 붙인다 — 사용자가 친
     * {@code %}가 "전부 일치"로 해석되지 않게 한다. 이스케이프 문자로 역슬래시를 쓰지 않는 이유는
     * MySQL 문자열 리터럴에서 역슬래시가 한 번 더 해석돼 JPQL·SQL 두 층에서 개수가 어긋나기 쉬워서다.
     *
     * <p>{@code LIKE '%x%'}는 앞이 와일드카드라 인덱스를 못 탄다(풀 스캔). 팀 수가 수백 단위인
     * 지금은 문제없고, 늘면 FULLTEXT(ngram)나 접두 일치로 바꾼다.
     */
    @Query("""
            select t from Team t
             where t.status = :status
               and lower(t.name) like concat('%', lower(:pattern), '%') escape '!'
             order by t.name asc, t.teamId asc
            """)
    List<Team> searchByNameContaining(@Param("pattern") String pattern,
                                      @Param("status") Team.Status status,
                                      Pageable pageable);

    /** API-team-06 이름 정확 일치(대소문자 무시) — 부분 일치 상위 N건 밖으로 밀려나지 않게 따로 찾는다. */
    @Query("select t from Team t where t.status = :status and lower(t.name) = lower(:name)")
    List<Team> findByNameIgnoreCaseAndStatus(@Param("name") String name,
                                             @Param("status") Team.Status status);
}
