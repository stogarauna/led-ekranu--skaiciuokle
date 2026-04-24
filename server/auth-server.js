import { createHmac } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { URL } from 'node:url'
import {
  hashPassword,
  isValidRole,
  loadUsersFromDatabase,
  minimumPasswordLength,
  normalizeUsername,
  saveUsersToDatabase,
  verifyPassword,
} from '../electron/user-store.js'

const resolvedPort = Number.parseInt(process.env.PORT ?? process.env.AUTH_SERVER_PORT ?? '3001', 10)
const port = Number.isFinite(resolvedPort) ? resolvedPort : 3001
const host = process.env.AUTH_SERVER_HOST || (process.env.RENDER || process.env.PORT ? '0.0.0.0' : '127.0.0.1')
const usersFilePath = process.env.USERS_DB_PATH || process.env.USERS_FILE_PATH || path.resolve(process.cwd(), 'data', 'users.db')
const legacyUsersCsvPath = process.env.LEGACY_USERS_CSV_PATH || path.resolve(process.cwd(), 'data', 'users.csv')
const tokenSecret = process.env.AUTH_TOKEN_SECRET || 'change-me-before-production'
const corsOrigin = process.env.AUTH_CORS_ORIGIN || '*'
const sessionLifetimeMs = 12 * 60 * 60 * 1000
const distDirectoryPath = path.resolve(process.cwd(), 'dist')
const staticContentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
}

function toClientUser(user) {
  return {
    username: user.username,
    passwordHash: '',
    role: user.role,
  }
}

function setCorsHeaders(response) {
  response.setHeader('Access-Control-Allow-Origin', corsOrigin)
  response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
}

function sendJson(response, statusCode, payload) {
  setCorsHeaders(response)
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

function sendNoContent(response) {
  setCorsHeaders(response)
  response.writeHead(204)
  response.end()
}

function sendFile(response, filePath, fileContents, method) {
  response.writeHead(200, {
    'Content-Type': staticContentTypes[path.extname(filePath)] || 'application/octet-stream',
  })

  if (method === 'HEAD') {
    response.end()
    return
  }

  response.end(fileContents)
}

async function tryServeStaticRequest(requestUrl, response, method) {
  const isHeadRequest = method === 'HEAD'

  if (method !== 'GET' && !isHeadRequest) {
    return false
  }

  const decodedPathname = decodeURIComponent(requestUrl.pathname)
  const relativePath = decodedPathname === '/'
    ? 'index.html'
    : decodedPathname.replace(/^\/+/, '')
  const candidatePath = path.resolve(distDirectoryPath, relativePath)

  if (!candidatePath.startsWith(distDirectoryPath)) {
    response.writeHead(403)
    response.end('Forbidden')
    return true
  }

  try {
    const directFile = await readFile(candidatePath)
    sendFile(response, candidatePath, directFile, method)
    return true
  } catch {
    if (path.extname(relativePath)) {
      return false
    }
  }

  try {
    const indexPath = path.join(distDirectoryPath, 'index.html')
    const indexFile = await readFile(indexPath)
    sendFile(response, indexPath, indexFile, method)
    return true
  } catch {
    return false
  }
}

async function readJsonBody(request) {
  const chunks = []

  for await (const chunk of request) {
    chunks.push(chunk)
  }

  if (chunks.length === 0) {
    return {}
  }

  const rawBody = Buffer.concat(chunks).toString('utf8').trim()
  return rawBody ? JSON.parse(rawBody) : {}
}

function createSessionToken(user) {
  const payload = Buffer.from(
    JSON.stringify({
      username: user.username,
      role: user.role,
      exp: Date.now() + sessionLifetimeMs,
    }),
  ).toString('base64url')
  const signature = createHmac('sha256', tokenSecret).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

function verifySessionToken(token) {
  if (!token || !token.includes('.')) {
    return null
  }

  const [payload, signature] = token.split('.', 2)
  const expectedSignature = createHmac('sha256', tokenSecret).update(payload).digest('base64url')

  if (signature !== expectedSignature) {
    return null
  }

  try {
    const parsedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))

    if (!parsedPayload?.username || !isValidRole(parsedPayload.role) || Number(parsedPayload.exp) <= Date.now()) {
      return null
    }

    return {
      username: normalizeUsername(parsedPayload.username),
      role: parsedPayload.role,
    }
  } catch {
    return null
  }
}

function readBearerToken(request) {
  const authorizationHeader = request.headers.authorization

  if (!authorizationHeader?.startsWith('Bearer ')) {
    return null
  }

  return authorizationHeader.slice('Bearer '.length).trim()
}

