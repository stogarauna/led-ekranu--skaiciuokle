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

type AuthUserRecord = {
  username: string
  passwordHash: string
  role: 'admin' | 'user'
}

type AuthUsersResponse = {
  users: AuthUserRecord[]
  usersFilePath: string
}

type AuthLoginResponse = {
  user: AuthUserRecord
  usersFilePath: string
}

interface Window {
  desktopApp: {
    platform: string
    loadLedData: () => Promise<LedDataResponse>
    openLedDataFile: () => Promise<string>
    loadUsers: () => Promise<AuthUsersResponse>
    loginUser: (username: string, password: string) => Promise<AuthLoginResponse>
    createUser: (payload: { username: string; password: string; role: 'admin' | 'user' }) => Promise<AuthUsersResponse>
    deleteUser: (username: string) => Promise<AuthUsersResponse>
    openUsersFile: () => Promise<string>
  }
}