package com.zhiqu.server.singleplayer;

import com.zhiqu.server.singleplayer.GameInstanceRepository.InstanceRow;
import com.zhiqu.server.singleplayer.GameInstanceRepository.ProgressRow;
import com.zhiqu.server.singleplayer.GameInstanceRepository.SubmissionRow;
import com.zhiqu.server.singleplayer.SinglePlayerGameDtos.CreateInstanceRequest;
import com.zhiqu.server.singleplayer.SinglePlayerGameDtos.EvaluationView;
import com.zhiqu.server.singleplayer.SinglePlayerGameDtos.FinishRequest;
import com.zhiqu.server.singleplayer.SinglePlayerGameDtos.FinishView;
import com.zhiqu.server.singleplayer.SinglePlayerGameDtos.GameSummary;
import com.zhiqu.server.singleplayer.SinglePlayerGameDtos.InstanceView;
import com.zhiqu.server.singleplayer.SinglePlayerGameDtos.MutationRequest;
import com.zhiqu.server.singleplayer.SinglePlayerGameDtos.ProgressView;
import com.zhiqu.server.singleplayer.SinglePlayerGameDtos.RewardView;
import com.zhiqu.server.singleplayer.SinglePlayerGameDtos.SubmitRoundRequest;
import com.zhiqu.server.singleplayer.SinglePlayerGameErrors.GenerationFailure;
import com.zhiqu.server.singleplayer.SinglePlayerGameGenerator.Evaluation;
import com.zhiqu.server.singleplayer.SinglePlayerGameGenerator.GeneratedGame;
import com.zhiqu.server.singleplayer.SinglePlayerGameGenerator.GenerationRequest;
import jakarta.annotation.PreDestroy;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Period;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

@Service
public class SinglePlayerGameService {
    private static final int SINGLE_LEVEL = 1;
    private static final String CONTENT_VERSION = "spg-v2";
    private static final Duration INSTANCE_TTL = Duration.ofHours(24);
    private static final Pattern PRIVATE_TEXT = Pattern.compile(
            "(?i)(1[3-9]\\d{9}|[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}|QQ|微信|wechat|住址|学校|身份证)"
    );
    private static final Map<String, GameDefinition> DEFINITIONS = definitions();

    private final GameInstanceRepository repository;
    private final ObjectMapper objectMapper;
    private final SinglePlayerRewardAdapter rewards;
    private final Map<String, SinglePlayerGameGenerator> generators;
    private final ThreadPoolExecutor generationExecutor;

    public SinglePlayerGameService(
            GameInstanceRepository repository,
            ObjectMapper objectMapper,
            SinglePlayerRewardAdapter rewards,
            List<SinglePlayerGameGenerator> generatorList
    ) {
        this.repository = repository;
        this.objectMapper = objectMapper;
        this.rewards = rewards;
        this.generators = generatorList.stream().collect(Collectors.toUnmodifiableMap(
                SinglePlayerGameGenerator::gameCode,
                generator -> generator
        ));
        ThreadFactory factory = runnable -> {
            Thread thread = new Thread(runnable, "single-player-generation");
            thread.setDaemon(true);
            return thread;
        };
        this.generationExecutor = new ThreadPoolExecutor(
                2, 2, 30, TimeUnit.SECONDS, new ArrayBlockingQueue<>(12), factory, new ThreadPoolExecutor.AbortPolicy());
    }

    List<GameSummary> games() {
        return DEFINITIONS.values().stream().map(GameDefinition::summary).toList();
    }

    List<ProgressView> progress(String userId) {
        requireUserId(userId);
        List<ProgressRow> rows = repository.listProgress(userId);
        return DEFINITIONS.keySet().stream().map(gameCode -> rows.stream()
                .filter(row -> gameCode.equals(row.gameCode()) && row.completed())
                .max(Comparator.comparing(ProgressRow::updatedAt))
                .map(this::progressView)
                .orElseGet(() -> emptyProgress(gameCode))).toList();
    }