async function requireAdmin(request, response) {
  const session = verifySessionToken(readBearerToken(request))

  if (!session) {
    sendJson(response, 401, { message: 'Prisijungimo sesija negalioja arba baigėsi.' })
    return null
  }

  const { users } = await loadUsersFromDatabase(usersFilePath, legacyUsersCsvPath)
  const activeAdmin = users.find((user) => user.username === session.username)

  if (!activeAdmin || activeAdmin.role !== 'admin') {
    sendJson(response, 403, { message: 'Administratoriaus teisės nerastos.' })
    return null
  }

  return { activeAdmin, users }
}

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url || '/', `http://${request.headers.host || `127.0.0.1:${port}`}`)

    if (request.method === 'OPTIONS') {
      sendNoContent(response)
      return
    }

    if (requestUrl.pathname === '/api/health' && request.method === 'GET') {
      sendJson(response, 200, { status: 'ok', usersFilePath })
      return
    }

    if (requestUrl.pathname === '/api/auth/login' && request.method === 'POST') {
      const body = await readJsonBody(request)
      const username = normalizeUsername(body.username)
      const password = typeof body.password === 'string' ? body.password : ''

      if (!username || !password) {
        sendJson(response, 400, { message: 'Įveskite vartotojo vardą ir slaptažodį.' })
        return
      }

      const { users } = await loadUsersFromDatabase(usersFilePath, legacyUsersCsvPath)
      const matchedUser = users.find((user) => user.username === username)

      if (!matchedUser || !verifyPassword(matchedUser, password)) {
        sendJson(response, 401, { message: 'Neteisingas vartotojo vardas arba slaptažodis.' })
        return
      }

      sendJson(response, 200, {
        user: toClientUser(matchedUser),
        token: createSessionToken(matchedUser),
        usersFilePath,
      })
      return
    }

    if (requestUrl.pathname === '/api/users' && request.method === 'GET') {
      const adminContext = await requireAdmin(request, response)

      if (!adminContext) {
        return
      }

      sendJson(response, 200, {
        users: adminContext.users.map(toClientUser),
        usersFilePath,
      })
      return
    }

    if (requestUrl.pathname === '/api/users' && request.method === 'POST') {
      const adminContext = await requireAdmin(request, response)

      if (!adminContext) {
        return
      }

      const body = await readJsonBody(request)
      const username = normalizeUsername(body.username)
      const password = typeof body.password === 'string' ? body.password : ''
      const role = isValidRole(body.role) ? body.role : 'user'

      if (!username) {
        sendJson(response, 400, { message: 'Įveskite vartotojo vardą.' })
        return
      }

      if (password.length < minimumPasswordLength) {
        sendJson(response, 400, { message: `Slaptažodis turi būti bent ${minimumPasswordLength} simbolių.` })
        return
      }

      if (adminContext.users.some((user) => user.username === username)) {
        sendJson(response, 409, { message: 'Toks vartotojas jau egzistuoja.' })
        return
      }

      const { users } = await saveUsersToDatabase(
        usersFilePath,
        [...adminContext.users, { username, passwordHash: hashPassword(password), role }],
        legacyUsersCsvPath,
      )

      sendJson(response, 201, {
        users: users.map(toClientUser),
        usersFilePath,
      })
      return
    }

    const deleteUserMatch = requestUrl.pathname.match(/^\/api\/users\/([^/]+)$/)

    if (deleteUserMatch && request.method === 'DELETE') {
      const adminContext = await requireAdmin(request, response)

      if (!adminContext) {
        return
      }

      const username = normalizeUsername(decodeURIComponent(deleteUserMatch[1]))
      const targetUser = adminContext.users.find((user) => user.username === username)

      if (!targetUser) {
        sendJson(response, 404, { message: 'Nepavyko rasti pasirinkto vartotojo.' })
        return
      }

      if (adminContext.activeAdmin.username === username) {
        sendJson(response, 400, { message: 'Prisijungusio vartotojo ištrinti negalima.' })
        return
      }

      const adminCount = adminContext.users.filter((user) => user.role === 'admin').length

      if (targetUser.role === 'admin' && adminCount <= 1) {
        sendJson(response, 400, { message: 'Turi likti bent vienas administratorius.' })
        return
      }

      const { users } = await saveUsersToDatabase(
        usersFilePath,
        adminContext.users.filter((user) => user.username !== username),
        legacyUsersCsvPath,
      )

      sendJson(response, 200, {
        users: users.map(toClientUser),
        usersFilePath,
      })
      return
    }

    if (await tryServeStaticRequest(requestUrl, response, request.method || 'GET')) {
      return
    }

    sendJson(response, 404, { message: 'Nerastas API maršrutas.' })
  } catch (error) {
    const message = error instanceof Error && error.message
      ? error.message
      : 'Nepavyko apdoroti užklausos.'

    sendJson(response, 500, { message })
  }
})

server.listen(port, host, () => {
  console.log(`Auth server listening on http://${host}:${port}`)
  console.log(`Users SQLite DB: ${usersFilePath}`)
})