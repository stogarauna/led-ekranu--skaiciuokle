import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'
import bundledCsvText from '../data/led-models.csv?raw'
import {
  createSharedUser,
  deleteSharedUser,
  getInitialAuthStorageMode,
  hasDesktopUsersFileAccess,
  isSharedAuthUnavailableError,
  loadSharedUsers,
  loginWithSharedAuth,
  openDesktopUsersFile,
  type AuthStorageMode,
} from './auth-client'

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
  truss30_2mKg: string
  trussF45_2mKg: string
  steelflex1mKg: string
  steelflex2mKg: string
  shackleKg: string
}

type UserRole = 'admin' | 'user'

type AdminView = 'calculator' | 'users'

type AppUser = {
  username: string
  passwordHash: string
  role: UserRole
}

type RiggingOption = {
  value: string
  label: string
  weightKey?: keyof LedModel
  spanM?: number
}

const trussOptions: RiggingOption[] = [
  { value: 'none', label: 'Be santvaros' },
  { value: '30-2m', label: "Santvara 30' 2 m", spanM: 2, weightKey: 'truss30_2mKg' },
  { value: 'f45-2m', label: 'Santvara F45 2 m', spanM: 2, weightKey: 'trussF45_2mKg' },
]

const steelflexOptions: RiggingOption[] = [
  { value: 'none', label: 'Be steelflex' },
  { value: '1m', label: 'Steelflex 1 m', weightKey: 'steelflex1mKg' },
  { value: '2m', label: 'Steelflex 2 m', weightKey: 'steelflex2mKg' },
]

const parameterCards: Array<{ key: keyof LedModel; label: string; unit?: string }> = [
  { key: 'resX', label: 'Pixels X', unit: 'pix' },
  { key: 'resY', label: 'Pixels Y', unit: 'pix' },
  { key: 'power', label: 'Galia', unit: 'W' },
  { key: 'weightKg', label: 'Svoris', unit: 'kg' },
  { key: 'frameWeightKg05m', label: 'Rėmo svoris 0.5 m', unit: 'kg' },
  { key: 'frameWeightKg1m', label: 'Rėmo svoris 1 m', unit: 'kg' },
]

const parameterRows: Array<{ key: keyof LedModel; label: string; unit?: string }> = [
  { key: 'widthM', label: 'Modulio plotis', unit: 'm' },
  { key: 'heightM', label: 'Modulio aukštis', unit: 'm' },
  { key: 'depthM', label: 'Modulio gylis', unit: 'm' },
  { key: 'bendAngleMinDeg', label: 'Lenkimas min', unit: '°' },
  { key: 'bendAngleMaxDeg', label: 'Lenkimas max', unit: '°' },
  { key: 'frameHeightMinM', label: 'Rėmo aukštis min', unit: 'm' },
  { key: 'frameHeightMaxM', label: 'Rėmo aukštis max', unit: 'm' },
]

const csvFieldMap: Array<[string, keyof LedModel]> = [
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
  ['truss30_2mKg', 'truss30_2mKg'],
  ['trussF45_2mKg', 'trussF45_2mKg'],
  ['steelflex1mKg', 'steelflex1mKg'],
  ['steelflex2mKg', 'steelflex2mKg'],
  ['shackleKg', 'shackleKg'],
]

const usersStorageKey = 'led-screen-calculator-users'
const passwordHashPrefix = 'sha256:'
const minimumPasswordLength = 6
const defaultUsers: AppUser[] = [
  { username: 'admin', passwordHash: 'sha256:8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918', role: 'admin' },
]

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getPreviewModuleColor(isWarmPalette: boolean, row: number, column: number) {
  if (isWarmPalette) {
    return (row + column) % 2 === 0 ? '#ea580c' : '#7e22ce'
  }

  return (row + column) % 2 === 0 ? '#84cc16' : '#5b21b6'
}

function readNumber(value: string, fallback: number) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function formatValue(value: string, unit?: string) {
  if (!value || value === '-') {
    return '-'
  }

  if (value === 'Nesilenkia' || value === 'Neturi') {
    return value
  }

  return unit ? `${value} ${unit}` : value
}

function formatMeters(value: number) {
  return `${value.toFixed(2)} m`
}

function formatCentimeters(value: number) {
  const centimeters = Number((value * 100).toFixed(2))
  return `${centimeters} cm`
}

function formatModuleDimension(value: string) {
  if (!value || value === '-') {
    return '-'
  }

  if (value === 'Nesilenkia' || value === 'Neturi') {
    return value
  }

  const parsed = Number.parseFloat(value)

  if (!Number.isFinite(parsed)) {
    return value
  }

  return formatCentimeters(parsed)
}

function formatModuleParameterValue(key: keyof LedModel, value: string, unit?: string) {
  if (key === 'resX' || key === 'resY' || key === 'power' || key === 'weightKg' || key === 'frameWeightKg05m' || key === 'frameWeightKg1m') {
    return formatValue(value, unit)
  }

  return formatModuleDimension(value)
}

function readCount(value: string) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

function hasNumericValue(value?: string) {
  if (!value || value === '-' || value === 'Neturi') {
    return false
  }

  return Number.isFinite(Number.parseFloat(value))
}

function hasMeaningfulValue(value?: string) {
  return Boolean(value && value !== '-' && value !== 'Neturi' && value !== 'Nesilenkia')
}

function getLoadDistributionFactors(pointCount: number) {
  const predefined: Record<number, number[]> = {
    2: [0.5, 0.5],
    3: [0.1875, 0.625, 0.1875],
    4: [0.133, 0.367, 0.367, 0.133],
    5: [0.098, 0.286, 0.232, 0.286, 0.098],
    6: [0.079, 0.226, 0.195, 0.195, 0.226, 0.079],
    7: [0.066, 0.189, 0.16, 0.17, 0.16, 0.189, 0.066],
    8: [0.056, 0.162, 0.138, 0.144, 0.144, 0.138, 0.162, 0.056],
  }

  if (predefined[pointCount]) {
    return {
      factors: predefined[pointCount],
      modeLabel: 'Excel paskirstymas',
    }
  }

  return {
    factors: Array.from({ length: pointCount }, () => 1 / pointCount),
    modeLabel: 'Vienodas paskirstymas',
  }
}

function parseBundledCsv(text: string): LedModel[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
  const headers = lines[0].split(',').map((header) => header.trim())
  const expectedHeaders = csvFieldMap.map(([header]) => header)

  if (headers.join('|') !== expectedHeaders.join('|')) {
    throw new Error('CSV antraštės neatitinka laukiamo formato.')
  }

  return lines.slice(1).map((line) => {
    const values = line.split(',').map((value) => value.trim())
    return Object.fromEntries(csvFieldMap.map(([_, key], index) => [key, values[index] ?? ''])) as LedModel
  })
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase()
}

function isValidRole(value: string): value is UserRole {
  return value === 'admin' || value === 'user'
}

function isPasswordHash(value: string) {
  return value.startsWith(passwordHashPrefix) && value.length > passwordHashPrefix.length
}

async function hashPassword(password: string) {
  if (typeof window === 'undefined' || !window.crypto?.subtle) {
    throw new Error('Naršyklė nepalaiko saugaus slaptažodžių maišymo.')
  }

  const encodedPassword = new TextEncoder().encode(password)
  const digest = await window.crypto.subtle.digest('SHA-256', encodedPassword)
  const hash = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')
  return `${passwordHashPrefix}${hash}`
}

async function verifyPassword(user: AppUser, password: string) {
  if (!isPasswordHash(user.passwordHash)) {
    return user.passwordHash === password
  }

  const candidateHash = await hashPassword(password)
  return user.passwordHash === candidateHash
}

async function migrateUsersToHashed(users: AppUser[]) {
  let didMigrate = false

  const migratedUsers = await Promise.all(
    users.map(async (user) => {
      if (isPasswordHash(user.passwordHash)) {
        return user
      }

      didMigrate = true
      return {
        ...user,
        passwordHash: await hashPassword(user.passwordHash),
      }
    }),
  )

  return { migratedUsers, didMigrate }
}

function loadStoredUsers(): AppUser[] {
  if (typeof window === 'undefined') {
    return defaultUsers
  }

  try {
    const rawUsers = window.localStorage.getItem(usersStorageKey)

    if (!rawUsers) {
      window.localStorage.setItem(usersStorageKey, JSON.stringify(defaultUsers))
      return defaultUsers
    }

    const parsedUsers = JSON.parse(rawUsers)

    if (!Array.isArray(parsedUsers)) {
      window.localStorage.setItem(usersStorageKey, JSON.stringify(defaultUsers))
      return defaultUsers
    }

    const normalizedUsers = parsedUsers.reduce<AppUser[]>((result, user) => {
      if (!user || typeof user !== 'object') {
        return result
      }

      const username = typeof user.username === 'string' ? normalizeUsername(user.username) : ''
      const passwordHash = typeof user.passwordHash === 'string'
        ? user.passwordHash
        : typeof user.password === 'string'
          ? user.password
          : ''
      const role = isValidRole(user.role ?? '') ? user.role : 'user'

      if (!username || !passwordHash) {
        return result
      }

      result.push({ username, passwordHash, role })
      return result
    }, [])

    const usersWithAdmin = normalizedUsers.some((user) => user.role === 'admin')
      ? normalizedUsers
      : [...defaultUsers, ...normalizedUsers]

    if (usersWithAdmin.length === 0) {
      window.localStorage.setItem(usersStorageKey, JSON.stringify(defaultUsers))
      return defaultUsers
    }

    window.localStorage.setItem(usersStorageKey, JSON.stringify(usersWithAdmin))
    return usersWithAdmin
  } catch {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(usersStorageKey, JSON.stringify(defaultUsers))
    }

    return defaultUsers
  }
}

