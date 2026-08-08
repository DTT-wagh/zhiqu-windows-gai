package com.zhiqu.server.singleplayer;

import java.util.HashSet;
import java.util.Set;
import tools.jackson.databind.JsonNode;

interface SinglePlayerGameGenerator {
    String gameCode();

    void ensureConfigured();

    GeneratedGame generate(GenerationRequest request);

    default Evaluation evaluate(JsonNode publicRound, JsonNode answer, JsonNode action) {
        Set<String> selected = values(action.path("selectedIds"));
        Set<String> accepted = values(answer.path("acceptedOptionIds"));
        Set<String> requiredAny = values(answer.path("requiredAnyOptionIds"));
        String mode = answer.path("mode").asText("EXACT");
        boolean primary = switch (mode) {
            case "ANY" -> !selected.stream().filter(accepted::contains).toList().isEmpty();
            case "CONTAINS" -> selected.containsAll(accepted);
            default -> selected.equals(accepted);
        };
        boolean evidence = requiredAny.isEmpty() || selected.stream().anyMatch(requiredAny::contains);
        boolean correct = primary && evidence;
        return new Evaluation(
                correct,
                correct ? "" : answer.path("hint").asText(""),
                correct ? answer.path("feedback").asText("") : "",
                answer.path("comparison"),
                answer.path("ability")
        );
    }

    private static Set<String> values(JsonNode node) {
        Set<String> values = new HashSet<>();
        if (node != null && node.isArray()) {
            node.forEach(item -> {
                String value = item.asText("").trim();
                if (!value.isEmpty()) values.add(value);
            });
        }
        return values;
    }

    record GenerationRequest(String instanceId, int levelNo, String ageBand, String learningGoal, String seed) {
    }

    record GeneratedGame(JsonNode publicContent, JsonNode answerSpec, String modelName) {
    }

    record Evaluation(boolean correct, String hint, String feedback, JsonNode comparison, JsonNode ability) {
    }
}
