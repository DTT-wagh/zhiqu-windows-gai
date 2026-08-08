package com.zhiqu.server.singleplayer;

import com.zhiqu.server.singleplayer.RouteSolver.Constraints;
import com.zhiqu.server.singleplayer.RouteSolver.Edge;
import com.zhiqu.server.singleplayer.RouteSolver.Graph;
import com.zhiqu.server.singleplayer.RouteSolver.Node;
import com.zhiqu.server.singleplayer.RouteSolver.PathResult;
import com.zhiqu.server.singleplayer.RouteSolver.SolveResult;
import com.zhiqu.server.singleplayer.RouteSolver.Task;
import com.zhiqu.server.singleplayer.RouteSolver.Weights;
import com.zhiqu.server.singleplayer.SinglePlayerGameErrors.GenerationFailure;
import com.zhiqu.server.singleplayer.SinglePlayerGameGenerator.GeneratedGame;
import com.zhiqu.server.singleplayer.SinglePlayerGameGenerator.GenerationRequest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

@Component
final class RouteGenerator implements SinglePlayerGameGenerator {
    private static final String SYSTEM_PROMPT = """
            你只为 6-12 岁儿童生成抽象路线图和任务条件 JSON，不能判断答案、不能计算最优路线、不能生成真实地址或导航建议。
            只返回 {"safety":{"status":"SAFE|REJECTED","reason":"..."},"themeLabel":"虚构短名称","graph":{"startId":"A","endId":"D","nodes":[{"id":"A","label":"虚构地点","x":0到100,"y":0到100}],"edges":[{"id":"e1","from":"A","to":"B","distance":非负数或null,"time":非负数或null,"cost":非负数或null,"safety":1到5或null}]},"tasks":[四个任务条件]}。
            第一个 task 用于示范，后三个依次是 r1、r2、r3。task 格式 {"objective":"DISTANCE|TIME|COST|SAFETY|WEIGHTED","constraints":{"maxDistance":数或null,"maxTime":数或null,"maxCost":数或null,"minSafety":数或null,"requiredMetrics":["distance"],"requireCompleteInformation":false},"weights":{"distance":数,"time":数,"cost":数,"safety":数}}。
            图含 4-7 个节点、至少 5 条无向边、至少两条起终点简单路径。数字符合 ageBand。除 levelNo=11 外所有边指标完整；levelNo=11 必须让至少一条候选路线缺少任务所需指标并把 requireCompleteInformation 设为 true。
            不要返回题面、提示、讲评、解答或 Markdown。不要使用学校、家庭、道路、GPS、真实地名。
            """;

    private final SinglePlayerAiClient client;
    private final GameContentValidator validator;
    private final RouteSolver solver;
    private final ObjectMapper objectMapper;

    RouteGenerator(
            SinglePlayerAiClient client,
            GameContentValidator validator,
            ObjectMapper objectMapper
    ) {
        this.client = client;
        this.validator = validator;
        this.objectMapper = objectMapper;
        this.solver = new RouteSolver();
    }

    @Override
    public String gameCode() {
        return "route-and-conditions";
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
        validateSafety(generated.path("safety"));
        Graph graph = graph(generated.path("graph"), request.levelNo());
        List<Task> tasks = tasks(generated.path("tasks"));
        if (tasks.size() != 4) throw invalid();
        ObjectNode playable = buildPlayable(generated.path("themeLabel").asText("抽象图"), graph, tasks);
        return validator.splitAndValidate(gameCode(), playable, client.modelName() + "+RouteSolver-v1");
    }

    private ObjectNode buildPlayable(String theme, Graph graph, List<Task> tasks) {
        Map<String, String> labels = new HashMap<>();
        graph.nodes().forEach(node -> labels.put(node.id(), node.label()));
        SolveResult demoResult = solver.solve(graph, tasks.get(0));
        if (demoResult.candidates().size() < 2) throw invalid();

        ObjectNode root = objectMapper.createObjectNode();
        root.putObject("safety").put("status", "SAFE").put("reason", "结构与路线均已由程序校验");
        root.put("instruction", "在“" + theme + "”抽象图中读清数字和条件，再比较路线。");
        root.set("map", mapNode(graph));
        ObjectNode demo = root.putObject("demo");
        demo.put("title", "先看一次条件怎样改变选择");
        demo.put("original", taskText(tasks.get(0)));
        demo.set("map", mapNode(graph));
        demo.set("options", optionNodes(demoResult, labels));
        demo.put("explanation", explanation(demoResult, tasks.get(0), labels));

        ArrayNode rounds = root.putArray("rounds");
        for (int index = 1; index < 4; index += 1) {
            Task task = tasks.get(index);
            SolveResult result = solver.solve(graph, task);
            ObjectNode round = rounds.addObject();
            round.put("roundId", "r" + index);
            round.put("title", objectiveLabel(task.objective()) + "比较");
            round.put("prompt", taskText(task));
            round.set("map", mapNode(graph));
            round.set("options", optionNodes(result, labels));
            ObjectNode answer = round.putObject("answer");
            ArrayNode accepted = answer.putArray("acceptedOptionIds");
            if (result.informationMissing()) accepted.add("NEED_INFO");
            else if (result.noSolution()) accepted.add("NO_SOLUTION");
            else result.bestPathIds().forEach(accepted::add);
            answer.put("mode", accepted.size() > 1 ? "ANY" : "EXACT");
            answer.put("hint", hint(result, task, labels));
            answer.put("feedback", explanation(result, task, labels));
            answer.set("comparison", comparison(result, task));
            answer.putObject("ability")
                    .put("taskCompletion", 1)
                    .put("evidenceUse", task.constraints().requiredMetrics().size() + 1)
                    .put("revisionQuality", 1)
                    .put("explanationClarity", 1);
        }
        SolveResult finalResult = solver.solve(graph, tasks.get(3));
        ObjectNode result = root.putObject("result");
        result.put("discovery", discovery(finalResult, tasks.get(3), labels));
        result.put("limitation", finalResult.informationMissing()
                ? "这张图缺少一项实际数字，程序不会替它猜测。"
                : "这次结论只适用于“" + theme + "”里的数字和条件，不能当作现实导航。");
        return root;
    }

