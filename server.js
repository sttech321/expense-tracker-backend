import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDB, getPool } from "./config/db.js";

dotenv.config({ path: "./.env" });

const app = express();
const PORT = Number(process.env.PORT) || 5000;

app.use(cors());
app.use(express.json());

function toExpenseRow(row) {
  const expenseDate =
    row.expense_date instanceof Date
      ? [
          row.expense_date.getFullYear(),
          String(row.expense_date.getMonth() + 1).padStart(2, "0"),
          String(row.expense_date.getDate()).padStart(2, "0"),
        ].join("-")
      : row.expense_date;

  return {
    id: row.id,
    listId: row.list_id,
    description: row.description,
    amount: Number(row.amount),
    category: row.category,
    date: expenseDate,
  };
}

function parsePositiveAmount(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return Number(amount.toFixed(2));
}

app.get("/", (_req, res) => {
  res.json({
    message: "API is running",
  });
});

app.get("/health", async (_req, res) => {
  try {
    await getPool().query("SELECT 1 AS ok");
    res.json({
      status: "ok",
      database: "connected",
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      database: "disconnected",
      message: error.message,
    });
  }
});

app.get("/api/lists", async (_req, res) => {
  try {
    const [rows] = await getPool().query(`
      SELECT
        expense_lists.id,
        expense_lists.name,
        expense_lists.description,
        expense_lists.created_at,
        COUNT(expenses.id) AS expenseCount,
        COALESCE(SUM(expenses.amount), 0) AS totalAmount
      FROM expense_lists
      LEFT JOIN expenses ON expenses.list_id = expense_lists.id
      GROUP BY expense_lists.id
      ORDER BY expense_lists.created_at DESC, expense_lists.id DESC
    `);

    res.json(
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        expenseCount: Number(row.expenseCount),
        totalAmount: Number(row.totalAmount),
      })),
    );
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch expense lists." });
  }
});

app.post("/api/lists", async (req, res) => {
  const name = req.body?.name?.trim();
  const description = req.body?.description?.trim() || null;

  if (!name) {
    res.status(400).json({ message: "List name is required." });
    return;
  }

  try {
    const [result] = await getPool().query(
      "INSERT INTO expense_lists (name, description) VALUES (?, ?)",
      [name, description],
    );

    const [rows] = await getPool().query(
      "SELECT id, name, description FROM expense_lists WHERE id = ?",
      [result.insertId],
    );

    res.status(201).json({
      id: rows[0].id,
      name: rows[0].name,
      description: rows[0].description,
      expenseCount: 0,
      totalAmount: 0,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to create expense list." });
  }
});

app.get("/api/lists/:listId/expenses", async (req, res) => {
  const listId = Number.parseInt(req.params.listId, 10);

  if (!Number.isInteger(listId) || listId <= 0) {
    res.status(400).json({ message: "Invalid list id." });
    return;
  }

  try {
    const [lists] = await getPool().query(
      "SELECT id, name, description FROM expense_lists WHERE id = ?",
      [listId],
    );

    if (lists.length === 0) {
      res.status(404).json({ message: "Expense list not found." });
      return;
    }

    const [expenses] = await getPool().query(
      `
        SELECT id, list_id, description, amount, category, expense_date
        FROM expenses
        WHERE list_id = ?
        ORDER BY expense_date DESC, id DESC
      `,
      [listId],
    );

    res.json({
      list: lists[0],
      expenses: expenses.map(toExpenseRow),
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch expenses." });
  }
});

app.post("/api/lists/:listId/expenses", async (req, res) => {
  const listId = Number.parseInt(req.params.listId, 10);
  const description = req.body?.description?.trim();
  const amount = parsePositiveAmount(req.body?.amount);
  const category = req.body?.category?.trim() || "General";
  const date = req.body?.date;

  if (!Number.isInteger(listId) || listId <= 0) {
    res.status(400).json({ message: "Invalid list id." });
    return;
  }

  if (!description) {
    res.status(400).json({ message: "Description is required." });
    return;
  }

  if (amount === null) {
    res.status(400).json({ message: "Amount must be a positive number." });
    return;
  }

  if (!date) {
    res.status(400).json({ message: "Date is required." });
    return;
  }

  try {
    const [lists] = await getPool().query(
      "SELECT id FROM expense_lists WHERE id = ?",
      [listId],
    );

    if (lists.length === 0) {
      res.status(404).json({ message: "Expense list not found." });
      return;
    }

    const [result] = await getPool().query(
      `
        INSERT INTO expenses (list_id, description, amount, category, expense_date)
        VALUES (?, ?, ?, ?, ?)
      `,
      [listId, description, amount, category, date],
    );

    const [rows] = await getPool().query(
      `
        SELECT id, list_id, description, amount, category, expense_date
        FROM expenses
        WHERE id = ?
      `,
      [result.insertId],
    );

    res.status(201).json(toExpenseRow(rows[0]));
  } catch (error) {
    res.status(500).json({ message: "Failed to create expense." });
  }
});

app.put("/api/expenses/:expenseId", async (req, res) => {
  const expenseId = Number.parseInt(req.params.expenseId, 10);
  const description = req.body?.description?.trim();
  const amount = parsePositiveAmount(req.body?.amount);
  const category = req.body?.category?.trim() || "General";
  const date = req.body?.date;

  if (!Number.isInteger(expenseId) || expenseId <= 0) {
    res.status(400).json({ message: "Invalid expense id." });
    return;
  }

  if (!description) {
    res.status(400).json({ message: "Description is required." });
    return;
  }

  if (amount === null) {
    res.status(400).json({ message: "Amount must be a positive number." });
    return;
  }

  if (!date) {
    res.status(400).json({ message: "Date is required." });
    return;
  }

  try {
    const [result] = await getPool().query(
      `
        UPDATE expenses
        SET description = ?, amount = ?, category = ?, expense_date = ?
        WHERE id = ?
      `,
      [description, amount, category, date, expenseId],
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ message: "Expense not found." });
      return;
    }

    const [rows] = await getPool().query(
      `
        SELECT id, list_id, description, amount, category, expense_date
        FROM expenses
        WHERE id = ?
      `,
      [expenseId],
    );

    res.json(toExpenseRow(rows[0]));
  } catch (error) {
    res.status(500).json({ message: "Failed to update expense." });
  }
});

app.delete("/api/expenses/:expenseId", async (req, res) => {
  const expenseId = Number.parseInt(req.params.expenseId, 10);

  if (!Number.isInteger(expenseId) || expenseId <= 0) {
    res.status(400).json({ message: "Invalid expense id." });
    return;
  }

  try {
    const [result] = await getPool().query(
      "DELETE FROM expenses WHERE id = ?",
      [expenseId],
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ message: "Expense not found." });
      return;
    }

    res.json({ message: "Expense deleted successfully." });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete expense." });
  }
});

async function startServer() {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`Base URL: http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Database connection failed:", error.message);
    process.exit(1);
  }
}

startServer();
