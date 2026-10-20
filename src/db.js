import mysql from 'mysql2/promise';
import config from './config.js';

const { host, port, user, password, database, connectionLimit } = config.db;

const pool = mysql.createPool({
  host,
  port,
  user,
  password,
  database,
  waitForConnections: true,
  connectionLimit,
  charset: 'utf8mb4',
});

function escapeIdentifier(name) {
  return '`' + String(name).replace(/`/g, '``') + '`';
}

export async function initDatabase() {
  const admin = await mysql.createConnection({ host, port, user, password, charset: 'utf8mb4' });
  try {
    await admin.query(
      `CREATE DATABASE IF NOT EXISTS ${escapeIdentifier(database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await admin.end();
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      openid VARCHAR(64) NOT NULL,
      unionid VARCHAR(64) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_login_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (openid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS game_records (
      openid VARCHAR(64) NOT NULL,
      date CHAR(10) NOT NULL,
      visits INT UNSIGNED NOT NULL DEFAULT 0,
      plays INT UNSIGNED NOT NULL DEFAULT 0,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (openid, date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  console.log('[db] MySQL 初始化完成');
}

export async function pingDatabase(timeoutMs = 3000) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('数据库连接超时')), timeoutMs);
  });

  try {
    await Promise.race([pool.query('SELECT 1'), timeout]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export default pool;
