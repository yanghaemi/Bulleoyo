package com.ssafy.b204;

import static org.assertj.core.api.Assertions.assertThat;

import com.ssafy.b204.support.IntegrationTestBase;
import javax.sql.DataSource;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Flyway 마이그레이션이 ERD v5를 그대로 만드는지 확인한다.
 *
 * <p>ERD와 실제 스키마가 어긋나면 나머지 도메인 구현이 전부 잘못된 전제에서 시작한다. 그래서
 * <b>개수·정밀도·문자셋까지</b> 검사한다 — "돌아가긴 한다"로는 부족하다.
 *
 * <p>{@code flyway-mysql}이 빠지면 여기서 {@code Unsupported Database: MySQL 8.0}으로 죽는다
 * (b204-stack 함정 1번).
 */
class FlywayMigrationTest extends IntegrationTestBase {

    /**
     * ERD v5 19개 + 공연 미디어 확장 1개(V8 {@code performance_media}) + 업로드 이미지 1개
     * (V12 {@code file}) + ERD v6 추천 도메인 2개(V13 — {@code member_preferred_genre}·
     * {@code recommendation_log}) + 패스키 1개(V14 {@code webauthn_credential}, ERD v6.1) = 24.
     * Flyway 이력 테이블({@code flyway_schema_history})은 세지 않는다.
     */
    private static final int ERD_TABLE_COUNT = 24;

    /**
     * ERD v5 43개 + {@code performance_media → performance} 1개(V8)
     * + {@code ticket_order.order_group_id} 자기참조 1개(V10)
     * + {@code fk_file_member}(업로더 회원, RESTRICT) 1개(V12)
     * + {@code fk_webauthn_credential_member}(패스키 회원, RESTRICT) 1개(V14).
     *
     * <p>브랜치마다 각자 1씩 올리면 병합이 값을 조용히 맞춰 버린다 — 더한 근거를 한 줄씩
     * 남겨 두는 이유다.
     *
     * <p>V13 이 3개를 더한다 — {@code member_preferred_genre → member},
     * {@code recommendation_log → member}, {@code recommendation_log → performance}. 46 + 3(V13) + 1(V14) = 50.
     */
    private static final int ERD_FK_COUNT = 50;

    /**
     * ERD v5 = 상태 컬럼 23개가 ENUM. 23 → 25: V12 {@code file.purpose}·{@code file.status}.
     * 25 → 26: V13 {@code recommendation_log.basis}.
     */
    private static final int ERD_ENUM_COLUMN_COUNT = 26;

    private JdbcTemplate jdbc;

    @Autowired
    void setDataSource(DataSource dataSource) {
        this.jdbc = new JdbcTemplate(dataSource);
    }

    @Test
    @DisplayName("Flyway가 ERD v6·공연 미디어·업로드 이미지·패스키 확장의 24 테이블을 만든다")
    void createsAllTables() {
        Integer count = jdbc.queryForObject("""
                select count(*) from information_schema.tables
                 where table_schema = database() and table_name <> 'flyway_schema_history'
                """, Integer.class);

        assertThat(count).isEqualTo(ERD_TABLE_COUNT);
    }

    @Test
    @DisplayName("예약어를 피한 테이블명을 쓴다 — performance·ticket_order (show·order 아님)")
    void avoidsReservedWordTableNames() {
        assertThat(tableExists("performance")).isTrue();
        assertThat(tableExists("ticket_order")).isTrue();
        assertThat(tableExists("show")).isFalse();
        assertThat(tableExists("order")).isFalse();
    }

    @Test
    @DisplayName("v6에서 삭제된 transfer 테이블이 없다 — 양도는 설계에서 제외됐다")
    void hasNoTransferTable() {
        assertThat(tableExists("transfer")).isFalse();
    }

    @Test
    @DisplayName("Redis로 옮긴 상태는 테이블로 만들지 않는다 — refresh_token·wallet_challenge·coin_job")
    void hasNoTablesForRedisOnlyState() {
        assertThat(tableExists("refresh_token")).isFalse();
        assertThat(tableExists("wallet_challenge")).isFalse();
        assertThat(tableExists("coin_job")).isFalse();
        assertThat(tableExists("wallet_tx")).isFalse();
    }

    @Test
    @DisplayName("wallet 에 개인키·잔액 사본 컬럼이 없다 — 비수탁이고 잔액은 Redis에 둔다")
    void walletHasNoKeyOrBalanceColumns() {
        assertThat(columnExists("wallet", "encrypted_private_key")).isFalse();
        assertThat(columnExists("wallet", "cached_krws_balance")).isFalse();
        assertThat(columnExists("wallet", "last_balance_check_at")).isFalse();
    }

