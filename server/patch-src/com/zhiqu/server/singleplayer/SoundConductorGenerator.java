package com.zhiqu.server.singleplayer;

import com.zhiqu.server.singleplayer.SinglePlayerGameErrors.GenerationFailure;
import com.zhiqu.server.singleplayer.SinglePlayerGameGenerator.GeneratedGame;
import com.zhiqu.server.singleplayer.SinglePlayerGameGenerator.GenerationRequest;
import java.util.Locale;
import java.util.Set;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

@Component
final class SoundConductorGenerator implements SinglePlayerGameGenerator {
    private static final String SYSTEM_PROMPT = """
            你为 6-12 岁儿童实时生成“声音小指挥”结构化无歌词乐段。不得引用现有歌曲、固定旋律、真实姓名或私人信息。
            前端会用 Web Audio API 合成，所以只能返回结构化音符，不返回音频 URL。tempo 50-170，meter 2-6，dynamics 只能 SOFT/MEDIUM/STRONG，instrumentFamily 使用 KEYS/STRINGS/WOODWIND/PERCUSSION，mood 使用适龄非恐怖词。
            只返回 JSON：safety、instruction、demo、恰好三个 rounds、result。safety 必须是 {"status":"SAFE","reason":"适龄且无隐私信息"}。demo 和每轮都含 sequence：{"tempo":整数,"dynamics":"...","instrumentFamily":"...","meter":整数,"mood":"...","notes":[{"midi":48到84,"beats":0.25到4}]}，每段至少 4 个音符。
            demo 只示范一个可测量特征。r1 让儿童选出 AI 测得的速度、力度、音色或节拍；r2 让儿童用可听证据核对感受，情绪可有多个合理答案；r3 只改变 tempo、dynamics、instrumentFamily 或 meter 中一个参数，比较改变前后。
            每轮还含 roundId、title、prompt、options。option 格式 {"id":"...","label":"...","value":"SLOW|MEDIUM|FAST|SOFT|STRONG|KEYS|...","kind":"CHOICE|MOOD|EVIDENCE","evidenceMetric":"TEMPO|DYNAMICS|INSTRUMENT|METER"}。
            answer 格式 {"questionType":"TEMPO|DYNAMICS|INSTRUMENT|METER|MOOD_EVIDENCE|CHANGE","changedMetric":"","hint":"引用本段参数的线索","feedback":"引用本段可观察证据的讲评","comparison":{},"ability":{}}。情绪题必须允许多个感受，只按是否选择速度、力度、音色或节拍证据判断。
            r2 的 MOOD 和 EVIDENCE 必须是分开的选项；r3 的选项必须让儿童判断改变的是 TEMPO、DYNAMICS、INSTRUMENT 还是 METER。
            result 的 evidence、aiCorrect、uncertain、change、discovery 和 limitation 必须根据本局实际参数生成，而且六项都必须是中文字符串，不能使用布尔值。只返回 JSON，不要 Markdown。
            """;

    private final SinglePlayerAiClient client;
    private final GameContentValidator validator;
    private final ObjectMapper objectMapper;

    SoundConductorGenerator(SinglePlayerAiClient client, GameContentValidator validator, ObjectMapper objectMapper) {
        this.client = client;
        this.validator = validator;
        this.objectMapper = objectMapper;
    }

    @Override
    public String gameCode() {
        return "sound-conductor";
    }

    @Override
    public void ensureConfigured() {
        client.requireTextConfiguration();
    }