    InstanceView create(String userId, String gameCode, CreateInstanceRequest request) {
        requireUserId(userId);
        GameDefinition definition = definition(gameCode);
        if (request.levelNo() != SINGLE_LEVEL) {
            throw SinglePlayerGameErrors.badRequest(
                    "SINGLE_PLAYER_LEVEL_INVALID", "每款单机游戏只有一个统一入口"
            );
        }
        repository.findByCreateRequest(userId, request.requestId()).ifPresent(existing -> {
            if (!existing.gameCode().equals(gameCode) || existing.levelNo() != SINGLE_LEVEL) {
                throw SinglePlayerGameErrors.conflict(
                        "SINGLE_PLAYER_REQUEST_CONFLICT", "这个请求编号已经用于另一局游戏");
            }
        });
        InstanceRow existing = repository.findByCreateRequest(userId, request.requestId()).orElse(null);
        if (existing != null) return instanceView(existing);

        SinglePlayerGameGenerator generator = generator(gameCode);
        generator.ensureConfigured();
        String ageBand = resolveAgeBand(userId, request.ageBand());
        Instant now = Instant.now();
        String instanceId = UUID.randomUUID().toString();
        InstanceRow row = new InstanceRow(
                instanceId,
                userId,
                gameCode,
                SINGLE_LEVEL,
                ageBand,
                UUID.randomUUID().toString(),
                "GENERATING",
                null,
                null,
                0,
                CONTENT_VERSION,
                null,
                null,
                request.requestId(),
                request.requestId(),
                null,
                null,
                now.plus(INSTANCE_TTL),
                now,
                now
        );
        repository.insert(row);
        schedule(row, definition.learningGoal());
        return instance(userId, instanceId);
    }

    InstanceView instance(String userId, String instanceId) {
        requireUserId(userId);
        return instanceView(requireOwned(userId, instanceId));
    }

    InstanceView retryGeneration(
            String userId,
            String instanceId,
            MutationRequest request
    ) {
        InstanceRow row = requireOwned(userId, instanceId);
        if (request.requestId().equals(row.generationRequestId())) return instanceView(row);
        boolean retryableState = List.of("FAILED", "REJECTED").contains(row.status());
        if (!retryableState) {
            throw SinglePlayerGameErrors.conflict(
                    "SINGLE_PLAYER_REGENERATION_NOT_ALLOWED",
                    "当前状态不能重试生成"
            );
        }
        SinglePlayerGameGenerator generator = generator(row.gameCode());
        generator.ensureConfigured();
        Instant now = Instant.now();
        String seed = UUID.randomUUID().toString();
        repository.markGenerating(row.id(), seed, request.requestId(), now.plus(INSTANCE_TTL), now);
        InstanceRow generating = requireOwned(userId, instanceId);
        schedule(generating, definition(row.gameCode()).learningGoal());
        return instanceView(generating);
    }

    InstanceView regenerate(String userId, String instanceId, MutationRequest request) {
        InstanceRow source = requireOwned(userId, instanceId);
        if (!"COMPLETED".equals(source.status())) {
            throw SinglePlayerGameErrors.conflict(
                    "SINGLE_PLAYER_REGENERATION_NOT_ALLOWED", "完成本局后才能再玩一次"
            );
        }
        return create(userId, source.gameCode(), new CreateInstanceRequest(
                request.requestId(), SINGLE_LEVEL, source.ageBand()
        ));
    }

