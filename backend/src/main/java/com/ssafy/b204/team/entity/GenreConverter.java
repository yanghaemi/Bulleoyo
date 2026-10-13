package com.ssafy.b204.team.entity;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/**
 * {@link Genre} ↔ VARCHAR 매핑.
 *
 * <p>같은 프로젝트의 다른 상태 컬럼은 {@code @Enumerated(EnumType.STRING)}을 쓰지만 장르는
 * 컨버터다. 그쪽은 컬럼이 MySQL ENUM 이라 DB 가 값 집합을 강제하는 반면, 장르 컬럼은
 * VARCHAR(50)/VARCHAR(20)이라(D-R01) 예상 밖 문자열이 들어갈 수 있고,
 * {@code @Enumerated}는 그런 값을 만나면 조회 자체를 예외로 끝낸다. 읽기는 관대해야 한다 —
 * {@link Genre#readOrEtc}를 태우면 목록 한 행 때문에 전체 조회가 죽지 않는다.
 */
@Converter
public class GenreConverter implements AttributeConverter<Genre, String> {

    @Override
    public String convertToDatabaseColumn(Genre attribute) {
        return attribute == null ? null : attribute.name();
    }

    @Override
    public Genre convertToEntityAttribute(String dbData) {
        return dbData == null ? null : Genre.readOrEtc(dbData);
    }
}