    @Override
    public GeneratedGame generate(GenerationRequest request) {
        ObjectNode context = objectMapper.createObjectNode();
        context.put("gameCode", gameCode());
        context.put("levelNo", request.levelNo());
        context.put("ageBand", request.ageBand());
        context.put("learningGoal", request.learningGoal());
        context.put("seed", request.seed());
        context.put("locale", "zh-CN");
        JsonNode generated = client.generateJson(SYSTEM_PROMPT, context);
        normalizeSafety(generated);
        if (generated.path("demo").isObject()) ((ObjectNode) generated.path("demo")).remove("answer");
        normalizeSequence(generated.path("demo").path("sequence"));
        JsonNode rounds = generated.path("rounds");
        if (!rounds.isArray() || rounds.size() != 3) throw invalid("ROUNDS_INVALID");
        for (JsonNode round : rounds) normalizeRound(round);
        normalizeSingleSequenceChange(
                rounds.path(1).path("sequence"),
                rounds.path(2).path("sequence"),
                rounds.path(2).path("answer").path("changedMetric"),
                rounds.path(2).path("answer")
        );
        normalizeResult(generated, rounds.path(1).path("sequence"), rounds.path(2).path("sequence"));
        validator.validateSoundSequence(generated.path("demo").path("sequence"));
        for (JsonNode round : generated.path("rounds")) {
            validator.validateSoundSequence(round.path("sequence"));
            deriveAnswer(round);
        }
        return validator.splitAndValidate(gameCode(), generated, client.modelName());
    }

    private void normalizeRound(JsonNode round) {
        if (!round.isObject()) throw invalid("ROUND_INVALID");
        ObjectNode mutable = (ObjectNode) round;
        String questionType = mutable.path("answer").path("questionType").asText("").toUpperCase(Locale.ROOT);
        if (questionType.isBlank()) {
            questionType = switch (mutable.path("roundId").asText("")) {
                case "r1" -> "TEMPO";
                case "r2" -> "MOOD_EVIDENCE";
                case "r3" -> "CHANGE";
                default -> "";
            };
            if (!questionType.isBlank() && mutable.path("answer").isObject()) {
                ((ObjectNode) mutable.path("answer")).put("questionType", questionType);
            }
        }
        normalizeSequence(mutable.path("sequence"));
        normalizeOptions(mutable, questionType);
        if ("MOOD_EVIDENCE".equals(questionType)) ensureEvidenceOptions(mutable);
        if ("CHANGE".equals(questionType)) replaceChangeOptions(mutable);
    }

    private void normalizeSafety(JsonNode generated) {
        if (!generated.isObject()) throw invalid("RESPONSE_INVALID");
        JsonNode safety = generated.path("safety");
        if (!safety.isTextual()) return;
        String text = safety.asText("").trim();
        String upper = text.toUpperCase(Locale.ROOT);
        boolean rejected = upper.contains("REJECT") || upper.contains("BLOCK")
                || text.contains("不安全") || text.contains("危险") || text.contains("不适龄");
        if (rejected || !(upper.equals("SAFE") || text.contains("安全") || text.contains("适龄"))) return;
        ObjectNode normalized = objectMapper.createObjectNode();
        normalized.put("status", "SAFE");
        normalized.put("reason", text);
        ((ObjectNode) generated).set("safety", normalized);
    }

    private void normalizeSequence(JsonNode sequence) {
        if (!sequence.isObject()) throw invalid("SEQUENCE_INVALID");
        ObjectNode mutable = (ObjectNode) sequence;
        mutable.put("tempo", clamp(number(mutable, 90, "tempo", "bpm"), 50, 170));
        mutable.put("meter", clamp(number(mutable, 4, "meter", "beatsPerBar", "timeSignature"), 2, 6));
        mutable.put("dynamics", dynamics(mutable.path("dynamics").asText("MEDIUM")));
        mutable.put("instrumentFamily", instrument(mutable.path("instrumentFamily").asText("KEYS")));

        ArrayNode normalized = objectMapper.createArrayNode();
        JsonNode rawNotes = mutable.path("notes");
        if (rawNotes.isArray()) {
            for (JsonNode raw : rawNotes) {
                if (!raw.isObject()) continue;
                int midi = clamp(number(raw, 60, "midi", "pitch", "note"), 48, 84);
                double beats = number(raw, 1d, "beats", "durationBeats", "duration", "length");
                if (!Double.isFinite(beats)) beats = 1d;
                beats = Math.max(.25d, Math.min(4d, beats));
                ObjectNode note = normalized.addObject();
                note.put("midi", midi);
                note.put("beats", beats);
            }
        }
        if (normalized.isEmpty()) throw invalid("NOTES_INVALID");
        int sourceSize = normalized.size();
        while (normalized.size() < 4) normalized.add(normalized.get((normalized.size() - sourceSize) % sourceSize).deepCopy());
        while (normalized.size() > 32) normalized.remove(normalized.size() - 1);
        mutable.set("notes", normalized);
    }

