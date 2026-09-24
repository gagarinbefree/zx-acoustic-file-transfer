export interface BfskConfiguration {
  zeroFrequency: number
  oneFrequency: number
  symbolRate: number
  amplitude: number
}

export interface BfskDetectorThresholds {
  minimumEnergy: number
  minimumConfidence: number
}

export const defaultBfskConfiguration: BfskConfiguration = {
  zeroFrequency: 1200,
  oneFrequency: 2400,
  symbolRate: 100,
  amplitude: 0.35,
}

export const defaultBfskDetectorThresholds: BfskDetectorThresholds = {
  minimumEnergy: 0.005,
  minimumConfidence: 2,
}
