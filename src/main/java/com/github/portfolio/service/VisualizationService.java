package com.github.portfolio.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.ExchangeStrategies;
import reactor.core.publisher.Mono;

import java.time.Duration;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class VisualizationService {

    private final WebClient githubWebClient;
    private final WebClient geminiWebClient;
    private final String geminiApiKey;

    public VisualizationService(
            WebClient githubWebClient,
            @Value("${gemini.api.key:}") String geminiApiKey,
            @Value("${gemini.api.url}") String geminiApiUrl) {
        
        this.githubWebClient = githubWebClient;
        this.geminiApiKey = geminiApiKey;

        ExchangeStrategies strategies = ExchangeStrategies.builder()
                .codecs(configurer -> configurer.defaultCodecs().maxInMemorySize(10 * 1024 * 1024))
                .build();

        this.geminiWebClient = WebClient.builder()
                .baseUrl(geminiApiUrl)
                .defaultHeader("Content-Type", "application/json")
                .exchangeStrategies(strategies)
                .build();
    }

    public Mono<String> generateVisualization(String owner, String repo) {
        if (geminiApiKey == null || geminiApiKey.trim().isEmpty() || geminiApiKey.equals("PLACEHOLDER_API_KEY")) {
            return Mono.error(new IllegalStateException("Gemini API Key is not configured correctly on the server."));
        }

        // 1. Fetch File Tree
        return fetchRepoTree(owner, repo)
                .flatMap(treeFiles -> {
                    if (treeFiles.isEmpty()) {
                        return Mono.error(new RuntimeException("No suitable files found for analysis in repository."));
                    }
                    // 2. Format to context and call Gemini
                    return callGemini(repo, treeFiles);
                });
    }

    private Mono<List<String>> fetchRepoTree(String owner, String repo) {
        // Try 'main' then 'master' gracefully using flatMap logic, but for simplicity we'll try main, then fallback to master.
        return fetchTreeForBranch(owner, repo, "main")
                .onErrorResume(e -> fetchTreeForBranch(owner, repo, "master"));
    }

    private Mono<List<String>> fetchTreeForBranch(String owner, String repo, String branch) {
        return githubWebClient.get()
                .uri("/repos/{owner}/{repo}/git/trees/{branch}?recursive=1", owner, repo, branch)
                .retrieve()
                .bodyToMono(Map.class)
                .map(response -> {
                    List<Map<String, Object>> tree = (List<Map<String, Object>>) response.get("tree");
                    if (tree == null) {
                        System.out.println("[Visualizer] Tree response was null for " + owner + "/" + repo + " branch: " + branch);
                        return List.<String>of();
                    }
                    System.out.println("[Visualizer] Tree has " + tree.size() + " items for " + owner + "/" + repo + " branch: " + branch);

                    java.util.Set<String> validExtensions = java.util.Set.of(
                        ".js", ".jsx", ".ts", ".tsx", ".py", ".go", ".rs", ".java",
                        ".c", ".cpp", ".h", ".hpp", ".cs", ".php", ".rb", ".swift",
                        ".kt", ".dart", ".json", ".yaml", ".yml", ".toml", ".xml",
                        ".html", ".css"
                    );

                    List<String> result = tree.stream()
                            .filter(item -> "blob".equals(item.get("type")))
                            .map(item -> (String) item.get("path"))
                            .filter(path -> {
                                if (path == null) return false;
                                if (path.contains("node_modules")) return false;
                                if (path.contains("dist/")) return false;
                                if (path.contains("build/")) return false;
                                if (path.startsWith(".")) return false;
                                int dotIndex = path.lastIndexOf('.');
                                if (dotIndex < 0) return false;
                                String ext = path.substring(dotIndex).toLowerCase();
                                return validExtensions.contains(ext);
                            })
                            .limit(150)
                            .collect(Collectors.toList());

                    System.out.println("[Visualizer] Filtered to " + result.size() + " code files");
                    return result;
                });
    }

    private Mono<String> callGemini(String repoName, List<String> files) {
        String limitedTree = String.join(", ", files);
        String prompt = "Create a highly detailed technical logical data flow diagram infographic for GitHub repository : \"" + repoName + "\".\n" +
                "VISUAL STYLE: Neon Cyberpunk. Dark mode cyberpunk. Black background with glowing neon pink, cyan, and violet lines and nodes.\n" +
                "LAYOUT: Distinct Left-to-Right flow. CENTRAL CONTAINER: Group core logic inside a clearly defined central area.\n" +
                "Perspective: Clean 2D flat diagrammatic view straight-on. No 3D effects.\n" +
                "Repository Context: " + limitedTree + "...\n" +
                "Diagram Content Requirements:\n" +
                "1. Title exactly: \"" + repoName + " Data Flow\"\n" +
                "2. Visually map the likely data flow based on the provided file structure.\n" +
                "3. Ensure the \"Input -> Processing -> Output\" structure is clear.";

        Map<String, Object> requestBody = Map.of(
                "contents", List.of(Map.of("parts", List.of(Map.of("text", prompt)))),
                "generationConfig", Map.of("responseModalities", List.of("IMAGE"))
        );

        return geminiWebClient.post()
                .uri(uriBuilder -> uriBuilder.queryParam("key", geminiApiKey).build())
                .bodyValue(requestBody)
                .retrieve()
                .bodyToMono(Map.class)
                .timeout(Duration.ofSeconds(90))
                .map(response -> {
                    try {
                        List<Map<String, Object>> candidates = (List<Map<String, Object>>) response.get("candidates");
                        if (candidates == null || candidates.isEmpty()) {
                            System.err.println("[Visualizer] No candidates in response: " + response);
                            throw new RuntimeException("No candidates returned from Gemini.");
                        }

                        Map<String, Object> content = (Map<String, Object>) candidates.get(0).get("content");
                        if (content == null) {
                            System.err.println("[Visualizer] Candidate 0 has no content (possible safety block): " + candidates.get(0));
                            throw new RuntimeException("Candidate has no content.");
                        }

                        List<Map<String, Object>> parts = (List<Map<String, Object>>) content.get("parts");
                        if (parts == null) {
                            System.err.println("[Visualizer] Content has no parts.");
                            throw new RuntimeException("Content has no parts.");
                        }

                        for (Map<String, Object> part : parts) {
                            Map<String, Object> inlineData = (Map<String, Object>) part.get("inlineData");
                            if (inlineData != null && inlineData.get("data") != null) {
                                return (String) inlineData.get("data");
                            }
                        }

                        System.err.println("[Visualizer] No inlineData found in parts: " + parts);
                        throw new RuntimeException("No inlineData image found in Gemini response.");

                    } catch (Exception e) {
                        System.err.println("[Visualizer] Parse Exception: " + e.getMessage());
                        if (!(e instanceof RuntimeException)) {
                            System.err.println("[Visualizer] Full response object: " + response);
                        }
                        throw new RuntimeException("Failed to parse image from Gemini response: " + e.getMessage(), e);
                    }
                });
    }
}