    private void normalizeSingleSequenceChange(JsonNode before, JsonNode after, JsonNode declaredNode, JsonNode answer) {
        if (!before.isObject() || !after.isObject()) throw invalid("CHANGE_INVALID");
        ObjectNode mutable = (ObjectNode) after;
        String declared = metric(declaredNode.asText(""));
        String changed = declared.isBlank() ? firstChangedMetric(before, after) : declared;
        if (changed.isBlank()) changed = "TEMPO";
        for (String field : new String[]{"tempo", "dynamics", "instrumentFamily", "meter", "notes", "mood"}) {
            if (!field.equals(fieldForMetric(changed))) mutable.set(field, before.path(field).deepCopy());
        }
        String targetField = fieldForMetric(changed);
        if (mutable.path(targetField).equals(before.path(targetField))) setAlternateValue(mutable, before, targetField);
        if (answer.isObject()) {
            ObjectNode mutableAnswer = (ObjectNode) answer;
            mutableAnswer.put("changedMetric", changed);
            mutableAnswer.put("hint", "比较两段的" + metricLabel(changed) + "，再确认其他可测量参数是否保持不变。");
            mutableAnswer.put("feedback", "只有" + metricLabel(changed) + "从“" + metricValue(before, changed)
                    + "”变为“" + metricValue(after, changed) + "”，其他可测量参数保持不变。");
            ObjectNode comparison = objectMapper.createObjectNode();
            comparison.put("改变前", sequenceDescription(before));
            comparison.put("改变后", sequenceDescription(after));
            mutableAnswer.set("comparison", comparison);
        }
    }

    private void normalizeOptions(ObjectNode round, String questionType) {
        JsonNode options = round.path("options");
        if (!options.isArray()) return;
        for (JsonNode option : options) {
            if (!option.isObject()) continue;
            ObjectNode mutable = (ObjectNode) option;
            String value = optionValue(questionType, mutable.path("value").asText(""), mutable.path("label").asText(""));
            if (!value.isBlank()) mutable.put("value", value);
            if ("MOOD_EVIDENCE".equals(questionType)) {
                String kind = mutable.path("kind").asText("").toUpperCase(Locale.ROOT);
                if (kind.isBlank()) mutable.put("kind", mutable.path("evidenceMetric").asText("").isBlank() ? "MOOD" : "EVIDENCE");
                String evidenceMetric = metric(mutable.path("evidenceMetric").asText(""));
                if (!evidenceMetric.isBlank()) mutable.put("evidenceMetric", evidenceMetric);
            }
        }
    }

    private void ensureEvidenceOptions(ObjectNode round) {
        JsonNode rawOptions = round.path("options");
        if (!rawOptions.isArray()) return;
        JsonNode sequence = round.path("sequence");
        ArrayNode options = (ArrayNode) rawOptions;
        for (int index = options.size() - 1; index >= 0; index -= 1) {
            if ("EVIDENCE".equalsIgnoreCase(options.get(index).path("kind").asText(""))) options.remove(index);
        }
        addEvidenceOption(options, "tempo", "速度：" + tempoLabel(sequence.path("tempo").asInt())
                + "（" + sequence.path("tempo").asInt() + " BPM）", "TEMPO");
        addEvidenceOption(options, "dynamics", "力度：" + dynamicsLabel(sequence.path("dynamics").asText()), "DYNAMICS");
        addEvidenceOption(options, "instrument", "音色：" + instrumentLabel(sequence.path("instrumentFamily").asText()), "INSTRUMENT");
        addEvidenceOption(options, "meter", "节拍：每组 " + sequence.path("meter").asInt() + " 拍", "METER");
    }

