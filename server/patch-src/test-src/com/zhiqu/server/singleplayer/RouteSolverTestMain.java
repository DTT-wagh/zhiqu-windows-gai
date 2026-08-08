package com.zhiqu.server.singleplayer;

import java.util.List;
import java.util.Set;

public final class RouteSolverTestMain {
    private RouteSolverTestMain() {
    }

    public static void main(String[] args) {
        RouteSolver solver = new RouteSolver();
        RouteSolver.Graph graph = graph();

        RouteSolver.PathResult shortest = solver.dijkstra(graph, "distance").orElseThrow();
        check(shortest.nodeIds().equals(List.of("A", "C", "D")), "Dijkstra must select the actual shortest path");
        check(Math.abs(shortest.distance() - 9d) < 0.0001d, "Dijkstra distance must be 9");

        RouteSolver.Task weighted = new RouteSolver.Task(
                "WEIGHTED",
                new RouteSolver.Constraints(null, null, null, 2d, Set.of("distance", "time", "cost", "safety"), false),
                new RouteSolver.Weights(1d, 2d, 3d, 2d)
        );
        RouteSolver.SolveResult weightedResult = solver.solve(graph, weighted);
        check(!weightedResult.noSolution(), "multi-objective route must be solvable");
        check(weightedResult.bestPathIds().size() == 1, "multi-objective route must have one deterministic best path");

        RouteSolver.Graph disconnected = new RouteSolver.Graph(
                List.of(node("A"), node("B"), node("D")),
                List.of(edge("ab", "A", "B", 2d, 2d, 1d, 4d)),
                "A", "D"
        );
        RouteSolver.SolveResult noRoute = solver.solve(disconnected, distanceTask(false));
        check(noRoute.noSolution(), "disconnected graph must report no solution");

        RouteSolver.Graph missingMetric = new RouteSolver.Graph(
                List.of(node("A"), node("B"), node("C"), node("D")),
                List.of(
                        edge("ab", "A", "B", 2d, null, 1d, 4d),
                        edge("bd", "B", "D", 2d, 3d, 1d, 4d),
                        edge("ac", "A", "C", 3d, 4d, 1d, 4d),
                        edge("cd", "C", "D", 3d, 4d, 1d, 4d)
                ),
                "A", "D"
        );
        RouteSolver.Task informationTask = new RouteSolver.Task(
                "TIME",
                new RouteSolver.Constraints(null, null, null, null, Set.of("time"), true),
                null
        );
        check(solver.solve(missingMetric, informationTask).informationMissing(),
                "missing required metric must request more information instead of guessing");

        RouteSolver.Graph negative = new RouteSolver.Graph(
                List.of(node("A"), node("D")),
                List.of(edge("ad", "A", "D", -1d, 1d, 1d, 4d)),
                "A", "D"
        );
        expectFailure(() -> solver.validateGraph(negative), "negative edge weights must be rejected");

        RouteSolver.Task impossibleConstraint = new RouteSolver.Task(
                "DISTANCE",
                new RouteSolver.Constraints(1d, null, null, 5d, Set.of("distance", "safety"), false),
                null
        );
        check(solver.solve(graph, impossibleConstraint).noSolution(), "hard constraints must filter every invalid route");

        System.out.println("{\"result\":\"ok\",\"checks\":10}");
    }

    private static RouteSolver.Graph graph() {
        return new RouteSolver.Graph(
                List.of(node("A"), node("B"), node("C"), node("D")),
                List.of(
                        edge("ab", "A", "B", 5d, 3d, 2d, 5d),
                        edge("bd", "B", "D", 5d, 3d, 2d, 5d),
                        edge("ac", "A", "C", 7d, 1d, 1d, 3d),
                        edge("cd", "C", "D", 2d, 1d, 1d, 3d),
                        edge("bc", "B", "C", 4d, 2d, 4d, 2d)
                ),
                "A", "D"
        );
    }

    private static RouteSolver.Task distanceTask(boolean complete) {
        return new RouteSolver.Task(
                "DISTANCE",
                new RouteSolver.Constraints(null, null, null, null, Set.of("distance"), complete),
                null
        );
    }

    private static RouteSolver.Node node(String id) {
        return new RouteSolver.Node(id, id, 10d, 10d);
    }

    private static RouteSolver.Edge edge(
            String id, String from, String to, Double distance, Double time, Double cost, Double safety
    ) {
        return new RouteSolver.Edge(id, from, to, distance, time, cost, safety);
    }

    private static void expectFailure(Runnable action, String message) {
        try {
            action.run();
            throw new AssertionError(message);
        } catch (IllegalArgumentException expected) {
            check("ROUTE_WEIGHT_NEGATIVE".equals(expected.getMessage()), message);
        }
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