function saveStoredUsers(users: AppUser[]) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(usersStorageKey, JSON.stringify(users))
}

function getErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallbackMessage
}

function readSubmittedField(formData: FormData, fieldName: string) {
  const value = formData.get(fieldName)
  return typeof value === 'string' ? value : ''
}

function getSelectedWeightedOption<T extends { value: string }>(options: T[], value: string) {
  return options.find((option) => option.value === value) ?? options[0]
}

function getRiggingWeight(model: LedModel | undefined, weightKey?: keyof LedModel) {
  if (!weightKey) {
    return 0
  }

  return readNumber(model?.[weightKey] ?? '0', 0)
}

function App() {
  const [models, setModels] = useState<LedModel[]>([])
  const [selectedModelName, setSelectedModelName] = useState('')
  const [dataFilePath, setDataFilePath] = useState('')
  const [statusMessage, setStatusMessage] = useState('Kraunami LED modeliai...')
  const [errorMessage, setErrorMessage] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isDataSectionCollapsed, setIsDataSectionCollapsed] = useState(true)
  const [mountingMode, setMountingMode] = useState<'statom' | 'kabinam'>('statom')
  const [screenWidthInput, setScreenWidthInput] = useState('0')
  const [screenHeightInput, setScreenHeightInput] = useState('0')
  const [pointCountInput, setPointCountInput] = useState('2')
  const [trussLengthInput, setTrussLengthInput] = useState('0')
  const [isTrussLengthAuto, setIsTrussLengthAuto] = useState(true)
  const [selectedTruss, setSelectedTruss] = useState(trussOptions[0].value)
  const [selectedSteelflex, setSelectedSteelflex] = useState(steelflexOptions[0].value)
  const [isExportingPng, setIsExportingPng] = useState(false)
  const [loginInput, setLoginInput] = useState('')
  const [loginPasswordInput, setLoginPasswordInput] = useState('')
  const [loginError, setLoginError] = useState('')
  const [authStorageMode, setAuthStorageMode] = useState<AuthStorageMode>(() => getInitialAuthStorageMode())
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [usersFilePath, setUsersFilePath] = useState('')
  const [users, setUsers] = useState<AppUser[]>(() => loadStoredUsers())
  const [activeUser, setActiveUser] = useState<AppUser | null>(null)
  const [activeAdminView, setActiveAdminView] = useState<AdminView>('calculator')
  const [hasCompletedUserMigration, setHasCompletedUserMigration] = useState(false)
  const [newUsernameInput, setNewUsernameInput] = useState('')
  const [newPasswordInput, setNewPasswordInput] = useState('')
  const [newUserRole, setNewUserRole] = useState<UserRole>('user')
  const [newUserError, setNewUserError] = useState('')
  const [newUserSuccess, setNewUserSuccess] = useState('')

  useEffect(() => {
    void refreshLedData()
  }, [])

  useEffect(() => {
    async function ensureHashedUsers() {
      try {
        const { migratedUsers, didMigrate } = await migrateUsersToHashed(users)

        if (didMigrate) {
          setUsers(migratedUsers)
        }
      } finally {
        setHasCompletedUserMigration(true)
      }
    }

    void ensureHashedUsers()
  }, [])

  useEffect(() => {
    if (!hasCompletedUserMigration) {
      return
    }

    if (authStorageMode !== 'local') {
      return
    }

    saveStoredUsers(users)
  }, [authStorageMode, hasCompletedUserMigration, users])

  useEffect(() => {
    if (!activeUser || authStorageMode !== 'local') {
      return
    }

    const refreshedUser = users.find((user) => user.username === activeUser.username)

    if (!refreshedUser) {
      setActiveUser(null)
      return
    }

    if (refreshedUser !== activeUser) {
      setActiveUser(refreshedUser)
    }
  }, [activeUser, authStorageMode, users])

  useEffect(() => {
    if (activeUser?.role !== 'admin') {
      return
    }

    async function refreshManagedUsers() {
      if (authStorageMode === 'local') {
        setUsers(loadStoredUsers())
        setUsersFilePath('')
        return
      }

      try {
        const response = await loadSharedUsers(sessionToken)
        setUsers(response.users)
        setUsersFilePath(response.usersFilePath)
        setAuthStorageMode(response.mode)
      } catch (error) {
        setNewUserError(getErrorMessage(error, 'Nepavyko įkelti vartotojų sąrašo.'))
        setNewUserSuccess('')
      }
    }

    void refreshManagedUsers()
  }, [activeUser, authStorageMode, sessionToken])

  useEffect(() => {
    if (activeUser?.role !== 'admin') {
      setActiveAdminView('calculator')
    }
  }, [activeUser])

  function applyModels(nextModels: LedModel[], sourceLabel: string, sourcePath: string) {
    setModels(nextModels)
    setDataFilePath(sourcePath)
    setSelectedModelName((current) => current || nextModels[0]?.name || '')
    setStatusMessage(`Įkelta modelių: ${nextModels.length} (${sourceLabel})`)
  }

  async function refreshLedData() {
    try {
      setIsLoading(true)
      setErrorMessage('')

      applyModels(parseBundledCsv(bundledCsvText), 'projekto šablonas', 'Naudojamas projekte esantis CSV šablonas')
    } catch (error) {
      try {
        const fallbackModels = parseBundledCsv(bundledCsvText)
        applyModels(fallbackModels, 'projekto šablonas', 'Naudojamas projekte esantis CSV šablonas')
        setErrorMessage(error instanceof Error ? `${error.message} Rodomas atsarginis CSV variantas.` : 'Rodomas atsarginis CSV variantas.')
      } catch (fallbackError) {
        setErrorMessage(fallbackError instanceof Error ? fallbackError.message : 'Nepavyko įkelti LED modelių.')
        setStatusMessage('Duomenų įkelti nepavyko')
      }
    } finally {
      setIsLoading(false)
    }
  }

  async function exportPreviewAsPng() {
    if (!hasCabinets) {
      setErrorMessage('Pirma įveskite ekrano modulių kiekį, kad būtų ką eksportuoti.')
      return
    }

    try {
      setIsExportingPng(true)
      setErrorMessage('')

      const exportWidth = Math.max(totalResX || assembledWidthMm || 1, 1)
      const exportHeight = Math.max(totalResY || assembledHeightMm || 1, 1)
      const canvas = document.createElement('canvas')
      canvas.width = exportWidth
      canvas.height = exportHeight

      const context = canvas.getContext('2d')

      if (!context) {
        throw new Error('Nepavyko paruošti PNG eksporto drobės.')
      }

      const usesWarmPalette = isCurved || isHanging
      const moduleWidthPx = exportWidth / Math.max(cabinetsWide, 1)
      const moduleHeightPx = exportHeight / Math.max(cabinetsHigh, 1)

      context.fillStyle = '#000000'
      context.fillRect(0, 0, exportWidth, exportHeight)

      for (let row = 0; row < cabinetsHigh; row += 1) {
        for (let column = 0; column < cabinetsWide; column += 1) {
          const x = Math.round(column * moduleWidthPx)
          const y = Math.round(row * moduleHeightPx)
          const nextX = Math.round((column + 1) * moduleWidthPx)
          const nextY = Math.round((row + 1) * moduleHeightPx)

          context.fillStyle = getPreviewModuleColor(usesWarmPalette, row, column)
          context.fillRect(x, y, nextX - x, nextY - y)
        }
      }

      context.strokeStyle = 'rgba(255, 255, 255, 0.78)'
      context.lineWidth = Math.max(1, Math.round(Math.min(moduleWidthPx, moduleHeightPx) * 0.04))

      for (let column = 0; column <= cabinetsWide; column += 1) {
        const x = Math.round(column * moduleWidthPx)
        context.beginPath()
        context.moveTo(x, 0)
        context.lineTo(x, exportHeight)
        context.stroke()
      }

      for (let row = 0; row <= cabinetsHigh; row += 1) {
        const y = Math.round(row * moduleHeightPx)
        context.beginPath()
        context.moveTo(0, y)
        context.lineTo(exportWidth, y)
        context.stroke()
      }

      context.strokeStyle = previewOverlayStroke
      context.lineWidth = Math.max(1, Math.round(Math.min(exportWidth, exportHeight) * 0.0022))
      context.beginPath()
      context.moveTo(0, 0)
      context.lineTo(exportWidth, exportHeight)
      context.moveTo(0, exportHeight)
      context.lineTo(exportWidth, 0)
      context.stroke()

      context.beginPath()
      context.arc(exportWidth / 2, exportHeight / 2, Math.min(exportWidth, exportHeight) * 0.31, 0, Math.PI * 2)
      context.stroke()

      const labelLines = [
        selectedModel?.name ?? 'Screen1',
        `W ${totalResX} X H ${totalResY}`,
        `W ${assembledWidthM.toFixed(2)}(m) X H ${assembledHeightM.toFixed(2)}(m)`,
      ]
      const labelFontSize = Math.max(16, Math.round(Math.min(exportWidth, exportHeight) * 0.028))
      const lineHeight = Math.round(labelFontSize * 1.18)
      context.font = `${labelFontSize}px Arial`
      const labelWidth = Math.max(...labelLines.map((line) => context.measureText(line).width)) + 24
      const labelHeight = lineHeight * labelLines.length + 14
      const labelX = (exportWidth - labelWidth) / 2
      const labelY = (exportHeight - labelHeight) / 2

      context.fillStyle = 'rgba(24, 24, 27, 0.82)'
      context.fillRect(labelX, labelY, labelWidth, labelHeight)
      context.fillStyle = '#ffffff'
      context.textAlign = 'center'
      context.textBaseline = 'top'

      labelLines.forEach((line, index) => {
        context.fillText(line, exportWidth / 2, labelY + 7 + lineHeight * index)
      })

      const dataUrl = canvas.toDataURL('image/png')

      const downloadLink = document.createElement('a')
      downloadLink.href = dataUrl
      downloadLink.download = `${selectedModel?.name ?? 'screen'}-${exportWidth}x${exportHeight}.png`
      downloadLink.click()

      setStatusMessage(`PNG eksportuotas: ${exportWidth} × ${exportHeight}`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Nepavyko eksportuoti PNG failo.')
    } finally {
      setIsExportingPng(false)
    }
  }

  const selectedModel = models.find((model) => model.name === selectedModelName) ?? models[0]

  const modelWidthM = readNumber(selectedModel?.widthM ?? '0.5', 0.5)
  const modelHeightM = readNumber(selectedModel?.heightM ?? '0.5', 0.5)
  const cabinetsWide = readCount(screenWidthInput)
  const cabinetsHigh = readCount(screenHeightInput)
  const totalCabinets = cabinetsWide * cabinetsHigh
  const assembledWidthM = cabinetsWide * modelWidthM
  const assembledHeightM = cabinetsHigh * modelHeightM
  const assembledWidthMm = Math.round(assembledWidthM * 1000)
  const assembledHeightMm = Math.round(assembledHeightM * 1000)
  const totalPowerW = totalCabinets * readNumber(selectedModel?.power ?? '0', 0)
  const totalWeightKg = totalCabinets * readNumber(selectedModel?.weightKg ?? '0', 0)
  const totalResX = cabinetsWide * readNumber(selectedModel?.resX ?? '0', 0)
  const totalResY = cabinetsHigh * readNumber(selectedModel?.resY ?? '0', 0)
  const suspensionPointCount = Math.max(2, readCount(pointCountInput) || 2)
  const trussLengthM = readCount(trussLengthInput)
  const distribution = getLoadDistributionFactors(suspensionPointCount)
  const selectedTrussOption = getSelectedWeightedOption(trussOptions, selectedTruss)
  const selectedSteelflexOption = getSelectedWeightedOption(steelflexOptions, selectedSteelflex)
  const selectedTrussUnitWeightKg = getRiggingWeight(selectedModel, selectedTrussOption.weightKey)
  const selectedSteelflexUnitWeightKg = getRiggingWeight(selectedModel, selectedSteelflexOption.weightKey)
  const selectedShackleUnitWeightKg = getRiggingWeight(selectedModel, 'shackleKg')
  const parsedDepth = readNumber(selectedModel?.depthM ?? '0.1', 0.1)
  const pixelPitchX = readNumber(selectedModel?.resX ?? '128', 128)
  const pixelPitchY = readNumber(selectedModel?.resY ?? '128', 128)
  const hasCabinets = totalCabinets > 0
  const isHanging = mountingMode === 'kabinam'
  const hasFrame05m = hasNumericValue(selectedModel?.frameWeightKg05m)
  const hasFrame1m = hasNumericValue(selectedModel?.frameWeightKg1m)
  const frameSpanM = hasFrame05m ? 0.5 : hasFrame1m ? 1 : 0
  const frameUnitWeightKg = frameSpanM === 0.5
    ? readNumber(selectedModel?.frameWeightKg05m ?? '0', 0)
    : frameSpanM === 1
      ? readNumber(selectedModel?.frameWeightKg1m ?? '0', 0)
      : 0
  const frameSegmentsAcrossWidth = isHanging && hasCabinets && frameSpanM > 0 ? Math.ceil(assembledWidthM / frameSpanM) : 0
  const halfMeterFrameCount = isHanging && hasCabinets ? Math.ceil(assembledWidthM / 0.5) : 0
  const totalFrameWeightKg = frameSegmentsAcrossWidth * frameUnitWeightKg
  const trussSegmentCount = isHanging && (selectedTrussOption.spanM ?? 0) > 0 && trussLengthM > 0
    ? Math.ceil(trussLengthM / (selectedTrussOption.spanM ?? 1))
    : 0
  const trussWeightKg = trussSegmentCount * selectedTrussUnitWeightKg
  const steelflexCount = isHanging && selectedSteelflexUnitWeightKg > 0 ? halfMeterFrameCount : 0
  const totalSteelflexWeightKg = steelflexCount * selectedSteelflexUnitWeightKg
  const shackleCount = isHanging && selectedShackleUnitWeightKg > 0 ? halfMeterFrameCount : 0
  const totalShackleWeightKg = shackleCount * selectedShackleUnitWeightKg
  const totalRiggingWeightKg = totalFrameWeightKg + trussWeightKg + totalSteelflexWeightKg + totalShackleWeightKg
  const totalSupportedWeightKg = totalWeightKg + (isHanging ? totalRiggingWeightKg : 0)
  const frameTypeLabel = frameSpanM > 0 ? `${frameSpanM.toFixed(1)} m rėmai` : 'Rėmai nenurodyti'
  const pointLoadsKg = distribution.factors.map((factor, index) => ({
    index: index + 1,
    loadKg: totalSupportedWeightKg * factor,
    factor,
  }))
  const pointAnchorSeams = pointLoadsKg.map((_, index) => {
    if (cabinetsWide <= 1) {
      return 0.5
    }

    if (suspensionPointCount <= Math.max(cabinetsWide - 1, 1)) {
      return clamp(Math.round(((index + 1) * cabinetsWide) / (suspensionPointCount + 1)), 1, cabinetsWide - 1)
    }

    return (index * cabinetsWide) / Math.max(suspensionPointCount - 1, 1)
  })
  const pointPreviewMarkers = pointLoadsKg.map((point, index) => ({
    ...point,
    seamPercent: (pointAnchorSeams[index] / Math.max(cabinetsWide, 1)) * 100,
    labelPercent: clamp((pointAnchorSeams[index] / Math.max(cabinetsWide, 1)) * 100, 6, 94),
  }))
  const previewAspectRatio = hasCabinets ? assembledWidthMm / Math.max(assembledHeightMm, 1) : 1
  const previewUsesWidthFit = previewAspectRatio >= 1.35
  const previewWidthPercent = clamp(Math.round(68 + previewAspectRatio * 10), 72, 92)
  const previewHeightPercent = clamp(Math.round(60 + (1 / Math.max(previewAspectRatio, 0.45)) * 10), 64, 84)
  const isCurved = (selectedModel?.bendAngleMinDeg ?? '').includes('-') || (selectedModel?.bendAngleMaxDeg ?? '').includes('+')
  const isTransparent = (selectedModel?.name ?? '').toLowerCase().includes('transparent')
  const bendAngleMinLabel = selectedModel?.bendAngleMinDeg ?? '-'
  const bendAngleMaxLabel = selectedModel?.bendAngleMaxDeg ?? '-'
  const canBend = hasMeaningfulValue(bendAngleMinLabel) && hasMeaningfulValue(bendAngleMaxLabel)
  const bendRangeLabel = canBend ? `${bendAngleMinLabel}° iki ${bendAngleMaxLabel}°` : 'Nesilenkia'
  const frameHeightMinLabel = selectedModel?.frameHeightMinM ?? '-'
  const frameHeightMaxLabel = selectedModel?.frameHeightMaxM ?? '-'
  const frameHeightRangeLabel = hasNumericValue(frameHeightMinLabel) && hasNumericValue(frameHeightMaxLabel)
    ? `${formatCentimeters(readNumber(frameHeightMinLabel, 0))} iki ${formatCentimeters(readNumber(frameHeightMaxLabel, 0))}`
    : 'Rėmo aukštis nenurodytas'

  useEffect(() => {
    if (!isHanging || !isTrussLengthAuto) {
      return
    }

    setTrussLengthInput(String(Math.ceil(assembledWidthM)))
  }, [assembledWidthM, isHanging, isTrussLengthAuto])

  function adjustInputValue(field: 'width' | 'height' | 'trussLength', delta: number) {
    const currentValue = field === 'width'
      ? screenWidthInput
      : field === 'height'
        ? screenHeightInput
        : trussLengthInput
    const nextValue = Math.max(0, readCount(currentValue) + delta)
    const formattedValue = String(nextValue)

    if (field === 'width') {
      setScreenWidthInput(formattedValue)
      return
    }

    if (field === 'trussLength') {
      setIsTrussLengthAuto(false)
      setTrussLengthInput(formattedValue)
      return
    }

    setScreenHeightInput(formattedValue)
  }

  async function handleLoginSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)
    const submittedUsername = readSubmittedField(formData, 'username')
    const submittedPassword = readSubmittedField(formData, 'password')
    const normalizedUsername = normalizeUsername(submittedUsername)

    setLoginInput(submittedUsername)
    setLoginPasswordInput(submittedPassword)

    if (!normalizedUsername || !submittedPassword) {
      setLoginError('Įveskite vartotojo vardą ir slaptažodį.')
      return
    }

    try {
      try {
        const sharedAuthResult = await loginWithSharedAuth(normalizedUsername, submittedPassword)

        setActiveUser(sharedAuthResult.user)
        setSessionToken(sharedAuthResult.token)
        setAuthStorageMode(sharedAuthResult.mode)
        setUsersFilePath(sharedAuthResult.usersFilePath)
        setLoginError('')
        setLoginInput(sharedAuthResult.user.username)
        setLoginPasswordInput('')
        return
      } catch (error) {
        if (!isSharedAuthUnavailableError(error)) {
          setLoginError(getErrorMessage(error, 'Nepavyko patikrinti slaptažodžio. Bandykite dar kartą.'))
          return
        }
      }

      const matchedUser = users.find((user) => user.username === normalizedUsername)

      if (!matchedUser) {
        setLoginError('Neteisingas vartotojo vardas arba slaptažodis.')
        return
      }

      const isPasswordValid = await verifyPassword(matchedUser, submittedPassword)

      if (!isPasswordValid) {
        setLoginError('Neteisingas vartotojo vardas arba slaptažodis.')
        return
      }

      setActiveUser(matchedUser)
      setSessionToken(null)
      setAuthStorageMode('local')
      setUsersFilePath('')
      setLoginError('')
      setLoginInput(matchedUser.username)
      setLoginPasswordInput('')
    } catch {
      setLoginError('Nepavyko patikrinti slaptažodžio. Bandykite dar kartą.')
    }
  }

  function handleLogout() {
    setActiveUser(null)
    setSessionToken(null)
    setAuthStorageMode(getInitialAuthStorageMode())
    setUsersFilePath('')
    setUsers(loadStoredUsers())
    setLoginError('')
    setLoginInput('')
    setLoginPasswordInput('')
  }

  async function handleOpenUsersFile() {
    try {
      const openedPath = await openDesktopUsersFile()
      setUsersFilePath(openedPath)
      setNewUserError('')
      setNewUserSuccess('Vartotojų duomenų bazė atidaryta.')
    } catch (error) {
      setNewUserError(getErrorMessage(error, 'Nepavyko atidaryti vartotojų duomenų bazės.'))
      setNewUserSuccess('')
    }
  }

  async function handleCreateUserSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)
    const submittedUsername = readSubmittedField(formData, 'new-username')
    const submittedPassword = readSubmittedField(formData, 'new-password')
    const submittedRole = readSubmittedField(formData, 'new-role')
    const normalizedUsername = normalizeUsername(submittedUsername)
    const normalizedRole = isValidRole(submittedRole) ? submittedRole : newUserRole

    setNewUsernameInput(submittedUsername)
    setNewPasswordInput(submittedPassword)
    setNewUserRole(normalizedRole)

    if (!normalizedUsername) {
      setNewUserError('Įveskite vartotojo vardą.')
      setNewUserSuccess('')
      return
    }

    if (submittedPassword.length < minimumPasswordLength) {
      setNewUserError(`Slaptažodis turi būti bent ${minimumPasswordLength} simbolių.`)
      setNewUserSuccess('')
      return
    }

    try {
      if (authStorageMode !== 'local') {
        const response = await createSharedUser(sessionToken, {
          username: normalizedUsername,
          password: submittedPassword,
          role: normalizedRole,
        })

        setUsers(response.users)
        setUsersFilePath(response.usersFilePath)
        setAuthStorageMode(response.mode)
        setNewUsernameInput('')
        setNewPasswordInput('')
        setNewUserRole('user')
        setNewUserError('')
        setNewUserSuccess(`Vartotojas „${normalizedUsername}“ sukurtas.`)
        return
      }

      if (users.some((user) => user.username === normalizedUsername)) {
        setNewUserError('Toks vartotojas jau egzistuoja.')
        setNewUserSuccess('')
        return
      }

      const createdUser: AppUser = {
        username: normalizedUsername,
        passwordHash: await hashPassword(submittedPassword),
        role: normalizedRole,
      }

      setUsers((currentUsers) => [...currentUsers, createdUser])
      setNewUsernameInput('')
      setNewPasswordInput('')
      setNewUserRole('user')
      setNewUserError('')
      setNewUserSuccess(`Vartotojas „${createdUser.username}“ sukurtas.`)
    } catch {
      setNewUserError('Nepavyko išsaugoti vartotojo. Bandykite dar kartą.')
      setNewUserSuccess('')
    }
  }

  function handleDeleteUser(username: string) {
    void (async () => {
    const normalizedUsername = normalizeUsername(username)
    const targetUser = users.find((user) => user.username === normalizedUsername)

    if (!targetUser) {
      setNewUserError('Nepavyko rasti pasirinkto vartotojo.')
      setNewUserSuccess('')
      return
    }

    if (activeUser?.username === normalizedUsername) {
      setNewUserError('Prisijungusio vartotojo ištrinti negalima.')
      setNewUserSuccess('')
      return
    }

    const adminCount = users.filter((user) => user.role === 'admin').length

    if (targetUser.role === 'admin' && adminCount <= 1) {
      setNewUserError('Turi likti bent vienas administratorius.')
      setNewUserSuccess('')
      return
    }

    if (authStorageMode !== 'local') {
      try {
        const response = await deleteSharedUser(sessionToken, normalizedUsername)
        setUsers(response.users)
        setUsersFilePath(response.usersFilePath)
        setAuthStorageMode(response.mode)
        setNewUserError('')
        setNewUserSuccess(`Vartotojas „${normalizedUsername}“ ištrintas.`)
      } catch (error) {
        setNewUserError(getErrorMessage(error, 'Nepavyko ištrinti vartotojo.'))
        setNewUserSuccess('')
      }
      return
    }

    setUsers((currentUsers) => currentUsers.filter((user) => user.username !== normalizedUsername))
    setNewUserError('')
    setNewUserSuccess(`Vartotojas „${normalizedUsername}“ ištrintas.`)
    })()
  }

  function handleTrussLengthInputChange(value: string) {
    setIsTrussLengthAuto(false)
    setTrussLengthInput(value)
  }

  function resetTrussLengthToScreenWidth() {
    setIsTrussLengthAuto(true)
    setTrussLengthInput(String(Math.ceil(assembledWidthM)))
  }

  const previewShapeStyle: CSSProperties = {
    width: hasCabinets ? (previewUsesWidthFit ? `${previewWidthPercent}%` : 'auto') : 0,
    height: hasCabinets ? (previewUsesWidthFit ? 'auto' : `${previewHeightPercent}%`) : 0,
    maxWidth: hasCabinets ? '92%' : 0,
    maxHeight: hasCabinets ? '84%' : 0,
    minWidth: hasCabinets ? '280px' : 0,
    minHeight: hasCabinets ? '200px' : 0,
    aspectRatio: hasCabinets ? `${assembledWidthMm} / ${Math.max(assembledHeightMm, 1)}` : undefined,
    transform: 'none',
    opacity: hasCabinets ? (isTransparent ? 0.55 : 1) : 0,
    borderWidth: isTransparent ? 2 : 0,
  }
  const previewModuleGapPx = hasCabinets ? clamp(Math.round(10 / Math.max(cabinetsWide, cabinetsHigh, 1)), 1, 4) : 0
  const previewModulesStyle: CSSProperties = hasCabinets
    ? {
        gridTemplateColumns: `repeat(${cabinetsWide}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${cabinetsHigh}, minmax(0, 1fr))`,
        gap: `${previewModuleGapPx}px`,
      }
    : {}
  const previewOverlayStroke = isTransparent ? 'rgba(82, 82, 91, 0.55)' : 'rgba(255, 255, 255, 0.72)'
  const previewOverlayLabelClassName = isTransparent
    ? 'border border-zinc-400/60 bg-white/80 text-zinc-700'
    : 'border border-white/20 bg-zinc-950/70 text-white'

  const previewShapeClassName = isTransparent
    ? 'border-zinc-500 bg-zinc-200/40'
    : isCurved
      ? 'bg-zinc-800'
      : 'bg-zinc-800 shadow-[0_16px_40px_rgba(24,24,27,0.16)]'

  const isAdmin = activeUser?.role === 'admin'
  const isUsersPage = isAdmin && activeAdminView === 'users'
  const usersStorageDescription = authStorageMode === 'server'
    ? usersFilePath
      ? `Vartotojai saugomi bendroje serverio SQLite bazėje: ${usersFilePath}`
      : 'Vartotojai saugomi bendroje serverio SQLite bazėje.'
    : authStorageMode === 'desktop'
      ? usersFilePath
        ? `Vartotojai saugomi programos SQLite bazėje: ${usersFilePath}`
        : 'Vartotojai saugomi programos SQLite bazėje.'
      : 'Atsarginis režimas: vartotojai saugomi tik šioje naršyklėje. Kituose kompiuteriuose jų nesimatys, kol nebus naudojamas bendras serverio API.'
  const userManagementSection = isAdmin ? (
    <section className="mx-auto w-full max-w-4xl rounded-[1.8rem] border border-zinc-200 bg-zinc-50 p-5 shadow-sm">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900">Vartotojų valdymas</h2>
          <p className="mt-1 text-sm text-zinc-500">Atskirame puslapyje galite kurti ir šalinti vartotojus, nesimaišant su skaičiuokle.</p>
          <p className="mt-2 text-xs leading-5 text-zinc-500">{usersStorageDescription}</p>
        </div>
        {authStorageMode === 'desktop' && hasDesktopUsersFileAccess() ? (
          <button
            type="button"
            className="rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100"
            onClick={() => void handleOpenUsersFile()}
          >
            Atidaryti vartotojų bazę
          </button>
        ) : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-[1.6rem] border border-zinc-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">Pridėti naują vartotoją</h3>
          <form className="space-y-3" onSubmit={handleCreateUserSubmit}>
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-zinc-400">Vartotojo vardas</span>
              <input
                name="new-username"
                type="text"
                autoComplete="off"
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-900 outline-none transition focus:border-zinc-400"
                value={newUsernameInput}
                onChange={(event) => setNewUsernameInput(event.target.value)}
                placeholder="naujas.user"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-zinc-400">Slaptažodis</span>
              <input
                name="new-password"
                type="password"
                autoComplete="new-password"
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-900 outline-none transition focus:border-zinc-400"
                value={newPasswordInput}
                onChange={(event) => setNewPasswordInput(event.target.value)}
                placeholder="bent 6 simboliai"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-zinc-400">Rolė</span>
              <select
                name="new-role"
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-900 outline-none transition focus:border-zinc-400"
                value={newUserRole}
                onChange={(event) => setNewUserRole(event.target.value as UserRole)}
              >
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
            </label>
            {newUserError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">
                {newUserError}
              </div>
            ) : null}
            {newUserSuccess ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 shadow-sm">
                {newUserSuccess}
              </div>
            ) : null}
            <button
              type="submit"
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100"
            >
              Pridėti vartotoją
            </button>
          </form>
        </section>

        <section className="rounded-[1.6rem] border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-zinc-400">Esami vartotojai</div>
              <div className="mt-1 text-sm text-zinc-600">Administratorių turi likti bent vienas.</div>
            </div>
            <div className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-600">
              {users.length} vart.
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {users
              .slice()
              .sort((leftUser, rightUser) => leftUser.username.localeCompare(rightUser.username))
              .map((user) => (
                <div key={user.username} className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 shadow-sm">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">{user.username}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.16em] text-zinc-400">
                      {user.role}{activeUser?.username === user.username ? ' • aktyvus' : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => handleDeleteUser(user.username)}
                    disabled={activeUser?.username === user.username}
                  >
                    Ištrinti
                  </button>
                </div>
              ))}
          </div>
        </section>
      </div>
    </section>
  ) : null

  if (!activeUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(244,244,245,0.95),_rgba(228,228,231,0.85)_40%,_rgba(212,212,216,0.8))] px-4 py-10 text-zinc-900">
        <div className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-[0_30px_90px_rgba(24,24,27,0.12)] lg:grid-cols-[1.2fr_0.9fr]">
          <div className="flex flex-col justify-between bg-zinc-950 px-8 py-10 text-white sm:px-10">
            <div>
              <div className="inline-flex rounded-full border border-white/15 px-3 py-1 text-xs uppercase tracking-[0.24em] text-zinc-300">
                LED Screens Platform
              </div>
              <h1 className="mt-6 text-4xl font-semibold tracking-tight">Prisijungimas</h1>
              <p className="mt-4 max-w-md text-sm leading-7 text-zinc-300">
                Prisijunkite su vartotojo vardu ir slaptažodžiu. Pradinis administratorius: `admin`, slaptažodis: `admin`.
              </p>
            </div>

            <div className="grid gap-3 text-sm text-zinc-300 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-zinc-400">Admin</div>
                <div className="mt-2 text-zinc-100">Pilnas valdymas, duomenų bazė, modelių parametrai ir eksportas.</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-zinc-400">User</div>
                <div className="mt-2 text-zinc-100">Skaičiavimas, modelio pasirinkimas ir peržiūra be administravimo bloko.</div>
              </div>
            </div>
          </div>

          <div className="flex items-center px-6 py-8 sm:px-10">
            <form className="w-full space-y-5" onSubmit={handleLoginSubmit}>
              <div>
                <div className="text-sm font-semibold text-zinc-800">Login</div>
                <p className="mt-1 text-sm text-zinc-500">Naudokite administratoriaus arba sukurto vartotojo duomenis.</p>
                <p className="mt-1 text-xs text-zinc-400">Naujų vartotojų slaptažodis turi būti bent 6 simbolių.</p>
              </div>

              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-zinc-400">Prisijungimo vardas</span>
                <input
                  name="username"
                  type="text"
                  autoComplete="username"
                  className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-medium text-zinc-900 outline-none transition focus:border-zinc-400 focus:bg-white"
                  value={loginInput}
                  onChange={(event) => setLoginInput(event.target.value)}
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-zinc-400">Slaptažodis</span>
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-medium text-zinc-900 outline-none transition focus:border-zinc-400 focus:bg-white"
                  value={loginPasswordInput}
                  onChange={(event) => setLoginPasswordInput(event.target.value)}
                />
              </label>

              {loginError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {loginError}
                </div>
              ) : null}

              <button
                type="submit"
                className="w-full rounded-2xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
              >
                Prisijungti
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen overflow-hidden bg-white text-zinc-900">
      <div className="flex h-full w-full flex-col overflow-hidden">
        <div className="border-b border-zinc-200 bg-zinc-50 px-5 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-xl font-semibold tracking-tight">{isAdmin ? 'Admin' : 'User'} Skiltis</h1>
                <p className="text-sm text-zinc-500">
                  {isAdmin ? 'Administravimo ir skaičiavimo langas' : 'Vartotojo peržiūros ir skaičiavimo langas'}
                </p>
              </div>
              {isAdmin ? (
                <div className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white p-1 shadow-sm">
                  <button
                    type="button"
                    className={`rounded-xl px-3 py-2 text-sm font-medium transition ${activeAdminView === 'calculator' ? 'bg-zinc-950 text-white' : 'text-zinc-600 hover:bg-zinc-100'}`}
                    onClick={() => setActiveAdminView('calculator')}
                  >
                    Skaičiuoklė
                  </button>
                  <button
                    type="button"
                    className={`rounded-xl px-3 py-2 text-sm font-medium transition ${activeAdminView === 'users' ? 'bg-zinc-950 text-white' : 'text-zinc-600 hover:bg-zinc-100'}`}
                    onClick={() => setActiveAdminView('users')}
                  >
                    Vartotojai
                  </button>
                </div>
              ) : null}
            </div>
            <div className="text-sm text-zinc-500">Prisijungta: <span className="font-semibold text-zinc-800">{activeUser.username}</span></div>
            <button
              type="button"
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
              onClick={handleLogout}
            >
              Atsijungti
            </button>
          </div>
        </div>

        {isUsersPage ? (
          <div className="min-h-0 flex-1 overflow-y-auto bg-zinc-50/70 p-5 lg:p-6">
            {userManagementSection}
          </div>
        ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1.8fr_0.9fr]">
          <div className="min-h-0 border-b border-zinc-200 bg-zinc-50/70 p-5 lg:border-b-0 lg:border-r lg:p-6">
            <div className="flex h-full flex-col gap-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Atvaizdas</h2>
                  <p className="text-sm text-zinc-500">Rodomas pagal pasirinktą LED modelį iš CSV duomenų bazės</p>
                </div>
                  <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-right text-sm text-zinc-600 shadow-sm">
                    <div>{formatMeters(assembledWidthM)} × {formatMeters(assembledHeightM)}</div>
                    <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">
                      {cabinetsWide} × {cabinetsHigh} moduliai
                    </div>
                </div>
              </div>

              <div className="relative flex-1 overflow-hidden border border-zinc-300 bg-white">
                <div
                  className="absolute inset-0 opacity-60"
                  style={{
                    backgroundImage:
                      'linear-gradient(to right, rgba(24,24,27,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(24,24,27,0.05) 1px, transparent 1px)',
                    backgroundSize: '24px 24px',
                  }}
                />

                <div className="absolute inset-0 flex items-center justify-center p-2 sm:p-3">
                  <div
                    className="relative flex h-full w-full items-center justify-center"
                  >

                    <div className="flex h-full w-full flex-col items-center gap-5 px-2 text-center sm:px-4">
                      <div className="relative flex min-h-0 w-full flex-1 items-center justify-center self-stretch">
                        <div className="relative" style={previewShapeStyle}>
                          {hasCabinets && isHanging ? (
                            <div className="pointer-events-none absolute inset-x-0 -top-14 z-10 h-14">
                              {pointPreviewMarkers.map((point) => (
                                <div
                                  key={point.index}
                                  className="absolute top-0 flex -translate-x-1/2 flex-col items-center gap-1"
                                  style={{ left: `${point.labelPercent}%` }}
                                >
                                  <div className="flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-950 px-1 text-[10px] font-bold text-white shadow-sm ring-1 ring-white/70">
                                    {point.index}
                                  </div>
                                  <div className="rounded bg-zinc-950/80 px-1 py-0.5 text-[9px] font-medium leading-none text-white ring-1 ring-white/20">
                                    {point.loadKg.toFixed(1)} kg
                                  </div>
                                  <div className="h-6 w-px bg-zinc-900/65" />
                                </div>
                              ))}
                            </div>
                          ) : null}
                          <div className={`relative h-full w-full overflow-hidden border ${previewShapeClassName} transition-all duration-300`}>
                            {hasCabinets ? (
                              <div className="relative h-full w-full bg-black p-px">
                                <div className="grid h-full w-full" style={previewModulesStyle}>
                                  {Array.from({ length: totalCabinets }, (_, index) => {
                                    const row = Math.floor(index / Math.max(cabinetsWide, 1))
                                    const column = index % Math.max(cabinetsWide, 1)
                                    const usesWarmPalette = isCurved || isHanging
                                    const moduleAccentClassName = usesWarmPalette
                                      ? (row + column) % 2 === 0
                                        ? 'bg-orange-600'
                                        : 'bg-violet-700'
                                      : (row + column) % 2 === 0
                                        ? 'bg-lime-500'
                                        : 'bg-violet-900'

                                    return (
                                      <div
                                        key={`${row}-${column}`}
                                        className={`min-h-0 min-w-0 border border-white/75 ${moduleAccentClassName}`}
                                      />
                                    )
                                  })}
                                </div>

                                <svg
                                  className="pointer-events-none absolute inset-0 h-full w-full"
                                  viewBox="0 0 100 100"
                                  preserveAspectRatio="none"
                                  aria-hidden="true"
                                >
                                  <line x1="0" y1="0" x2="100" y2="100" stroke={previewOverlayStroke} strokeWidth="0.22" />
                                  <line x1="0" y1="100" x2="100" y2="0" stroke={previewOverlayStroke} strokeWidth="0.22" />
                                  <circle cx="50" cy="50" r="24" fill="none" stroke={previewOverlayStroke} strokeWidth="0.18" />
                                </svg>

                                <div className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-2 py-1 text-center text-[10px] leading-tight ${previewOverlayLabelClassName}`}>
                                  <div>{selectedModel?.name ?? 'Screen1'}</div>
                                  <div>W {totalResX} X H {totalResY}</div>
                                  <div>W {assembledWidthM.toFixed(2)}(m) X H {assembledHeightM.toFixed(2)}(m)</div>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                        {selectedModel ? (
                          <div className="absolute -bottom-4 right-0 border border-zinc-300 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
                            {selectedModel.depthM} m
                          </div>
                        ) : null}
                      </div>

                      <div>
                        <h3 className="text-2xl font-semibold tracking-tight">{selectedModel?.name ?? 'LED ekranas'}</h3>
                        <p className="mt-2 text-sm leading-6 text-zinc-500">
                          {hasCabinets
                            ? 'Pasirinktas modelis rodo savo rezoliuciją, fizinius matmenis, svorį, galią ir lenkimo ribas.'
                            : 'Įveskite modulių kiekį plotyje ir aukštyje, kad pamatytumėte skaičiavimą.'}
                        </p>
                      </div>

                      <div className="w-full rounded-[1.8rem] border border-zinc-200 bg-zinc-50 p-4 shadow-sm">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <div className="text-xs uppercase tracking-[0.18em] text-zinc-400">Skaičiavimo rezultatai</div>
                            <div className="mt-1 text-sm font-semibold text-zinc-800">
                              {isAdmin ? 'Surinkto ekrano rodikliai' : 'Pagrindiniai rezultatai vartotojui'}
                            </div>
                          </div>
                        </div>

                        {isAdmin ? (
                          <>
                            <div className="grid w-full grid-cols-2 gap-3 text-left sm:grid-cols-3 xl:grid-cols-4">
                              <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
                                <div className="text-xs text-zinc-500">Kabinetai</div>
                                <div className="mt-1 font-semibold">{cabinetsWide} × {cabinetsHigh} = {totalCabinets}</div>
                              </div>
                              <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
                                <div className="text-xs text-zinc-500">Plotis</div>
                                <div className="mt-1 font-semibold">{formatMeters(assembledWidthM)}</div>
                              </div>
                              <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
                                <div className="text-xs text-zinc-500">Aukštis</div>
                                <div className="mt-1 font-semibold">{formatMeters(assembledHeightM)}</div>
                              </div>
                              <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
                                <div className="text-xs text-zinc-500">Gylis</div>
                                <div className="mt-1 font-semibold">{formatValue(selectedModel?.depthM ?? '-', 'm')}</div>
                              </div>
                              <div className="rounded-2xl border border-zinc-300 bg-zinc-100 p-3 shadow-sm">
                                <div className="text-xs text-zinc-500">Bendra galia</div>
                                <div className="mt-1 text-base font-semibold">{(totalPowerW / 1000).toFixed(2)} kW</div>
                              </div>
                              <div className="rounded-2xl border border-zinc-300 bg-zinc-100 p-3 shadow-sm">
                                <div className="text-xs text-zinc-500">Ekrano svoris</div>
                                <div className="mt-1 text-base font-semibold">{totalWeightKg.toFixed(1)} kg</div>
                                {isHanging ? (
                                  <div className="mt-1 text-[11px] leading-4 text-zinc-500">
                                    Svorių pasiskirstymas, kai keltuvai išdėstyti vienodu atstumu per visą ekraną.
                                  </div>
                                ) : null}
                              </div>
                              {isHanging ? (
                                <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
                                  <div className="text-xs text-zinc-500">Rėmų vienetai</div>
                                  <div className="mt-1 font-semibold">{frameSegmentsAcrossWidth} vnt.</div>
                                  <div className="mt-1 text-xs text-zinc-500">{frameTypeLabel}</div>
                                </div>
                              ) : null}
                              {isHanging ? (
                                <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
                                  <div className="text-xs text-zinc-500">Rėmo svoris</div>
                                  <div className="mt-1 font-semibold">{totalFrameWeightKg.toFixed(1)} kg</div>
                                  <div className="mt-1 text-xs text-zinc-500">
                                    {frameSpanM > 0
                                      ? `${frameSegmentsAcrossWidth} × ${frameTypeLabel}`
                                      : 'Rėmo svoris nenurodytas'}
                                  </div>
                                </div>
                              ) : null}
                              {isHanging ? (
                                <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
                                  <div className="text-xs text-zinc-500">Santvaros svoris</div>
                                  <div className="mt-1 font-semibold">{trussWeightKg.toFixed(1)} kg</div>
                                  <div className="mt-1 text-xs text-zinc-500">{trussLengthM} m = {trussSegmentCount} × {selectedTrussOption.label}</div>
                                </div>
                              ) : null}
                              {isHanging ? (
                                <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
                                  <div className="text-xs text-zinc-500">Steelflex svoris</div>
                                  <div className="mt-1 font-semibold">{totalSteelflexWeightKg.toFixed(1)} kg</div>
                                  <div className="mt-1 text-xs text-zinc-500">{steelflexCount} × {selectedSteelflexOption.label}</div>
                                </div>
                              ) : null}
                              {isHanging ? (
                                <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
                                  <div className="text-xs text-zinc-500">Shackle svoris</div>
                                  <div className="mt-1 font-semibold">{totalShackleWeightKg.toFixed(1)} kg</div>
                                  <div className="mt-1 text-xs text-zinc-500">{shackleCount} vnt. pagal 0.5 m rėmus</div>
                                </div>
                              ) : null}
                              {isHanging ? (
                                <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
                                  <div className="text-xs text-zinc-500">Kabinam bendrą svorį</div>
                                  <div className="mt-1 font-semibold">{totalSupportedWeightKg.toFixed(1)} kg</div>
                                  <div className="mt-1 text-[11px] leading-4 text-zinc-500">
                                    Svorių pasiskirstymas, kai keltuvai išdėstyti vienodu atstumu per visą ekraną.
                                  </div>
                                </div>
                              ) : null}
                              {isHanging ? (
                                <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
                                  <div className="text-xs text-zinc-500">Taškų kiekis</div>
                                  <div className="mt-1 font-semibold">{suspensionPointCount}</div>
                                </div>
                              ) : null}
                              <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
                                <div className="text-xs text-zinc-500">Galutinė raiška</div>
                                <div className="mt-1 font-semibold">{totalResX} × {totalResY}</div>
                              </div>
                            </div>

                            {isHanging ? (
                              <div className="mt-3 rounded-[1.5rem] border border-zinc-200 bg-white p-4 shadow-sm">
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <div className="text-xs uppercase tracking-[0.16em] text-zinc-400">Apkrovos pagal taškus</div>
                                    <div className="mt-1 text-sm font-semibold text-zinc-800">{distribution.modeLabel}</div>
                                  </div>
                                  <div className="text-xs text-zinc-500">Bendras svoris: {totalSupportedWeightKg.toFixed(1)} kg</div>
                                </div>
                                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                  {pointLoadsKg.map((point) => (
                                    <div key={point.index} className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                                      <div className="text-xs uppercase tracking-[0.16em] text-zinc-400">Taškas {point.index}</div>
                                      <div className="mt-2 text-sm font-semibold text-zinc-800">{point.loadKg.toFixed(1)} kg</div>
                                      <div className="mt-1 text-xs text-zinc-500">{(point.factor * 100).toFixed(1)}% apkrovos</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <div className="grid w-full grid-cols-2 gap-3 text-left sm:grid-cols-4">
                            <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
                              <div className="text-xs text-zinc-500">Dydis</div>
                              <div className="mt-1 font-semibold">{formatMeters(assembledWidthM)} × {formatMeters(assembledHeightM)}</div>
                            </div>
                            <div className="rounded-2xl border border-zinc-300 bg-zinc-100 p-3 shadow-sm">
                              <div className="text-xs text-zinc-500">Svoris</div>
                              <div className="mt-1 font-semibold">{(isHanging ? totalSupportedWeightKg : totalWeightKg).toFixed(1)} kg</div>
                              {isHanging ? (
                                <div className="mt-1 text-[11px] leading-4 text-zinc-500">
                                  Svorių pasiskirstymas, kai keltuvai išdėstyti vienodu atstumu per visą ekraną.
                                </div>
                              ) : null}
                            </div>
                            <div className="rounded-2xl border border-zinc-300 bg-zinc-100 p-3 shadow-sm">
                              <div className="text-xs text-zinc-500">Galia</div>
                              <div className="mt-1 font-semibold">{(totalPowerW / 1000).toFixed(2)} kW</div>
                            </div>
                            <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
                              <div className="text-xs text-zinc-500">Rezoliucija</div>
                              <div className="mt-1 font-semibold">{totalResX} × {totalResY}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {isAdmin ? (
                <div className="flex justify-end rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
                  <button
                    type="button"
                    className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => void exportPreviewAsPng()}
                    disabled={!hasCabinets || isExportingPng}
                  >
                    {isExportingPng ? 'Eksportuoja...' : 'Eksportuoti PNG'}
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto bg-white p-4 lg:p-5">
            <div className="flex h-full flex-col gap-4 pr-1">
              <div>
                <h2 className="text-lg font-semibold">{isAdmin ? 'Nustatymai' : 'Vartotojo langas'}</h2>
                <p className="text-sm text-zinc-500">
                  {isAdmin ? 'Pasirinkite modelį ir valdykite duomenų failą' : 'Pasirinkite modelį ir atlikite LED ekrano skaičiavimą'}
                </p>
              </div>

              {isAdmin ? (
                <section className="rounded-[1.6rem] border border-zinc-200 bg-zinc-50 p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">Duomenų bazė</h3>
                    <button
                      type="button"
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 transition hover:bg-zinc-100"
                      onClick={() => setIsDataSectionCollapsed((current) => !current)}
                      aria-expanded={!isDataSectionCollapsed}
                      aria-label={isDataSectionCollapsed ? 'Išskleisti duomenų bazę' : 'Suskleisti duomenų bazę'}
                    >
                      <span className={`text-sm transition-transform ${isDataSectionCollapsed ? 'rotate-0' : 'rotate-180'}`}>
                        ▼
                      </span>
                    </button>
                  </div>
                  <div className={`${isDataSectionCollapsed ? 'mt-0 hidden' : 'mt-3 space-y-3'}`}>
                    <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-600 shadow-sm">
                      <div className="text-xs uppercase tracking-[0.18em] text-zinc-400">Statusas</div>
                      <div className="mt-1 font-medium text-zinc-800">{statusMessage}</div>
                    </div>
                    <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-600 shadow-sm">
                      <div className="text-xs uppercase tracking-[0.18em] text-zinc-400">CSV failas</div>
                      <div className="mt-1 break-all text-xs leading-5">{dataFilePath || 'Kelias bus parodytas po įkėlimo'}</div>
                    </div>
                    {errorMessage ? (
                      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">
                        {errorMessage}
                      </div>
                    ) : null}
                    <div className="grid grid-cols-1 gap-3">
                      <button
                        type="button"
                        className="rounded-2xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold transition hover:bg-zinc-100"
                        onClick={() => void refreshLedData()}
                      >
                        Atnaujinti
                      </button>
                    </div>
                  </div>
                </section>
              ) : null}

              <section className="rounded-[1.6rem] border border-zinc-200 bg-zinc-50 p-3 shadow-sm">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">Pasirinkimas</h3>
                <div className="relative">
                  <select
                    className="w-full appearance-none rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 pr-11 text-sm shadow-sm outline-none transition focus:border-zinc-400"
                    value={selectedModel?.name ?? ''}
                    onChange={(event) => setSelectedModelName(event.target.value)}
                    disabled={isLoading || models.length === 0}
                  >
                    {models.map((model) => (
                      <option key={model.name} value={model.name}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-zinc-700">▼</span>
                </div>
              </section>

              <section className="rounded-[1.6rem] border border-zinc-200 bg-zinc-50 p-3 shadow-sm">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">Skaičiavimas</h3>
                <div className="space-y-3">
                  <div className="rounded-2xl border border-zinc-200 bg-white p-2.5 shadow-sm">
                    <div className="mb-2 text-xs uppercase tracking-[0.16em] text-zinc-400">Montavimo būdas</div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${mountingMode === 'statom' ? 'bg-zinc-900 text-white' : 'border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50'}`}
                        onClick={() => setMountingMode('statom')}
                      >
                        Statom
                      </button>
                      <button
                        type="button"
                        className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${mountingMode === 'kabinam' ? 'bg-zinc-900 text-white' : 'border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50'}`}
                        onClick={() => setMountingMode('kabinam')}
                      >
                        Kabinam
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <div className="rounded-2xl border border-zinc-200 bg-white p-2.5 shadow-sm">
                      <div className="mb-2 text-xs uppercase tracking-[0.16em] text-zinc-400">Norimas plotis</div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="shrink-0 rounded-xl border border-zinc-200 px-3 py-1.5 text-sm font-semibold transition hover:bg-zinc-50"
                          onClick={() => adjustInputValue('width', -1)}
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          className="min-w-0 flex-1 rounded-xl border border-zinc-200 px-3 py-1.5 text-sm font-medium outline-none focus:border-zinc-400"
                          value={screenWidthInput}
                          onChange={(event) => setScreenWidthInput(event.target.value)}
                        />
                        <button
                          type="button"
                          className="shrink-0 rounded-xl border border-zinc-200 px-3 py-1.5 text-sm font-semibold transition hover:bg-zinc-50"
                          onClick={() => adjustInputValue('width', 1)}
                        >
                          +
                        </button>
                      </div>
                      <div className="mt-2 text-xs text-zinc-500">Modulių skaičius horizontaliai</div>
                      <div className="mt-1 text-[11px] text-zinc-400">1 modulis = {formatMeters(modelWidthM)}</div>
                    </div>

                    <div className="rounded-2xl border border-zinc-200 bg-white p-2.5 shadow-sm">
                      <div className="mb-2 text-xs uppercase tracking-[0.16em] text-zinc-400">Norimas aukštis</div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="shrink-0 rounded-xl border border-zinc-200 px-3 py-1.5 text-sm font-semibold transition hover:bg-zinc-50"
                          onClick={() => adjustInputValue('height', -1)}
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          className="min-w-0 flex-1 rounded-xl border border-zinc-200 px-3 py-1.5 text-sm font-medium outline-none focus:border-zinc-400"
                          value={screenHeightInput}
                          onChange={(event) => setScreenHeightInput(event.target.value)}
                        />
                        <button
                          type="button"
                          className="shrink-0 rounded-xl border border-zinc-200 px-3 py-1.5 text-sm font-semibold transition hover:bg-zinc-50"
                          onClick={() => adjustInputValue('height', 1)}
                        >
                          +
                        </button>
                      </div>
                      <div className="mt-2 text-xs text-zinc-500">Modulių skaičius vertikaliai</div>
                      <div className="mt-1 text-[11px] text-zinc-400">1 modulis = {formatMeters(modelHeightM)}</div>
                    </div>

                    {isHanging ? (
                      <>
                        <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
                          <div className="mb-2 text-xs uppercase tracking-[0.16em] text-zinc-400">Pakabinimo taškai</div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="shrink-0 rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold transition hover:bg-zinc-50"
                              onClick={() => setPointCountInput(String(Math.max(2, suspensionPointCount - 1)))}
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min="2"
                              step="1"
                              className="min-w-0 flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium outline-none focus:border-zinc-400"
                              value={pointCountInput}
                              onChange={(event) => setPointCountInput(event.target.value)}
                            />
                            <button
                              type="button"
                              className="shrink-0 rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold transition hover:bg-zinc-50"
                              onClick={() => setPointCountInput(String(suspensionPointCount + 1))}
                            >
                              +
                            </button>
                          </div>
                          <div className="mt-2 text-xs text-zinc-500">Galima rinktis nuo 2 iki 8 ir daugiau</div>
                          <div className="mt-1 text-[11px] text-zinc-400">{distribution.modeLabel}</div>
                        </div>

                        <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
                          <div className="mb-2 text-xs uppercase tracking-[0.16em] text-zinc-400">Santvara</div>
                          <div className="relative">
                            <select
                              className="w-full appearance-none rounded-xl border border-zinc-200 bg-white px-3 py-2 pr-10 text-sm font-medium outline-none transition focus:border-zinc-400"
                              value={selectedTruss}
                              onChange={(event) => setSelectedTruss(event.target.value)}
                            >
                              {trussOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-zinc-700">▼</span>
                          </div>
                          <div className="mt-2 text-xs text-zinc-500">Pasirinkite santvaros modelį</div>
                          <div className="mt-1 text-[11px] text-zinc-400">{selectedTrussUnitWeightKg.toFixed(2)} kg / segmentą</div>
                        </div>

                        <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
                          <div className="mb-2 text-xs uppercase tracking-[0.16em] text-zinc-400">Santvaros ilgis metrais</div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="shrink-0 rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold transition hover:bg-zinc-50"
                              onClick={() => adjustInputValue('trussLength', -1)}
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              className="min-w-0 flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium outline-none focus:border-zinc-400"
                              value={trussLengthInput}
                              onChange={(event) => handleTrussLengthInputChange(event.target.value)}
                            />
                            <button
                              type="button"
                              className="shrink-0 rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold transition hover:bg-zinc-50"
                              onClick={() => adjustInputValue('trussLength', 1)}
                            >
                              +
                            </button>
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-3 text-xs text-zinc-500">
                            <span>Apačioje rodoma, kiek tai yra santvaros vienetų</span>
                            <button
                              type="button"
                              className="rounded-lg border border-zinc-200 px-2 py-1 text-[11px] font-medium text-zinc-700 transition hover:bg-zinc-50"
                              onClick={resetTrussLengthToScreenWidth}
                            >
                              Pagal ekrano plotį
                            </button>
                          </div>
                          <div className="mt-1 text-[11px] text-zinc-400">{trussLengthM} m = {trussSegmentCount} vnt. po {(selectedTrussOption.spanM ?? 0).toFixed(0)} m</div>
                        </div>

                        <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
                          <div className="mb-2 text-xs uppercase tracking-[0.16em] text-zinc-400">Steelflex</div>
                          <div className="relative">
                            <select
                              className="w-full appearance-none rounded-xl border border-zinc-200 bg-white px-3 py-2 pr-10 text-sm font-medium outline-none transition focus:border-zinc-400"
                              value={selectedSteelflex}
                              onChange={(event) => setSelectedSteelflex(event.target.value)}
                            >
                              {steelflexOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-zinc-700">▼</span>
                          </div>
                          <div className="mt-2 text-xs text-zinc-500">Į kiekvieną 0.5 m rėmą eina 1 steel</div>
                          <div className="mt-1 text-[11px] text-zinc-400">{selectedSteelflexUnitWeightKg.toFixed(1)} kg / vnt.</div>
                        </div>

                        <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
                          <div className="mb-2 text-xs uppercase tracking-[0.16em] text-zinc-400">Shackle</div>
                          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-800">
                            Automatiškai: {shackleCount} vnt.
                          </div>
                          <div className="mt-2 text-xs text-zinc-500">Į kiekvieną 0.5 m rėmą eina 1 shackle</div>
                          <div className="mt-1 text-[11px] text-zinc-400">{selectedShackleUnitWeightKg.toFixed(1)} kg / vnt.</div>
                        </div>
                      </>
                    ) : null}
                  </div>

                </div>
              </section>

              <section className="rounded-[1.6rem] border border-zinc-200 bg-zinc-50 p-3 shadow-sm">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">Vieno modulio parametrai</h3>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 shadow-sm">
                    <div className="text-xs uppercase tracking-[0.16em] text-zinc-400">Lankstumas</div>
                    <div className="mt-1.5 text-sm font-semibold text-zinc-800">{canBend ? 'Gali lenktis' : 'Nesilenkia'}</div>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 shadow-sm">
                    <div className="text-xs uppercase tracking-[0.16em] text-zinc-400">Lenkimo kampai</div>
                    <div className="mt-1.5 text-sm font-semibold text-zinc-800">{bendRangeLabel}</div>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 shadow-sm">
                    <div className="text-xs uppercase tracking-[0.16em] text-zinc-400">Rėmo aukštis</div>
                    <div className="mt-1.5 text-sm font-semibold text-zinc-800">{frameHeightRangeLabel}</div>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 shadow-sm">
                    <div className="text-xs uppercase tracking-[0.16em] text-zinc-400">Gylis</div>
                    <div className="mt-1.5 text-sm font-semibold text-zinc-800">{formatModuleDimension(selectedModel?.depthM ?? '-')}</div>
                  </div>
                  {parameterCards.map((card) => (
                    <div key={card.key} className="rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 shadow-sm">
                      <div className="text-xs uppercase tracking-[0.16em] text-zinc-400">{card.label}</div>
                      <div className="mt-1.5 text-sm font-semibold text-zinc-800">
                        {formatModuleParameterValue(card.key, selectedModel?.[card.key] ?? '-', card.unit)}
                      </div>
                    </div>
                  ))}
                  {isAdmin
                    ? parameterRows.map((item) => (
                      <div key={item.key} className="rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 shadow-sm">
                        <div className="text-xs uppercase tracking-[0.16em] text-zinc-400">{item.label}</div>
                        <div className="mt-1.5 text-sm font-semibold text-zinc-800">
                          {item.unit === 'm'
                            ? formatModuleDimension(selectedModel?.[item.key] ?? '-')
                            : formatValue(selectedModel?.[item.key] ?? '-', item.unit)}
                        </div>
                      </div>
                    ))
                    : null}
                </div>
              </section>

              {isAdmin ? (
                <section className="rounded-[1.8rem] border border-zinc-200 bg-zinc-50 p-4 shadow-sm">
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">Matmenys</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
                      <div className="text-xs uppercase tracking-[0.16em] text-zinc-400">Plotis × aukštis</div>
                      <div className="mt-2 text-sm font-semibold text-zinc-800">{formatMeters(assembledWidthM)} × {formatMeters(assembledHeightM)}</div>
                    </div>
                    <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
                      <div className="text-xs uppercase tracking-[0.16em] text-zinc-400">Vaizdo tipas</div>
                      <div className="mt-2 text-sm font-semibold text-zinc-800">
                        {isTransparent ? 'Transparent' : isCurved ? 'Curved' : 'Flat'}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
                      <div className="text-xs uppercase tracking-[0.16em] text-zinc-400">Tankis</div>
                      <div className="mt-2 text-sm font-semibold text-zinc-800">{pixelPitchX} × {pixelPitchY}</div>
                    </div>
                    <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
                      <div className="text-xs uppercase tracking-[0.16em] text-zinc-400">Gylis</div>
                      <div className="mt-2 text-sm font-semibold text-zinc-800">{parsedDepth.toFixed(3)} m</div>
                    </div>
                  </div>
                </section>
              ) : null}
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  )
}

export default App