    private static void addEvidenceOption(ArrayNode options, String suffix, String label, String metric) {
        ObjectNode option = options.addObject();
        option.put("id", "r2-evidence-" + suffix);
        option.put("label", label);
        option.put("value", metric);
        option.put("kind", "EVIDENCE");
        option.put("evidenceMetric", metric);
    }

    private void replaceChangeOptions(ObjectNode round) {
        ArrayNode options = objectMapper.createArrayNode();
        addChangeOption(options, "tempo", "速度", "TEMPO");
        addChangeOption(options, "dynamics", "力度", "DYNAMICS");
        addChangeOption(options, "instrument", "音色", "INSTRUMENT");
        addChangeOption(options, "meter", "节拍", "METER");
        round.set("options", options);
    }

    private static void addChangeOption(ArrayNode options, String suffix, String label, String value) {
        ObjectNode option = options.addObject();
        option.put("id", "r3-change-" + suffix);
        option.put("label", label);
        option.put("value", value);
        option.put("kind", "CHOICE");
        option.put("evidenceMetric", value);
    }

    private void normalizeResult(JsonNode generated, JsonNode before, JsonNode after) {
        if (!generated.isObject()) throw invalid("RESULT_INVALID");
        ObjectNode root = (ObjectNode) generated;
        ObjectNode result = root.path("result").isObject()
                ? (ObjectNode) root.path("result")
                : objectMapper.createObjectNode();
        root.set("result", result);
        result.put("evidence", "本局乐段使用了 " + before.path("tempo").asInt()
                + " BPM、" + dynamicsLabel(before.path("dynamics").asText()) + "力度、"
                + instrumentLabel(before.path("instrumentFamily").asText()) + "音色和每组 "
                + before.path("meter").asInt() + " 拍作为可听证据。");
        result.put("aiCorrect", "AI 生成的可测量参数已经由程序重新计算并核对。");
        putTextIfMissing(result, "uncertain", "情绪感受可能因人而异，需要同时说明速度、力度、音色或节拍证据。");
        result.put("change", "第三轮只改变了" + metricLabel(firstChangedMetric(before, after)) + "，其他可测量参数保持不变。");
        putTextIfMissing(result, "discovery", "改变一个声音参数后，可以比较它怎样影响听到的感受。");
        putTextIfMissing(result, "limitation", "合成音色会因浏览器和扬声器不同而略有差异，文字参数显示的是实际值。");
    }

    private static void putTextIfMissing(ObjectNode result, String field, String fallback) {
        JsonNode value = result.path(field);
        if (!value.isTextual() || value.asText("").isBlank()) result.put(field, fallback);
    }

    private static String tempoLabel(int tempo) {
        return tempo < 82 ? "慢" : tempo > 118 ? "快" : "中等";
    }

    private static String dynamicsLabel(String value) {
        return "SOFT".equals(value) ? "轻" : "STRONG".equals(value) ? "强" : "中等";
    }

    private static String instrumentLabel(String value) {
        return switch (value) {
            case "STRINGS" -> "弦乐";
            case "WOODWIND" -> "木管";
            case "PERCUSSION" -> "打击乐";
            default -> "键盘";
        };
    }

    private static String metricLabel(String value) {
        return switch (value) {
            case "DYNAMICS" -> "力度";
            case "INSTRUMENT" -> "音色";
            case "METER" -> "节拍";
            default -> "速度";
        };
    }

    private static String metricValue(JsonNode sequence, String metric) {
        return switch (metric) {
            case "DYNAMICS" -> dynamicsLabel(sequence.path("dynamics").asText());
            case "INSTRUMENT" -> instrumentLabel(sequence.path("instrumentFamily").asText());
            case "METER" -> "每组 " + sequence.path("meter").asInt() + " 拍";
            default -> sequence.path("tempo").asInt() + " BPM";
        };
    }

