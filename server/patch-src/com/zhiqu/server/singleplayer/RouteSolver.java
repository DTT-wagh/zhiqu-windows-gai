package com.zhiqu.server.singleplayer;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.PriorityQueue;
import java.util.Set;

public final class RouteSolver {
    private static final double EPSILON = 0.000001d;

    public record Node(String id, String label, double x, double y) {
    }

    public record Edge(
            String id,
            String from,
            String to,
            Double distance,
            Double time,
            Double cost,
            Double safety
    ) {
    }

    public record Graph(List<Node> nodes, List<Edge> edges, String startId, String endId) {
    }

    public record Constraints(
            Double maxDistance,
            Double maxTime,
            Double maxCost,
            Double minSafety,
            Set<String> requiredMetrics,
            boolean requireCompleteInformation
    ) {
        public Constraints {
            requiredMetrics = requiredMetrics == null ? Set.of() : Set.copyOf(requiredMetrics);
        }
    }

    public record Weights(double distance, double time, double cost, double safety) {
    }

    public record Task(String objective, Constraints constraints, Weights weights) {
    }

    public record PathResult(
            String id,
            List<String> nodeIds,
            List<String> edgeIds,
            Double distance,
            Double time,
            Double cost,
            Double safety,
            double score,
            Set<String> missingMetrics
    ) {
    }

    public record SolveResult(
            List<PathResult> candidates,
            List<String> bestPathIds,
            boolean noSolution,
            boolean informationMissing
    ) {
    }

    public SolveResult solve(Graph graph, Task task) {
        validateGraph(graph);
        List<PathResult> candidates = enumerate(graph).stream()
                .map(path -> summarize(graph, path, task))
                .toList();
        if (candidates.isEmpty()) return new SolveResult(List.of(), List.of(), true, false);

        Constraints constraints = task.constraints() == null
                ? new Constraints(null, null, null, null, Set.of(), false)
                : task.constraints();
        boolean missing = constraints.requireCompleteInformation()
                && candidates.stream().anyMatch(path -> !path.missingMetrics().isEmpty());
        if (missing) return new SolveResult(candidates, List.of(), false, true);

        List<PathResult> feasible = candidates.stream().filter(path -> satisfies(path, constraints)).toList();
        if (feasible.isEmpty()) return new SolveResult(candidates, List.of(), true, false);
        double bestScore = feasible.stream().mapToDouble(PathResult::score).min().orElseThrow();
        List<String> best = feasible.stream()
                .filter(path -> Math.abs(path.score() - bestScore) < EPSILON)
                .map(PathResult::id)
                .toList();
        return new SolveResult(candidates, best, false, false);
    }

    public Optional<PathResult> dijkstra(Graph graph, String metric) {
        validateGraph(graph);
        Map<String, List<Edge>> adjacency = adjacency(graph);
        Map<String, Double> distance = new HashMap<>();
        Map<String, Edge> previous = new HashMap<>();
        PriorityQueue<NodeDistance> queue = new PriorityQueue<>(Comparator.comparingDouble(NodeDistance::distance));
        distance.put(graph.startId(), 0d);
        queue.add(new NodeDistance(graph.startId(), 0d));

        while (!queue.isEmpty()) {
            NodeDistance current = queue.poll();
            if (current.distance() > distance.getOrDefault(current.nodeId(), Double.POSITIVE_INFINITY)) continue;
            if (current.nodeId().equals(graph.endId())) break;
            for (Edge edge : adjacency.getOrDefault(current.nodeId(), List.of())) {
                Double weight = metric(edge, metric);
                if (weight == null) continue;
                String next = edge.from().equals(current.nodeId()) ? edge.to() : edge.from();
                double candidate = current.distance() + weight;
                if (candidate + EPSILON < distance.getOrDefault(next, Double.POSITIVE_INFINITY)) {
                    distance.put(next, candidate);
                    previous.put(next, edge);
                    queue.add(new NodeDistance(next, candidate));
                }
            }
        }
        if (!distance.containsKey(graph.endId())) return Optional.empty();

        ArrayDeque<String> nodes = new ArrayDeque<>();
        ArrayDeque<String> edges = new ArrayDeque<>();
        String cursor = graph.endId();
        nodes.addFirst(cursor);
        while (!cursor.equals(graph.startId())) {
            Edge edge = previous.get(cursor);
            if (edge == null) return Optional.empty();
            edges.addFirst(edge.id());
            cursor = edge.from().equals(cursor) ? edge.to() : edge.from();
            nodes.addFirst(cursor);
        }
        Task task = new Task(metric.toUpperCase(), new Constraints(null, null, null, null, Set.of(metric), false), null);
        return Optional.of(summarize(graph, new RawPath(List.copyOf(nodes), List.copyOf(edges)), task));
    }

