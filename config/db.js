import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config({ path: "./.env" });

const baseConfig = {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
};

const databaseName = process.env.DB_NAME || "expense_tracker";

let pool;

export function getPool() {
  if (!pool) {
    throw new Error("Database pool has not been initialized yet.");
  }

  return pool;
}

export async function initializeDatabase() {
  const bootstrapConnection = await mysql.createConnection(baseConfig);

  try {
    await bootstrapConnection.query(
      `CREATE DATABASE IF NOT EXISTS \`${databaseName}\``,
    );
  } finally {
    await bootstrapConnection.end();
  }

  pool = mysql.createPool({
    ...baseConfig,
    database: databaseName,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  await createSchema();
  await ensureDefaultList();
}

async function createSchema() {
  const db = getPool();

  await db.query(`
    CREATE TABLE IF NOT EXISTS expense_lists (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      description VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      list_id INT NOT NULL,
      description VARCHAR(255) NOT NULL,
      amount DECIMAL(10, 2) NOT NULL,
      category VARCHAR(100) NOT NULL DEFAULT 'General',
      expense_date DATE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_expenses_list_id (list_id),
      INDEX idx_expenses_date (expense_date),
      CONSTRAINT fk_expenses_list
        FOREIGN KEY (list_id) REFERENCES expense_lists(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);
}

async function ensureDefaultList() {
  const db = getPool();
  const [rows] = await db.query("SELECT id FROM expense_lists LIMIT 1");

  if (rows.length === 0) {
    await db.query(
      "INSERT INTO expense_lists (name, description) VALUES (?, ?)",
      ["Personal", "Default expense list"],
    );
  }
}

export async function connectDB() {
  await initializeDatabase();

  const connection = await getPool().getConnection();

  try {
    await connection.ping();
    console.log(`MySQL connected successfully to database "${databaseName}".`);
  } finally {
    connection.release();
  }
}
