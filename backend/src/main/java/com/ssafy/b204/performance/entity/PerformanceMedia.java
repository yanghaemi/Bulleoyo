package com.ssafy.b204.performance.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Lob;
import jakarta.persistence.MapsId;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "performance_media")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PerformanceMedia {

    @Id
    @Column(name = "performance_id")
    private Long performanceId;

    @MapsId
    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "performance_id")
    private Performance performance;

    @Column(name = "poster_content_type", length = 32)
    private String posterContentType;

    @Lob
    @Column(name = "poster_data", columnDefinition = "LONGBLOB")
    private byte[] posterData;

    @Column(name = "ticket_artwork_content_type", length = 32)
    private String ticketArtworkContentType;

    @Lob
    @Column(name = "ticket_artwork_data", columnDefinition = "LONGBLOB")
    private byte[] ticketArtworkData;

    public PerformanceMedia(Performance performance) {
        this.performance = performance;
    }

    public void replacePoster(String contentType, byte[] data) {
        this.posterContentType = contentType;
        this.posterData = data;
    }

    public void replaceTicketArtwork(String contentType, byte[] data) {
        this.ticketArtworkContentType = contentType;
        this.ticketArtworkData = data;
    }
}