    public void validateGraph(Graph graph) {
        if (graph == null || graph.nodes() == null || graph.edges() == null) {
            throw new IllegalArgumentException("ROUTE_GRAPH_MISSING");
        }
        Set<String> nodeIds = new HashSet<>();
        for (Node node : graph.nodes()) {
            if (node == null || node.id() == null || node.id().isBlank() || !nodeIds.add(node.id())) {
                throw new IllegalArgumentException("ROUTE_NODE_INVALID");
            }
        }
        if (!nodeIds.contains(graph.startId()) || !nodeIds.contains(graph.endId()) || graph.startId().equals(graph.endId())) {
            throw new IllegalArgumentException("ROUTE_ENDPOINT_INVALID");
        }
        Set<String> edgeIds = new HashSet<>();
        for (Edge edge : graph.edges()) {
            if (edge == null || edge.id() == null || !edgeIds.add(edge.id())
                    || !nodeIds.contains(edge.from()) || !nodeIds.contains(edge.to()) || edge.from().equals(edge.to())) {
                throw new IllegalArgumentException("ROUTE_EDGE_INVALID");
            }
            for (Double value : List.of(
                    edge.distance() == null ? 0d : edge.distance(),
                    edge.time() == null ? 0d : edge.time(),
                    edge.cost() == null ? 0d : edge.cost(),
                    edge.safety() == null ? 0d : edge.safety())) {
                if (!Double.isFinite(value) || value < 0d) throw new IllegalArgumentException("ROUTE_WEIGHT_NEGATIVE");
            }
        }
    }

    private List<RawPath> enumerate(Graph graph) {
        Map<String, List<Edge>> adjacency = adjacency(graph);
        List<RawPath> paths = new ArrayList<>();
        dfs(graph.startId(), graph.endId(), adjacency, new HashSet<>(), new ArrayList<>(), new ArrayList<>(), paths, graph.nodes().size() + 1);
        return paths;
    }

    private void dfs(
            String current,
            String end,
            Map<String, List<Edge>> adjacency,
            Set<String> visited,
            List<String> nodeIds,
            List<String> edgeIds,
            List<RawPath> paths,
            int limit
    ) {
        if (paths.size() >= 64 || nodeIds.size() > limit) return;
        visited.add(current);
        nodeIds.add(current);
        if (current.equals(end)) {
            paths.add(new RawPath(List.copyOf(nodeIds), List.copyOf(edgeIds)));
        } else {
            for (Edge edge : adjacency.getOrDefault(current, List.of())) {
                String next = edge.from().equals(current) ? edge.to() : edge.from();
                if (visited.contains(next)) continue;
                edgeIds.add(edge.id());
                dfs(next, end, adjacency, visited, nodeIds, edgeIds, paths, limit);
                edgeIds.remove(edgeIds.size() - 1);
            }
        }
        nodeIds.remove(nodeIds.size() - 1);
        visited.remove(current);
    }

    private Map<String, List<Edge>> adjacency(Graph graph) {
        Map<String, List<Edge>> adjacency = new LinkedHashMap<>();
        graph.nodes().forEach(node -> adjacency.put(node.id(), new ArrayList<>()));
        graph.edges().forEach(edge -> {
            adjacency.get(edge.from()).add(edge);
            adjacency.get(edge.to()).add(edge);
        });
        return adjacency;
    }

