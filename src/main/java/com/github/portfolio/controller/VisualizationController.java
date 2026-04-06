package com.github.portfolio.controller;

import com.github.portfolio.service.VisualizationService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import reactor.core.publisher.Mono;

import java.util.Map;

@RestController
@RequestMapping("/api/visualize")
public class VisualizationController {

    private final VisualizationService visualizationService;

    public VisualizationController(VisualizationService visualizationService) {
        this.visualizationService = visualizationService;
    }

    @GetMapping("/{owner}/{repo}")
    public Mono<ResponseEntity<Object>> generateVisualization(@PathVariable String owner, @PathVariable String repo) {
        return visualizationService.generateVisualization(owner, repo)
                .<ResponseEntity<Object>>map(base64Image -> ResponseEntity.ok(Map.of("image", base64Image)))
                .onErrorResume(e -> {
                    if (e instanceof WebClientResponseException wcre) {
                        return Mono.just(ResponseEntity.status(wcre.getStatusCode())
                                .body(Map.of("error", wcre.getMessage(), "details", wcre.getResponseBodyAsString())));
                    }
                    return Mono.just(ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                            .body(Map.of("error", e.getMessage())));
                });
    }
}
