package com.ssafy.b204.performance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ssafy.b204.common.error.BusinessException;
import com.ssafy.b204.common.security.MemberPrincipal;
import com.ssafy.b204.member.entity.Member;
import com.ssafy.b204.performance.entity.Performance;
import com.ssafy.b204.performance.entity.PerformanceMedia;
import com.ssafy.b204.performance.repository.PerformanceMediaRepository;
import com.ssafy.b204.performance.service.PerformanceMediaService;
import com.ssafy.b204.performance.service.PerformanceService;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

@ExtendWith(MockitoExtension.class)
class PerformanceMediaServiceTest {

    @Mock private PerformanceService performanceService;
    @Mock private PerformanceMediaRepository repository;

    private PerformanceMediaService service;
    private final MemberPrincipal principal = MemberPrincipal.of(1L, "member@example.com", false);

    @BeforeEach
    void setUp() {
        service = new PerformanceMediaService(performanceService, repository);
    }

    @Test
    void posterUploadPersistsBytesAndConnectsPublicUrl() {
        Member member = mock(Member.class);
        Performance performance = mock(Performance.class);
        when(performance.isModifiable()).thenReturn(true);
        when(performanceService.requireMember(principal)).thenReturn(member);
        when(performanceService.requireOwnedPerformance(7L, member)).thenReturn(performance);
        when(repository.findById(7L)).thenReturn(Optional.empty());
        when(repository.save(any(PerformanceMedia.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var file = new MockMultipartFile("file", "poster.webp", "image/webp", new byte[]{1, 2, 3});
        var saved = service.upload(principal, 7L, "poster", file);

        assertThat(saved.imageUrl()).isEqualTo("/api/v1/performances/7/media/poster");
        verify(performance).edit(null, null, saved.imageUrl(), null, null, null);
        verify(repository).save(any(PerformanceMedia.class));
    }

    @Test
    void invalidOrOversizedFilesAreRejectedBeforePersistence() {
        Member member = mock(Member.class);
        Performance performance = mock(Performance.class);
        when(performance.isModifiable()).thenReturn(true);
        when(performanceService.requireMember(principal)).thenReturn(member);
        when(performanceService.requireOwnedPerformance(7L, member)).thenReturn(performance);
        var file = new MockMultipartFile("file", "poster.svg", "image/svg+xml", "<svg/>".getBytes());

        assertThatThrownBy(() -> service.upload(principal, 7L, "poster", file))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void ticketArtworkCanBeReadAfterItWasSaved() {
        Performance performance = mock(Performance.class);
        PerformanceMedia media = new PerformanceMedia(performance);
        media.replaceTicketArtwork("image/png", new byte[]{9, 8, 7});
        when(repository.findById(7L)).thenReturn(Optional.of(media));

        var result = service.read(7L, "ticket-artwork");

        assertThat(result.contentType()).isEqualTo("image/png");
        assertThat(result.data()).containsExactly(9, 8, 7);
    }
}
