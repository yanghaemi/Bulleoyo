CREATE TABLE performance_media (
    performance_id              BIGINT PRIMARY KEY,
    poster_content_type         VARCHAR(32),
    poster_data                 LONGBLOB,
    ticket_artwork_content_type VARCHAR(32),
    ticket_artwork_data         LONGBLOB,
    created_at                  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at                  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_performance_media_performance
        FOREIGN KEY (performance_id) REFERENCES performance (performance_id) ON DELETE CASCADE
);