    private static String sequenceDescription(JsonNode sequence) {
        return sequence.path("tempo").asInt() + " BPM，力度" + dynamicsLabel(sequence.path("dynamics").asText())
                + "，" + instrumentLabel(sequence.path("instrumentFamily").asText()) + "音色，每组 "
                + sequence.path("meter").asInt() + " 拍";
    }

    private static String optionValue(String type, String rawValue, String label) {
        String value = rawValue == null ? "" : rawValue.trim().toUpperCase(Locale.ROOT);
        String text = (value + " " + (label == null ? "" : label)).toUpperCase(Locale.ROOT);
        if ("TEMPO".equals(type)) {
            if (text.contains("SLOW") || text.contains("慢")) return "SLOW";
            if (text.contains("FAST") || text.contains("快")) return "FAST";
            if (text.contains("MEDIUM") || text.contains("中")) return "MEDIUM";
        }
        if ("DYNAMICS".equals(type)) {
            if (text.contains("SOFT") || text.contains("轻")) return "SOFT";
            if (text.contains("STRONG") || text.contains("强")) return "STRONG";
            if (text.contains("MEDIUM") || text.contains("中")) return "MEDIUM";
        }
        if ("INSTRUMENT".equals(type)) {
            for (String family : new String[]{"KEYS", "STRINGS", "WOODWIND", "PERCUSSION"}) if (text.contains(family)) return family;
            if (text.contains("键")) return "KEYS";
            if (text.contains("弦")) return "STRINGS";
            if (text.contains("木管")) return "WOODWIND";
            if (text.contains("打击")) return "PERCUSSION";
        }
        if ("CHANGE".equals(type)) return metric(value.isBlank() ? label : value);
        return value;
    }

    private static String firstChangedMetric(JsonNode before, JsonNode after) {
        for (String field : new String[]{"tempo", "dynamics", "instrumentFamily", "meter", "notes"}) {
            if (!before.path(field).equals(after.path(field))) return field.equals("instrumentFamily") ? "INSTRUMENT" : field.toUpperCase(Locale.ROOT);
        }
        return "";
    }

    private static String fieldForMetric(String metric) {
        return "INSTRUMENT".equals(metric) ? "instrumentFamily" : metric.toLowerCase(Locale.ROOT);
    }

    private static void setAlternateValue(ObjectNode sequence, JsonNode before, String field) {
        switch (field) {
            case "tempo" -> sequence.put("tempo", before.path("tempo").asInt(90) <= 140 ? before.path("tempo").asInt(90) + 20 : before.path("tempo").asInt(90) - 20);
            case "meter" -> sequence.put("meter", before.path("meter").asInt(4) < 6 ? before.path("meter").asInt(4) + 1 : 5);
            case "dynamics" -> sequence.put("dynamics", "SOFT".equals(before.path("dynamics").asText()) ? "STRONG" : "SOFT");
            case "instrumentFamily" -> sequence.put("instrumentFamily", "KEYS".equals(before.path("instrumentFamily").asText()) ? "STRINGS" : "KEYS");
            default -> { }
        }
    }

    private static String metric(String value) {
        String normalized = value == null ? "" : value.trim().toUpperCase(Locale.ROOT).replace("INSTRUMENTFAMILY", "INSTRUMENT");
        if (normalized.contains("速度") || normalized.equals("TEMPO")) return "TEMPO";
        if (normalized.contains("力度") || normalized.equals("DYNAMICS")) return "DYNAMICS";
        if (normalized.contains("音色") || normalized.equals("INSTRUMENT")) return "INSTRUMENT";
        if (normalized.contains("节拍") || normalized.equals("METER")) return "METER";
        return "";
    }

    private static String dynamics(String value) {
        String text = value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
        if (text.contains("SOFT") || text.contains("轻") || text.contains("弱")) return "SOFT";
        if (text.contains("STRONG") || text.contains("强") || text.contains("重")) return "STRONG";
        return "MEDIUM";
    }

