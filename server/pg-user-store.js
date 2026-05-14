import pg from 'pg'
import { defaultUsers, sanitizeUsers } from '../electron/user-store.js'

const { Pool } = pg

let pool = null

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    })
  }

  return pool
}

async function ensureTable() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'user'))
    )
  `)
}

function rowsToUsers(rows) {
  return rows.map((row) => ({
    username: row.username,
    passwordHash: row.password_hash,
    role: row.role,
  }))
}

async function queryUsers(client) {
  const result = await (client || getPool()).query(
    'SELECT username, password_hash, role FROM users ORDER BY username',
  )

  return rowsToUsers(result.rows)
}

export async function loadUsersFromDatabase(_databasePath, _legacyCsvPath) {
  await ensureTable()

  let users = await queryUsers()

  if (users.length === 0) {
    const seeded = sanitizeUsers([])
    const client = await getPool().connect()

    try {
      await client.query('BEGIN')

      for (const user of seeded) {
        await client.query(
          'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [user.username, user.passwordHash, user.role],
        )
      }

      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }

    users = await queryUsers()
  }

  return { users, usersFilePath: 'postgresql' }
}

export async function saveUsersToDatabase(_databasePath, users, _legacyCsvPath) {
  await ensureTable()

  const normalizedUsers = sanitizeUsers(users)
  const client = await getPool().connect()

  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM users')

    for (const user of normalizedUsers) {
      await client.query(
        'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)',
        [user.username, user.passwordHash, user.role],
      )
    }

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }

  const savedUsers = await queryUsers()

  return { users: savedUsers, usersFilePath: 'postgresql' }
}