    @Transactional
    EvaluationView submit(
            String userId,
            String instanceId,
            String roundId,
            SubmitRoundRequest request
    ) {
        InstanceRow row = requireOwned(userId, instanceId);
        SubmissionRow existing = repository.findSubmission(instanceId, roundId, request.requestId()).orElse(null);
        if (existing != null) return evaluationView(existing);
        if (!"READY".equals(row.status())) {
            throw SinglePlayerGameErrors.conflict(
                    "SINGLE_PLAYER_INSTANCE_NOT_READY", "本局内容尚未准备好"
            );
        }
        String expectedRound = "r" + (row.currentRound() + 1);
        if (!expectedRound.equals(roundId)) {
            throw SinglePlayerGameErrors.conflict(
                    "SINGLE_PLAYER_ROUND_OUT_OF_ORDER", "请先完成当前轮次"
            );
        }
        String actionJson = writeJson(request.action());
        if (actionJson.length() > 6000) {
            throw SinglePlayerGameErrors.badRequest("SINGLE_PLAYER_ACTION_TOO_LARGE", "本轮操作内容过长");
        }
        JsonNode publicContent = readJson(row.publicContentJson());
        JsonNode answerSpec = readJson(row.answerSpecJson());
        JsonNode publicRound = findRound(publicContent.path("rounds"), roundId);
        JsonNode answer = findRound(answerSpec.path("rounds"), roundId);
        Evaluation result = generator(row.gameCode()).evaluate(publicRound, answer, request.action());
        int nextRound = row.currentRound() + (result.correct() ? 1 : 0);
        StoredEvaluation stored = new StoredEvaluation(
                result.correct(), result.hint(), result.feedback(), result.comparison(), result.ability(),
                nextRound, nextRound == 3
        );
        Instant now = Instant.now();
        SubmissionRow submission = repository.insertSubmission(
                instanceId, roundId, request.requestId(), actionJson, writeJson(stored), now);
        if (result.correct() && repository.advanceRound(instanceId, row.currentRound(), now) != 1) {
            throw SinglePlayerGameErrors.conflict(
                    "SINGLE_PLAYER_ROUND_ALREADY_ADVANCED", "本轮已经完成，请刷新后继续"
            );
        }
        return evaluationView(submission);
    }

    @Transactional
    FinishView finish(String userId, String instanceId, FinishRequest request) {
        InstanceRow row = requireOwned(userId, instanceId);
        if ("COMPLETED".equals(row.status())) {
            if (row.finishResultJson() == null) {
                throw SinglePlayerGameErrors.conflict("SINGLE_PLAYER_FINISH_IN_PROGRESS", "结算正在保存，请稍后重试");
            }
            return readValue(row.finishResultJson(), FinishView.class);
        }
        if (!"READY".equals(row.status()) || row.currentRound() != 3) {
            throw SinglePlayerGameErrors.conflict(
                    "SINGLE_PLAYER_ROUNDS_INCOMPLETE", "完成三轮挑战后才能结算"
            );
        }
        String childDiscovery = request.discovery() == null ? "" : request.discovery().trim();
        if (PRIVATE_TEXT.matcher(childDiscovery).find()) {
            throw SinglePlayerGameErrors.badRequest(
                    "SINGLE_PLAYER_PRIVATE_TEXT_REJECTED", "发现内容中不要填写姓名、学校或联系方式"
            );
        }
        Instant now = Instant.now();
        if (repository.markCompleted(instanceId, request.requestId(), now) != 1) {
            InstanceRow completed = requireOwned(userId, instanceId);
            if (completed.finishResultJson() != null) return readValue(completed.finishResultJson(), FinishView.class);
            throw SinglePlayerGameErrors.conflict("SINGLE_PLAYER_FINISH_IN_PROGRESS", "结算正在保存，请稍后重试");
        }

        JsonNode publicContent = readJson(row.publicContentJson());
        ObjectNode discovery = (ObjectNode) publicContent.path("result").deepCopy();
        if (!childDiscovery.isBlank()) discovery.put("childObservation", childDiscovery.substring(0, Math.min(500, childDiscovery.length())));
        JsonNode ability = aggregateAbility(instanceId);
        ObjectNode bestResult = objectMapper.createObjectNode();
        bestResult.put("instanceId", instanceId);
        bestResult.set("discovery", discovery);
        bestResult.put("completedAt", now.toString());
        ProgressRow progress = repository.upsertProgress(
                userId, row.gameCode(), row.levelNo(), writeJson(ability), writeJson(bestResult), now);
        RewardView reward = rewards.award(userId, row.gameCode(), row.levelNo(), now);
        FinishView finish = new FinishView(
                instanceId, "COMPLETED", discovery, progressView(progress), reward
        );
        repository.storeFinishResult(instanceId, writeJson(finish), now);
        return finish;
    }

    private void schedule(InstanceRow row, String learningGoal) {
        try {
            generationExecutor.execute(() -> generate(row, learningGoal));
        } catch (java.util.concurrent.RejectedExecutionException rejected) {
            repository.markGenerationFailure(row.id(), "REJECTED", "GENERATION_QUEUE_FULL", Instant.now());
        }
    }

