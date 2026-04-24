import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { copyFile, mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  hashPassword,
  isValidRole,
  loadUsersFromDatabase,
  minimumPasswordLength,
  normalizeUsername,
  openUsersDatabase,
  saveUsersToDatabase,
  verifyPassword,
} from './user-store.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-gpu-compositing')
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')

const sessionDataPath = path.join(app.getPath('userData'), 'session-data')
app.setPath('sessionData', sessionDataPath)

const csvColumns = [
  ['name', 'name'],
  ['resX', 'resX'],
  ['resY', 'resY'],
  ['widthM', 'widthM'],
  ['heightM', 'heightM'],
  ['depthM', 'depthM'],
  ['power', 'power'],
  ['weightKg', 'weightKg'],
  ['bendAngleMinDeg', 'bendAngleMinDeg'],
  ['bendAngleMaxDeg', 'bendAngleMaxDeg'],
  ['frameHeightMinM', 'frameHeightMinM'],
  ['frameHeightMaxM', 'frameHeightMaxM'],
  ['frameWeightKg  0.5m', 'frameWeightKg05m'],
  ['frameWeightKg 1m', 'frameWeightKg1m'],
]

function getBundledDataFilePath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'data', 'led-models.csv')
  }

  return path.resolve(__dirname, '../data/led-models.csv')
}

function getUserDataFilePath() {
  return path.join(app.getPath('userData'), 'data', 'led-models.csv')
}

function getLegacyUsersCsvPath() {
  return path.join(app.getPath('userData'), 'data', 'users.csv')
}

function getUsersDatabasePath() {
  return path.join(app.getPath('userData'), 'data', 'users.db')
}

async function ensureDataFile() {
  const targetPath = getUserDataFilePath()
  await mkdir(path.dirname(targetPath), { recursive: true })

  try {
    await readFile(targetPath, 'utf8')
    return targetPath
  } catch {
    await copyFile(getBundledDataFilePath(), targetPath)
    return targetPath
  }
}

function parseCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length < 2) {
    return []
  }

  const headers = lines[0].split(',').map((header) => header.trim())
  const expectedHeaders = csvColumns.map(([source]) => source)

  if (headers.join('|') !== expectedHeaders.join('|')) {
    throw new Error('CSV antraštės neatitinka laukiamo LED modelių formato.')
  }

  return lines.slice(1).map((line, index) => {
    const values = line.split(',').map((value) => value.trim())

    if (values.length !== csvColumns.length) {
      throw new Error(`CSV eilutė ${index + 2} turi neteisingą stulpelių skaičių.`)
    }

    return Object.fromEntries(csvColumns.map(([_, key], columnIndex) => [key, values[columnIndex] ?? '']))
  })
}

async function loadLedData() {
  const dataFilePath = await ensureDataFile()
  const csvText = await readFile(dataFilePath, 'utf8')

  return {
    dataFilePath,
    models: parseCsv(csvText),
  }
}

function sanitizeUsersForRenderer(users) {
  return users.map((user) => ({
    username: user.username,
    passwordHash: '',
    role: user.role,
  }))
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1360,
    height: 920,
    minWidth: 900,
    minHeight: 680,
    autoHideMenuBar: true,
    backgroundColor: '#f5f5f4',
    resizable: true,
    maximizable: true,
    fullscreenable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    window.loadURL(process.env.VITE_DEV_SERVER_URL)
    return
  }

  window.loadFile(path.resolve(__dirname, '../dist/index.html'))
}

ipcMain.handle('led-data:load', async () => {
  return loadLedData()
})

ipcMain.handle('led-data:open-file', async () => {
  const dataFilePath = await ensureDataFile()
  const openResult = await shell.openPath(dataFilePath)

  if (openResult) {
    throw new Error(openResult)
  }

  return dataFilePath
})

ipcMain.handle('users:list', async () => {
  const { users, usersFilePath } = await loadUsersFromDatabase(getUsersDatabasePath(), getLegacyUsersCsvPath())

  return {
    users: sanitizeUsersForRenderer(users),
    usersFilePath,
  }
})

ipcMain.handle('users:login', async (_event, payload) => {
  const username = normalizeUsername(payload?.username)
  const password = typeof payload?.password === 'string' ? payload.password : ''

  if (!username || !password) {
    throw new Error('Įveskite vartotojo vardą ir slaptažodį.')
  }

  const { users, usersFilePath } = await loadUsersFromDatabase(getUsersDatabasePath(), getLegacyUsersCsvPath())
  const matchedUser = users.find((user) => user.username === username)

  if (!matchedUser || !verifyPassword(matchedUser, password)) {
    throw new Error('Neteisingas vartotojo vardas arba slaptažodis.')
  }

  return {
    user: {
      username: matchedUser.username,
      passwordHash: '',
      role: matchedUser.role,
    },
    usersFilePath,
  }
})

ipcMain.handle('users:create', async (_event, payload) => {
  const username = normalizeUsername(payload?.username)
  const password = typeof payload?.password === 'string' ? payload.password : ''
  const role = isValidRole(payload?.role) ? payload.role : 'user'

  if (!username) {
    throw new Error('Įveskite vartotojo vardą.')
  }

  if (password.length < minimumPasswordLength) {
    throw new Error(`Slaptažodis turi būti bent ${minimumPasswordLength} simbolių.`)
  }

  const { users } = await loadUsersFromDatabase(getUsersDatabasePath(), getLegacyUsersCsvPath())

  if (users.some((user) => user.username === username)) {
    throw new Error('Toks vartotojas jau egzistuoja.')
  }

  const result = await saveUsersToDatabase(
    getUsersDatabasePath(),
    [...users, { username, passwordHash: hashPassword(password), role }],
    getLegacyUsersCsvPath(),
  )

  return {
    users: sanitizeUsersForRenderer(result.users),
    usersFilePath: result.usersFilePath,
  }
})

ipcMain.handle('users:delete', async (_event, usernameValue) => {
  const username = normalizeUsername(usernameValue)
  const { users } = await loadUsersFromDatabase(getUsersDatabasePath(), getLegacyUsersCsvPath())
  const targetUser = users.find((user) => user.username === username)

  if (!targetUser) {
    throw new Error('Nepavyko rasti pasirinkto vartotojo.')
  }

  const adminCount = users.filter((user) => user.role === 'admin').length

  if (targetUser.role === 'admin' && adminCount <= 1) {
    throw new Error('Turi likti bent vienas administratorius.')
  }

  const result = await saveUsersToDatabase(
    getUsersDatabasePath(),
    users.filter((user) => user.username !== username),
    getLegacyUsersCsvPath(),
  )

  return {
    users: sanitizeUsersForRenderer(result.users),
    usersFilePath: result.usersFilePath,
  }
})

ipcMain.handle('users:open-file', async () => {
  const { usersFilePath } = await openUsersDatabase(getUsersDatabasePath(), getLegacyUsersCsvPath())
  const openResult = await shell.openPath(usersFilePath)

  if (openResult) {
    throw new Error(openResult)
  }

  return usersFilePath
})

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})