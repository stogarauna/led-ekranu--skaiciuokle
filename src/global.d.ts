type LedModel = {
  name: string
  resX: string
  resY: string
  widthM: string
  heightM: string
  depthM: string
  power: string
  weightKg: string
  bendAngleMinDeg: string
  bendAngleMaxDeg: string
  frameHeightMinM: string
  frameHeightMaxM: string
  frameWeightKg05m: string
  frameWeightKg1m: string
}

type LedDataResponse = {
  dataFilePath: string
  models: LedModel[]
}

interface Window {
  desktopApp: {
    platform: string
    loadLedData: () => Promise<LedDataResponse>
    openLedDataFile: () => Promise<string>
  }
}