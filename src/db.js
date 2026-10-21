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
  connectTimeout: 5000,
  charset: 'utf8mb4',
  dateStrings: true,
  supportBigNumbers: true,
  bigNumberStrings: true,
});

function escapeIdentifier(name) {
  return '`' + String(name).replace(/`/g, '``') + '`';
}

export async function initDatabase() {
  const admin = await mysql.createConnection({
    host,
    port,
    user,
    password,
    connectTimeout: 5000,
    charset: 'utf8mb4',
  });

  try {
    await admin.query(
      `CREATE DATABASE IF NOT EXISTS ${escapeIdentifier(database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } catch (err) {
    if (err.code === 'ER_DBACCESS_DENIED_ERROR' || err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.warn('[db] 无 CREATE DATABASE 权限，跳过自动建库（请确认数据库已存在）');
    } else {
      throw err;
    }
  } finally {
    await admin.end();
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      openid VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      nickname VARCHAR(16) COLLATE utf8mb4_unicode_ci NULL,
      status TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '1 active; 2 ranking banned; 3 account banned',
      nickname_updated_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      UNIQUE KEY uk_users_openid (openid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS challenge_daily_quotas (
      user_id BIGINT UNSIGNED NOT NULL,
      quota_date DATE NOT NULL,
      daily_limit SMALLINT UNSIGNED NOT NULL DEFAULT 10,
      used_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (user_id, quota_date),
      CONSTRAINT fk_quota_user FOREIGN KEY (user_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS challenge_sessions (
      id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      quota_date DATE NOT NULL,
      request_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      status TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '0 ongoing; 1 submitted; 2 expired; 3 abandoned',
      started_at DATETIME(3) NOT NULL,
      expires_at DATETIME(3) NOT NULL,
      submitted_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      UNIQUE KEY uk_session_user_request (user_id, request_id),
      UNIQUE KEY uk_session_user_id (user_id, id),
      KEY idx_session_quota (user_id, quota_date),
      CONSTRAINT fk_session_quota FOREIGN KEY (user_id, quota_date)
        REFERENCES challenge_daily_quotas (user_id, quota_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS challenge_attempts (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      total_time_ms INT UNSIGNED NOT NULL,
      reaction_time_ms INT UNSIGNED NOT NULL,
      brake_duration_ms INT UNSIGNED NOT NULL,
      entry_speed_milli_kmh INT UNSIGNED NOT NULL,
      max_brake_force_n INT UNSIGNED NOT NULL,
      braking_distance_mm INT UNSIGNED NULL,
      province_code VARCHAR(12) CHARACTER SET ascii COLLATE ascii_bin NULL,
      province_name VARCHAR(32) NULL,
      city_code VARCHAR(12) CHARACTER SET ascii COLLATE ascii_bin NULL,
      city_name VARCHAR(32) NULL,
      is_valid TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '1 valid; 0 invalidated',
      invalid_reason VARCHAR(255) NULL,
      publish_status TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '0 not eligible; 1 pending; 2 published; 3 declined',
      published_at DATETIME(3) NULL,
      rank_national_snapshot INT UNSIGNED NULL,
      rank_province_snapshot INT UNSIGNED NULL,
      rank_city_snapshot INT UNSIGNED NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      UNIQUE KEY uk_attempt_session (session_id),
      UNIQUE KEY uk_attempt_user_id (user_id, id),
      KEY idx_attempt_user_created (user_id, created_at),
      KEY idx_attempt_user_publish (user_id, publish_status, created_at),
      KEY idx_attempt_user_score (user_id, is_valid, total_time_ms, created_at),
      CONSTRAINT fk_attempt_session_user FOREIGN KEY (user_id, session_id)
        REFERENCES challenge_sessions (user_id, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_best_records (
      user_id BIGINT UNSIGNED NOT NULL,
      attempt_id BIGINT UNSIGNED NOT NULL,
      best_time_ms INT UNSIGNED NOT NULL,
      province_code VARCHAR(12) CHARACTER SET ascii COLLATE ascii_bin NULL,
      province_name VARCHAR(32) NULL,
      city_code VARCHAR(12) CHARACTER SET ascii COLLATE ascii_bin NULL,
      city_name VARCHAR(32) NULL,
      achieved_at DATETIME(3) NOT NULL,
      published_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (user_id),
      UNIQUE KEY uk_best_attempt (attempt_id),
      KEY idx_best_national (best_time_ms, achieved_at, user_id),
      KEY idx_best_province (province_code, best_time_ms, achieved_at, user_id),
      KEY idx_best_city (city_code, best_time_ms, achieved_at, user_id),
      CONSTRAINT fk_best_user FOREIGN KEY (user_id) REFERENCES users(id),
      CONSTRAINT fk_best_attempt_user FOREIGN KEY (user_id, attempt_id)
        REFERENCES challenge_attempts (user_id, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  console.log('[db] MySQL 初始化完成', new Date().toISOString());
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

export async function withTransaction(fn, retries = 3) {
  const connection = await pool.getConnection();
  try {
    for (let attempt = 0; ; attempt += 1) {
      await connection.beginTransaction();
      try {
        const result = await fn(connection);
        await connection.commit();
        return result;
      } catch (err) {
        await connection.rollback();
        if ((err.code === 'ER_LOCK_DEADLOCK' || err.errno === 1213) && attempt < retries - 1) {
          continue;
        }
        throw err;
      }
    }
  } finally {
    connection.release();
  }
}

export default pool;