    private Graph graph(JsonNode node, int levelNo) {
        if (!node.isObject() || !node.path("nodes").isArray() || !node.path("edges").isArray()) throw invalid();
        List<Node> nodes = new ArrayList<>();
        for (JsonNode item : node.path("nodes")) {
            String label = item.path("label").asText("");
            if (label.isBlank() || label.length() > 6) throw invalid();
            nodes.add(new Node(
                    item.path("id").asText(""),
                    label,
                    clamp(item.path("x").asDouble(50d)),
                    clamp(item.path("y").asDouble(50d))
            ));
        }
        List<Edge> edges = new ArrayList<>();
        for (JsonNode item : node.path("edges")) {
            edges.add(new Edge(
                    item.path("id").asText(""), item.path("from").asText(""), item.path("to").asText(""),
                    nullable(item.get("distance")), nullable(item.get("time")), nullable(item.get("cost")), nullable(item.get("safety"))
            ));
        }
        if (nodes.size() < 4 || nodes.size() > 7 || edges.size() < 5 || edges.size() > 14) throw invalid();
        if (levelNo != 11 && edges.stream().anyMatch(edge -> edge.distance() == null || edge.time() == null || edge.cost() == null || edge.safety() == null)) {
            throw invalid();
        }
        Graph graph = new Graph(nodes, edges, node.path("startId").asText(""), node.path("endId").asText(""));
        try {
            solver.validateGraph(graph);
        } catch (IllegalArgumentException error) {
            throw new GenerationFailure(error.getMessage(), "路线图没有通过程序校验", "FAILED", true);
        }
        return graph;
    }

    private List<Task> tasks(JsonNode node) {
        if (!node.isArray()) throw invalid();
        List<Task> tasks = new ArrayList<>();
        for (JsonNode item : node) {
            String objective = item.path("objective").asText("").toUpperCase(Locale.ROOT);
            if (!Set.of("DISTANCE", "TIME", "COST", "SAFETY", "WEIGHTED").contains(objective)) throw invalid();
            JsonNode constraints = item.path("constraints");
            Set<String> required = new HashSet<>();
            constraints.path("requiredMetrics").forEach(metric -> required.add(metric.asText("").toLowerCase(Locale.ROOT)));
            Constraints parsedConstraints = new Constraints(
                    nullable(constraints.get("maxDistance")), nullable(constraints.get("maxTime")),
                    nullable(constraints.get("maxCost")), nullable(constraints.get("minSafety")),
                    required, constraints.path("requireCompleteInformation").asBoolean(false)
            );
            JsonNode weights = item.path("weights");
            Weights parsedWeights = new Weights(
                    weights.path("distance").asDouble(0d), weights.path("time").asDouble(0d),
                    weights.path("cost").asDouble(0d), weights.path("safety").asDouble(0d)
            );
            tasks.add(new Task(objective, parsedConstraints, parsedWeights));
        }
        return tasks;
    }

    private ObjectNode mapNode(Graph graph) {
        return objectMapper.valueToTree(graph);
    }

    private ArrayNode optionNodes(SolveResult result, Map<String, String> labels) {
        ArrayNode options = objectMapper.createArrayNode();
        result.candidates().stream().limit(8).forEach(path -> {
            ObjectNode option = options.addObject();
            option.put("id", path.id());
            option.put("label", String.join(" → ", path.nodeIds().stream().map(labels::get).toList()));
            option.set("nodeIds", objectMapper.valueToTree(path.nodeIds()));
            ObjectNode metrics = option.putObject("metrics");
            putNullable(metrics, "distance", path.distance());
            putNullable(metrics, "time", path.time());
            putNullable(metrics, "cost", path.cost());
            putNullable(metrics, "safety", path.safety());
            metrics.set("missing", objectMapper.valueToTree(path.missingMetrics()));
        });
        if (result.informationMissing()) options.addObject().put("id", "NEED_INFO").put("label", "先补充缺少的数字");
        if (result.noSolution()) options.addObject().put("id", "NO_SOLUTION").put("label", "当前条件下没有可行路线");
        return options;
    }