    private void generate(InstanceRow row, String learningGoal) {
        GenerationFailure last = null;
        for (int attempt = 0; attempt < 2; attempt += 1) {
            try {
                GeneratedGame game = generator(row.gameCode()).generate(new GenerationRequest(
                        row.id(), row.levelNo(), row.ageBand(), learningGoal, row.seed() + "-" + attempt));
                repository.markReady(
                        row.id(), writeJson(game.publicContent()), writeJson(game.answerSpec()), game.modelName(), Instant.now());
                return;
            } catch (GenerationFailure failure) {
                last = failure;
                if (!failure.retryable()) break;
            } catch (RuntimeException failure) {
                last = new GenerationFailure("GENERATION_INTERNAL_ERROR", "生成流程发生错误", "FAILED", false);
                break;
            }
        }
        GenerationFailure failure = last == null
                ? new GenerationFailure("GENERATION_FAILED", "生成失败", "FAILED", true)
                : last;
        repository.markGenerationFailure(row.id(), failure.state(), failure.code(), Instant.now());
    }

    private JsonNode aggregateAbility(String instanceId) {
        List<SubmissionRow> submissions = repository.listSubmissions(instanceId);
        int correct = 0;
        int retries = 0;
        ObjectNode totals = objectMapper.createObjectNode();
        totals.put("taskCompletion", 0);
        totals.put("evidenceUse", 0);
        totals.put("revisionQuality", 0);
        totals.put("explanationClarity", 0);
        for (SubmissionRow submission : submissions) {
            StoredEvaluation evaluation = readValue(submission.evaluationJson(), StoredEvaluation.class);
            if (evaluation.correct()) {
                correct += 1;
                JsonNode ability = evaluation.ability();
                for (String key : List.of("taskCompletion", "evidenceUse", "revisionQuality", "explanationClarity")) {
                    totals.put(key, totals.path(key).asInt(0) + ability.path(key).asInt(0));
                }
            } else {
                retries += 1;
            }
        }
        totals.put("completedRounds", Math.min(3, correct));
        totals.put("retryCount", retries);
        return totals;
    }

    private EvaluationView evaluationView(SubmissionRow row) {
        StoredEvaluation evaluation = readValue(row.evaluationJson(), StoredEvaluation.class);
        return new EvaluationView(
                row.id(), row.roundId(), evaluation.correct(), evaluation.hint(), evaluation.feedback(),
                evaluation.comparison(), evaluation.ability(), evaluation.currentRound(),
                evaluation.allRoundsComplete(), row.createdAt()
        );
    }

    private InstanceView instanceView(InstanceRow row) {
        JsonNode content = row.publicContentJson() == null ? null : readJson(row.publicContentJson());
        return new InstanceView(
                row.id(), row.gameCode(), row.levelNo(), row.ageBand(), row.status(), row.currentRound(),
                row.contentVersion(), row.modelName(), content, row.failureCode(), row.expiresAt(), row.createdAt(), row.updatedAt()
        );
    }

    private ProgressView progressView(ProgressRow row) {
        return new ProgressView(
                row.gameCode(), row.completed(), readJson(row.abilityJson()),
                row.bestResultJson() == null ? null : readJson(row.bestResultJson()), row.completedAt(), row.updatedAt()
        );
    }

    private ProgressView emptyProgress(String gameCode) {
        return new ProgressView(gameCode, false, objectMapper.createObjectNode(), null, null, null);
    }

    private InstanceRow requireOwned(String userId, String instanceId) {
        requireUserId(userId);
        if (instanceId == null || !instanceId.matches("[0-9a-fA-F-]{36}")) throw SinglePlayerGameErrors.notFound();
        return repository.findOwned(userId, instanceId).orElseThrow(SinglePlayerGameErrors::notFound);
    }

    private SinglePlayerGameGenerator generator(String gameCode) {
        SinglePlayerGameGenerator generator = generators.get(gameCode);
        if (generator == null) throw SinglePlayerGameErrors.badRequest("SINGLE_PLAYER_GAME_INVALID", "请选择有效的单机游戏");
        return generator;
    }