    private static String instrument(String value) {
        String text = value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
        if (text.contains("STRING") || text.contains("弦")) return "STRINGS";
        if (text.contains("WOODWIND") || text.contains("木管")) return "WOODWIND";
        if (text.contains("PERCUSSION") || text.contains("打击")) return "PERCUSSION";
        return "KEYS";
    }

    private static int number(JsonNode node, int fallback, String... fields) {
        for (String field : fields) {
            JsonNode value = node.path(field);
            if (value.isNumber() || value.isTextual()) {
                try { return Integer.parseInt(value.asText().trim()); } catch (NumberFormatException ignored) { }
            }
        }
        return fallback;
    }

    private static double number(JsonNode node, double fallback, String... fields) {
        for (String field : fields) {
            JsonNode value = node.path(field);
            if (value.isNumber() || value.isTextual()) {
                try { return Double.parseDouble(value.asText().trim()); } catch (NumberFormatException ignored) { }
            }
        }
        return fallback;
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private void deriveAnswer(JsonNode round) {
        JsonNode sequence = round.path("sequence");
        JsonNode answer = round.path("answer");
        if (!answer.isObject() || !round.path("options").isArray()) throw invalid("ANSWER_INVALID");
        String questionType = answer.path("questionType").asText("").toUpperCase(Locale.ROOT);
        String expected = switch (questionType) {
            case "TEMPO" -> tempoBand(sequence.path("tempo").asInt());
            case "DYNAMICS" -> sequence.path("dynamics").asText("").toUpperCase(Locale.ROOT);
            case "INSTRUMENT" -> sequence.path("instrumentFamily").asText("").toUpperCase(Locale.ROOT);
            case "METER" -> String.valueOf(sequence.path("meter").asInt());
            case "CHANGE" -> answer.path("changedMetric").asText("").toUpperCase(Locale.ROOT);
            case "MOOD_EVIDENCE" -> "MOOD";
            default -> "";
        };
        if (expected.isBlank()) throw invalid("QUESTION_TYPE_INVALID");
        ArrayNode accepted = objectMapper.createArrayNode();
        ArrayNode evidence = objectMapper.createArrayNode();
        for (JsonNode option : round.path("options")) {
            String id = option.path("id").asText("");
            String value = option.path("value").asText("").toUpperCase(Locale.ROOT);
            String kind = option.path("kind").asText("CHOICE").toUpperCase(Locale.ROOT);
            if (("MOOD_EVIDENCE".equals(questionType) && "MOOD".equals(kind)) || value.equals(expected)) accepted.add(id);
            if ("MOOD_EVIDENCE".equals(questionType)
                    && "EVIDENCE".equals(kind)
                    && Set.of("TEMPO", "DYNAMICS", "INSTRUMENT", "METER")
                    .contains(option.path("evidenceMetric").asText("").toUpperCase(Locale.ROOT))) {
                evidence.add(id);
            }
        }
        if (accepted.isEmpty() || ("MOOD_EVIDENCE".equals(questionType) && evidence.isEmpty())) throw invalid("OPTIONS_INVALID");
        ObjectNode mutable = (ObjectNode) answer;
        mutable.set("acceptedOptionIds", accepted);
        mutable.put("mode", "MOOD_EVIDENCE".equals(questionType) || accepted.size() > 1 ? "ANY" : "EXACT");
        if (!evidence.isEmpty()) mutable.set("requiredAnyOptionIds", evidence);
        mutable.remove("questionType");
        mutable.remove("changedMetric");
    }

    private static String tempoBand(int tempo) {
        if (tempo < 82) return "SLOW";
        if (tempo > 118) return "FAST";
        return "MEDIUM";
    }

    private static GenerationFailure invalid(String code) {
        return new GenerationFailure("SOUND_" + code, "声音关卡结构未通过校验", "FAILED", true);
    }
}