    private ObjectNode comparison(SolveResult result, Task task) {
        ObjectNode node = objectMapper.createObjectNode();
        node.put("objective", objectiveLabel(task.objective()));
        node.set("bestPathIds", objectMapper.valueToTree(result.bestPathIds()));
        node.put("informationMissing", result.informationMissing());
        node.put("noSolution", result.noSolution());
        return node;
    }

    private String taskText(Task task) {
        List<String> parts = new ArrayList<>();
        parts.add("优先比较" + objectiveLabel(task.objective()));
        Constraints c = task.constraints();
        if (c.maxDistance() != null) parts.add("总长度不超过" + number(c.maxDistance()));
        if (c.maxTime() != null) parts.add("总时间不超过" + number(c.maxTime()));
        if (c.maxCost() != null) parts.add("总费用不超过" + number(c.maxCost()));
        if (c.minSafety() != null) parts.add("安全值至少" + number(c.minSafety()));
        if (c.requireCompleteInformation()) parts.add("先检查数字是否完整");
        return String.join("，", parts) + "。";
    }

    private String hint(SolveResult result, Task task, Map<String, String> labels) {
        if (result.informationMissing()) {
            PathResult missing = result.candidates().stream().filter(path -> !path.missingMetrics().isEmpty()).findFirst().orElse(result.candidates().get(0));
            return routeLabel(missing, labels) + "缺少" + String.join("、", missing.missingMetrics()) + "，先找出空白数字。";
        }
        if (result.noSolution()) return "逐条检查“" + taskText(task) + "”中的硬条件，再看哪些路线被排除。";
        PathResult sample = result.candidates().get(0);
        return "把" + routeLabel(sample, labels) + "每一段的" + objectiveLabel(task.objective()) + "合起来，再和另一条路线比较。";
    }

    private String explanation(SolveResult result, Task task, Map<String, String> labels) {
        if (result.informationMissing()) return "有路线缺少任务需要的数字，所以先补信息比猜一个答案更可靠。";
        if (result.noSolution()) return "程序逐条过滤后，没有路线同时满足这些条件。";
        PathResult best = result.candidates().stream().filter(path -> result.bestPathIds().contains(path.id())).findFirst().orElseThrow();
        return routeLabel(best, labels) + "在满足条件后，" + objectiveLabel(task.objective()) + "的程序计算值是" + metricValue(best, task.objective()) + "。";
    }

    private String discovery(SolveResult result, Task task, Map<String, String> labels) {
        if (result.informationMissing()) return "我发现有数字缺失时，AI 和程序都不应该替路线猜答案。";
        if (result.noSolution()) return "我发现先检查硬条件，可能得到“没有可行路线”这个可靠结论。";
        PathResult best = result.candidates().stream().filter(path -> result.bestPathIds().contains(path.id())).findFirst().orElseThrow();
        return "我发现目标改成“" + objectiveLabel(task.objective()) + "”后，程序用实际数字选出了" + routeLabel(best, labels) + "。";
    }

    private static String routeLabel(PathResult path, Map<String, String> labels) {
        return String.join("到", path.nodeIds().stream().map(labels::get).toList());
    }

    private static String metricValue(PathResult path, String objective) {
        Double value = switch (objective.toUpperCase(Locale.ROOT)) {
            case "TIME" -> path.time();
            case "COST" -> path.cost();
            case "SAFETY" -> path.safety();
            default -> path.distance();
        };
        return value == null ? "信息不足" : number(value);
    }

    private static String objectiveLabel(String objective) {
        return switch (objective.toUpperCase(Locale.ROOT)) {
            case "TIME" -> "时间";
            case "COST" -> "费用";
            case "SAFETY" -> "安全值";
            case "WEIGHTED" -> "多个目标";
            default -> "长度";
        };
    }

    private static Double nullable(JsonNode node) {
        return node == null || node.isNull() || !node.isNumber() ? null : node.asDouble();
    }

    private static double clamp(double value) {
        return Math.max(4d, Math.min(96d, value));
    }

    private static String number(double value) {
        return Math.rint(value) == value ? String.valueOf((long) value) : String.format(Locale.ROOT, "%.1f", value);
    }

    private static void putNullable(ObjectNode node, String key, Double value) {
        if (value == null) node.putNull(key);
        else node.put(key, value);
    }

    private static void validateSafety(JsonNode safety) {
        String status = safety.isTextual() ? safety.asText("") : safety.path("status").asText("");
        if (!"SAFE".equalsIgnoreCase(status)) {
            throw new GenerationFailure("AI_CONTENT_REJECTED", "路线内容未通过儿童安全审核", "REJECTED", false);
        }
    }

    private static GenerationFailure invalid() {
        return new GenerationFailure("ROUTE_GAME_SCHEMA_INVALID", "路线图结构未通过程序校验", "FAILED", true);
    }
}