    private GameDefinition definition(String gameCode) {
        GameDefinition definition = DEFINITIONS.get(gameCode);
        if (definition == null) throw SinglePlayerGameErrors.badRequest("SINGLE_PLAYER_GAME_INVALID", "请选择有效的单机游戏");
        return definition;
    }

    private String resolveAgeBand(String userId, String requested) {
        LocalDate birthDate = repository.birthDate(userId).orElse(null);
        if (birthDate != null) {
            int age = Period.between(birthDate, LocalDate.now(ZoneId.of("Asia/Shanghai"))).getYears();
            if (age <= 8) return "6-8";
            if (age <= 10) return "9-10";
            return "11-12";
        }
        if (!List.of("6-8", "9-10", "11-12").contains(requested)) {
            throw SinglePlayerGameErrors.badRequest(
                    "SINGLE_PLAYER_AGE_BAND_REQUIRED", "资料中没有年龄信息，请先选择 6-8、9-10 或 11-12 岁"
            );
        }
        return requested;
    }

    private JsonNode findRound(JsonNode rounds, String roundId) {
        if (rounds != null && rounds.isArray()) {
            for (JsonNode round : rounds) if (roundId.equals(round.path("roundId").asText(""))) return round;
        }
        throw SinglePlayerGameErrors.conflict("SINGLE_PLAYER_ROUND_INVALID", "本轮内容不可用，请重新生成");
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception error) {
            throw new IllegalStateException("Unable to encode single-player JSON", error);
        }
    }

    private JsonNode readJson(String value) {
        try {
            return objectMapper.readTree(value);
        } catch (Exception error) {
            throw new IllegalStateException("Unable to decode single-player JSON", error);
        }
    }

    private <T> T readValue(String value, Class<T> type) {
        try {
            return objectMapper.readValue(value, type);
        } catch (Exception error) {
            throw new IllegalStateException("Unable to decode single-player value", error);
        }
    }

    private static void requireUserId(String userId) {
        if (userId == null || userId.isBlank()) throw SinglePlayerGameErrors.notFound();
    }

    @PreDestroy
    void closeExecutor() {
        generationExecutor.shutdownNow();
    }

    private static Map<String, GameDefinition> definitions() {
        Map<String, GameDefinition> definitions = new LinkedHashMap<>();
        definitions.put("prompt-writer", new GameDefinition(
                "prompt-writer", "提示词小作家", "语文表达、阅读理解",
                "观察 AI 如何从一句话中提取对象、动作、地点和条件。",
                "比较原始信息、AI 提取结果与一次信息变化。", 6
        ));
        definitions.put("image-detective", new GameDefinition(
                "image-detective", "图片侦探", "美术、观察、空间关系",
                "比较实际图片、视觉模型识别和自己的观察。",
                "用主体、颜色、形状、位置和关系证据核对 AI 的识别。", 7
        ));
        definitions.put("sound-conductor", new GameDefinition(
                "sound-conductor", "声音小指挥", "音乐、情绪表达",
                "观察 AI 怎样测量速度、力度、音色与节拍，再推测感受。",
                "用可听见、可看见的速度、力度、音色和节拍证据核对 AI 判断。", 6
        ));
        definitions.put("route-and-conditions", new GameDefinition(
                "route-and-conditions", "路线与条件", "数学、逻辑",
                "观察 AI 如何读取抽象图的节点、数字和限制条件。",
                "读取路线数字与条件，用确定性计算核对选择。", 7
        ));
        return Map.copyOf(definitions);
    }

    private record StoredEvaluation(
            boolean correct,
            String hint,
            String feedback,
            JsonNode comparison,
            JsonNode ability,
            int currentRound,
            boolean allRoundsComplete
    ) {
    }

    private record GameDefinition(
            String gameCode,
            String title,
            String subject,
            String description,
            String learningGoal,
            int estimatedMinutes
    ) {
        GameSummary summary() {
            return new GameSummary(
                    gameCode, title, subject, description, learningGoal,
                    List.of("6-8", "9-10", "11-12"), estimatedMinutes, SINGLE_LEVEL
            );
        }
    }
}
