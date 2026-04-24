import { createHash } from 'node:crypto'
import sqlite from 'node:sqlite'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const { DatabaseSync } = sqlite

export const passwordHashPrefix = 'sha256:'
export const minimumPasswordLength = 6
export const defaultUsers = [
  {
    username: 'admin',
    passwordHash: 'sha256:8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918',
    role: 'admin',
  },
]

export function normalizeUsername(value) {
  return String(value ?? '').trim().toLowerCase()
}

export function isValidRole(value) {
  return value === 'admin' || value === 'user'
}

export function isPasswordHash(value) {
  return typeof value === 'string' && value.startsWith(passwordHashPrefix) && value.length > passwordHashPrefix.length
}

export function hashPassword(password) {
  const passwordHash = createHash('sha256').update(String(password)).digest('hex')
  return `${passwordHashPrefix}${passwordHash}`
}

export function verifyPassword(user, password) {
  if (!isPasswordHash(user?.passwordHash)) {
    return user?.passwordHash === password
  }

  return user.passwordHash === hashPassword(password)
}

function parseCsvLine(line) {
  const values = []
  let currentValue = ''
  let isInsideQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const currentCharacter = line[index]

    if (currentCharacter === '"') {
      const nextCharacter = line[index + 1]

      if (isInsideQuotes && nextCharacter === '"') {
        currentValue += '"'
        index += 1
        continue
      }

      isInsideQuotes = !isInsideQuotes
      continue
    }

    if (currentCharacter === ',' && !isInsideQuotes) {
      values.push(currentValue.trim())
      currentValue = ''
      continue
    }

    currentValue += currentCharacter
  }

  values.push(currentValue.trim())
  return values
}

function sanitizeUsers(users) {
  const normalizedUsers = []
  const seenUsernames = new Set()

  for (const user of users) {
    if (!user || typeof user !== 'object') {
      continue
    }

    const username = normalizeUsername(user.username)
    const passwordHash = typeof user.passwordHash === 'string'
      ? user.passwordHash.trim()
      : typeof user.password === 'string'
        ? user.password.trim()
        : ''
    const role = isValidRole(user.role) ? user.role : 'user'

    if (!username || !passwordHash || seenUsernames.has(username)) {
      continue
    }

    normalizedUsers.push({ username, passwordHash, role })
    seenUsernames.add(username)
  }

  if (!normalizedUsers.some((user) => user.role === 'admin')) {
    for (const defaultUser of defaultUsers) {
      if (seenUsernames.has(defaultUser.username)) {
        continue
      }

      normalizedUsers.unshift({ ...defaultUser })
      seenUsernames.add(defaultUser.username)
    }
  }

  return normalizedUsers.length > 0 ? normalizedUsers : [...defaultUsers]
}

function parseUsersCsv(text) {
  const userCsvHeaders = ['username', 'passwordHash', 'role']
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return [...defaultUsers]
  }

  const headers = parseCsvLine(lines[0])

  if (headers.join('|') !== userCsvHeaders.join('|')) {
    throw new Error('Vartotojų CSV antraštės turi būti: username,passwordHash,role')
  }

  return sanitizeUsers(
    lines.slice(1).map((line) => {
      const [username = '', passwordHash = '', role = 'user'] = parseCsvLine(line)
      return { username, passwordHash, role }
    }),
  )
}

async function ensureParentDirectory(filePath) {
  await mkdir(path.dirname(filePath), { recursive: true })
}

function createDatabase(databasePath) {
  const database = new DatabaseSync(databasePath)

  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'user'))
    );
  `)

  return database
}

function readUsersFromDatabase(database) {
  const statement = database.prepare(`
    SELECT username, password_hash, role
    FROM users
    ORDER BY username COLLATE NOCASE
  `)

  return statement.all().map((row) => ({
    username: row.username,
    passwordHash: row.password_hash,
    role: row.role,
  }))
}

function replaceUsersInDatabase(database, users) {
  const deleteStatement = database.prepare('DELETE FROM users')
  const insertStatement = database.prepare(`
    INSERT INTO users (username, password_hash, role)
    VALUES (?, ?, ?)
  `)

  database.exec('BEGIN')

  try {
    deleteStatement.run()

    for (const user of users) {
      insertStatement.run(user.username, user.passwordHash, user.role)
    }

    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

function areUsersEqual(leftUsers, rightUsers) {
  if (leftUsers.length !== rightUsers.length) {
    return false
  }

  return leftUsers.every((user, index) => {
    const nextUser = rightUsers[index]
    return nextUser
      && user.username === nextUser.username
      && user.passwordHash === nextUser.passwordHash
      && user.role === nextUser.role
  })
}

async function loadLegacyUsers(legacyCsvPath) {
  if (!legacyCsvPath) {
    return null
  }

  try {
    const csvText = await readFile(legacyCsvPath, 'utf8')
    return parseUsersCsv(csvText)
  } catch {
    return null
  }
}

export async function loadUsersFromDatabase(databasePath, legacyCsvPath) {
  await ensureParentDirectory(databasePath)
  const legacyUsers = await loadLegacyUsers(legacyCsvPath)
  const database = createDatabase(databasePath)

  try {
    let users = readUsersFromDatabase(database)

    if (users.length === 0) {
      const seededUsers = sanitizeUsers(legacyUsers ?? defaultUsers)
      replaceUsersInDatabase(database, seededUsers)
      users = readUsersFromDatabase(database)
    } else {
      const normalizedUsers = sanitizeUsers(users)

      if (!areUsersEqual(users, normalizedUsers)) {
        replaceUsersInDatabase(database, normalizedUsers)
        users = readUsersFromDatabase(database)
      }
    }

    return {
      users,
      usersFilePath: databasePath,
    }
  } finally {
    database.close()
  }
}

export async function saveUsersToDatabase(databasePath, users, legacyCsvPath) {
  await loadUsersFromDatabase(databasePath, legacyCsvPath)
  const database = createDatabase(databasePath)

  try {
    const normalizedUsers = sanitizeUsers(users)
    replaceUsersInDatabase(database, normalizedUsers)

    return {
      users: readUsersFromDatabase(database),
      usersFilePath: databasePath,
    }
  } finally {
    database.close()
  }
}

export async function openUsersDatabase(databasePath, legacyCsvPath) {
  const { usersFilePath } = await loadUsersFromDatabase(databasePath, legacyCsvPath)

  return {
    usersFilePath,
  }
}