    @Test
    @DisplayName("FK 49개가 전부 걸려 있다")
    void createsAllForeignKeys() {
        Integer count = jdbc.queryForObject("""
                select count(*) from information_schema.referential_constraints
                 where constraint_schema = database()
                """, Integer.class);

        assertThat(count).isEqualTo(ERD_FK_COUNT);
    }

    @Test
    @DisplayName("상태 컬럼 26개가 MySQL ENUM 이다")
    void statusColumnsAreEnum() {
        Integer count = jdbc.queryForObject("""
                select count(*) from information_schema.columns
                 where table_schema = database() and data_type = 'enum'
                """, Integer.class);

        assertThat(count).isEqualTo(ERD_ENUM_COLUMN_COUNT);
    }

    @Test
    @DisplayName("V2·V3 가 chain_job.tx_type 을 15종으로 늘린다 — CREATE_SHOW·START_SALE·UPDATE_RULES")
    void chainJobTxTypeHasFifteenValues() {
        String columnType = jdbc.queryForObject("""
                select column_type from information_schema.columns
                 where table_schema = database()
                   and table_name = 'chain_job' and column_name = 'tx_type'
                """, String.class);

        assertThat(columnType).contains("'CREATE_SHOW'", "'START_SALE'", "'UPDATE_RULES'");
        // 값을 뒤에 붙였는가 - MySQL 은 ENUM 을 내부 정수로 저장하므로 순서를 바꾸면
        // 기존 행의 뜻이 통째로 바뀐다. V3 가 늘린 UPDATE_RULES 는 맨 뒤여야 한다.
        assertThat(columnType).startsWith("enum('MINT','APPROVE','PURCHASE','REFUND'");
        assertThat(columnType).endsWith("'UPDATE_RULES')");
        assertThat(columnType.split(",").length).isEqualTo(15);
    }

    @Test
    @DisplayName("모든 시각 컬럼이 DATETIME(6) 이다 — ERD Cloud가 표현하지 못한 정밀도를 부여했다")
    void allDatetimeColumnsHaveMicrosecondPrecision() {
        Integer wrong = jdbc.queryForObject("""
                select count(*) from information_schema.columns
                 where table_schema = database()
                   and data_type = 'datetime' and column_type <> 'datetime(6)'
                """, Integer.class);

        assertThat(wrong).isZero();
    }

    @Test
    @DisplayName("updated_at 7개에 ON UPDATE CURRENT_TIMESTAMP 가 걸려 있다 — V14 webauthn_credential 포함")
    void updatedAtColumnsAutoUpdate() {
        Integer count = jdbc.queryForObject("""
                select count(*) from information_schema.columns
                 where table_schema = database()
                   and column_name = 'updated_at' and extra like '%on update%'
                """, Integer.class);

        assertThat(count).isEqualTo(7);
    }

    @Test
    @DisplayName("모든 테이블이 utf8mb4_0900_ai_ci 다")
    void allTablesUseExpectedCollation() {
        Integer wrong = jdbc.queryForObject("""
                select count(*) from information_schema.tables
                 where table_schema = database()
                   and table_name <> 'flyway_schema_history'
                   and table_collation <> 'utf8mb4_0900_ai_ci'
                """, Integer.class);

        assertThat(wrong).isZero();
    }

    @Test
    @DisplayName("PK 이름이 {테이블명}_id 규칙을 따른다 — 컨벤션 §4")
    void primaryKeyNamesFollowConvention() {
        // 제네릭 BaseEntity 의 id 컬럼이 실수로 생기지 않았는지 확인한다.
        Integer genericIdColumns = jdbc.queryForObject("""
                select count(*) from information_schema.columns
                 where table_schema = database() and column_name = 'id'
                """, Integer.class);

        assertThat(genericIdColumns).isZero();
    }

    @Test
    @DisplayName("금액 컬럼은 BIGINT 다 — DOUBLE 을 쓰지 않는다")
    void amountColumnsAreBigint() {
        Integer doubles = jdbc.queryForObject("""
                select count(*) from information_schema.columns
                 where table_schema = database() and data_type in ('double', 'float')
                """, Integer.class);

        assertThat(doubles).isZero();
    }

    private boolean tableExists(String table) {
        Integer count = jdbc.queryForObject("""
                select count(*) from information_schema.tables
                 where table_schema = database() and table_name = ?
                """, Integer.class, table);
        return count != null && count > 0;
    }

    private boolean columnExists(String table, String column) {
        Integer count = jdbc.queryForObject("""
                select count(*) from information_schema.columns
                 where table_schema = database() and table_name = ? and column_name = ?
                """, Integer.class, table, column);
        return count != null && count > 0;
    }
}
