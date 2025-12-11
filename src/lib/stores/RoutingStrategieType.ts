export enum RoutingStrategieType {
  LINK_STATE = "LINK_STATE",
  DISTANCE_VECTOR = "DISTANCE_VECTOR",
  DISTANCE_VECTOR_POISONED = "DISTANCE_VECTOR_POISONED",
}

// Alias used by SimulationController#setAlgorithm according to the UML
export type AlgorithmType = RoutingStrategieType;