    private PathResult summarize(Graph graph, RawPath raw, Task task) {
        Map<String, Edge> byId = new HashMap<>();
        graph.edges().forEach(edge -> byId.put(edge.id(), edge));
        MetricTotal distance = total(raw.edgeIds(), byId, "distance");
        MetricTotal time = total(raw.edgeIds(), byId, "time");
        MetricTotal cost = total(raw.edgeIds(), byId, "cost");
        MetricTotal safety = minimum(raw.edgeIds(), byId, "safety");
        Set<String> missing = new HashSet<>();
        Constraints constraints = task.constraints();
        Set<String> required = new HashSet<>(constraints == null ? Set.of() : constraints.requiredMetrics());
        required.add(switch (task.objective().toUpperCase()) {
            case "TIME" -> "time";
            case "COST" -> "cost";
            case "SAFETY" -> "safety";
            case "WEIGHTED" -> "weighted";
            default -> "distance";
        });
        if (required.contains("distance") && distance.missing()) missing.add("distance");
        if (required.contains("time") && time.missing()) missing.add("time");
        if (required.contains("cost") && cost.missing()) missing.add("cost");
        if (required.contains("safety") && safety.missing()) missing.add("safety");
        if (required.contains("weighted")) {
            Weights weights = task.weights() == null ? new Weights(1d, 1d, 1d, 1d) : task.weights();
            if (weights.distance() != 0d && distance.missing()) missing.add("distance");
            if (weights.time() != 0d && time.missing()) missing.add("time");
            if (weights.cost() != 0d && cost.missing()) missing.add("cost");
            if (weights.safety() != 0d && safety.missing()) missing.add("safety");
        }
        double score = score(task, distance.value(), time.value(), cost.value(), safety.value(), missing);
        return new PathResult(
                "route-" + String.join("-", raw.nodeIds()),
                raw.nodeIds(),
                raw.edgeIds(),
                distance.value(),
                time.value(),
                cost.value(),
                safety.value(),
                score,
                Set.copyOf(missing)
        );
    }

    private double score(Task task, Double distance, Double time, Double cost, Double safety, Set<String> missing) {
        if (!missing.isEmpty()) return Double.POSITIVE_INFINITY;
        return switch (task.objective().toUpperCase()) {
            case "TIME" -> time;
            case "COST" -> cost;
            case "SAFETY" -> -safety;
            case "WEIGHTED" -> {
                Weights weights = task.weights() == null ? new Weights(1d, 1d, 1d, 1d) : task.weights();
                yield distance * weights.distance() + time * weights.time() + cost * weights.cost() - safety * weights.safety();
            }
            default -> distance;
        };
    }

    private boolean satisfies(PathResult path, Constraints constraints) {
        if (!path.missingMetrics().isEmpty()) return false;
        return (constraints.maxDistance() == null || path.distance() <= constraints.maxDistance())
                && (constraints.maxTime() == null || path.time() <= constraints.maxTime())
                && (constraints.maxCost() == null || path.cost() <= constraints.maxCost())
                && (constraints.minSafety() == null || path.safety() >= constraints.minSafety());
    }

    private MetricTotal total(List<String> edgeIds, Map<String, Edge> edges, String metric) {
        double total = 0d;
        for (String edgeId : edgeIds) {
            Double value = metric(edges.get(edgeId), metric);
            if (value == null) return new MetricTotal(null, true);
            total += value;
        }
        return new MetricTotal(total, false);
    }

    private MetricTotal minimum(List<String> edgeIds, Map<String, Edge> edges, String metric) {
        double minimum = Double.POSITIVE_INFINITY;
        for (String edgeId : edgeIds) {
            Double value = metric(edges.get(edgeId), metric);
            if (value == null) return new MetricTotal(null, true);
            minimum = Math.min(minimum, value);
        }
        return new MetricTotal(minimum, false);
    }

    private Double metric(Edge edge, String metric) {
        if (edge == null) return null;
        return switch (metric.toLowerCase()) {
            case "time" -> edge.time();
            case "cost" -> edge.cost();
            case "safety" -> edge.safety();
            default -> edge.distance();
        };
    }

    private record RawPath(List<String> nodeIds, List<String> edgeIds) {
    }

    private record MetricTotal(Double value, boolean missing) {
    }

    private record NodeDistance(String nodeId, double distance) {
    }
}
