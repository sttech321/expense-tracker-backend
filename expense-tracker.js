#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "data");
const dataFile = path.join(dataDir, "expenses.json");

function ensureStorage() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify([], null, 2));
  }
}

function readExpenses() {
  ensureStorage();

  const rawData = fs.readFileSync(dataFile, "utf-8");

  try {
    const parsedData = JSON.parse(rawData);
    return Array.isArray(parsedData) ? parsedData : [];
  } catch {
    console.error("Expense storage is corrupted. Reset data/expenses.json and try again.");
    process.exit(1);
  }
}

function writeExpenses(expenses) {
  ensureStorage();
  fs.writeFileSync(dataFile, JSON.stringify(expenses, null, 2));
}

function parseArgs(argv) {
  const command = argv[2];
  const options = {};

  for (let index = 3; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const nextToken = argv[index + 1];

    if (!nextToken || nextToken.startsWith("--")) {
      options[key] = true;
      continue;
    }

    options[key] = nextToken;
    index += 1;
  }

  return { command, options };
}

function getRequiredString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    console.error(`${fieldName} is required.`);
    process.exit(1);
  }

  return value.trim();
}

function getPositiveAmount(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    console.error("Amount must be a positive number.");
    process.exit(1);
  }

  return Number(amount.toFixed(2));
}

function getExpenseId(value) {
  const id = Number.parseInt(value, 10);

  if (!Number.isInteger(id) || id <= 0) {
    console.error("A valid expense ID is required.");
    process.exit(1);
  }

  return id;
}

function formatAmount(amount) {
  return `$${Number(amount).toFixed(2)}`;
}

function formatTable(expenses) {
  const rows = expenses.map((expense) => ({
    ID: String(expense.id),
    Date: expense.date,
    Description: expense.description,
    Amount: formatAmount(expense.amount),
  }));

  const headers = ["ID", "Date", "Description", "Amount"];
  const widths = headers.reduce((accumulator, header) => {
    const longestValue = rows.reduce((max, row) => {
      return Math.max(max, row[header].length);
    }, header.length);

    accumulator[header] = longestValue;
    return accumulator;
  }, {});

  const headerLine = headers
    .map((header) => header.padEnd(widths[header]))
    .join("  ");

  const separator = headers
    .map((header) => "-".repeat(widths[header]))
    .join("  ");

  const lines = rows.map((row) => {
    return headers.map((header) => row[header].padEnd(widths[header])).join("  ");
  });

  return [headerLine, separator, ...lines].join("\n");
}

function addExpense(options) {
  const description = getRequiredString(options.description, "Description");
  const amount = getPositiveAmount(options.amount);
  const expenses = readExpenses();
  const nextId = expenses.length > 0 ? Math.max(...expenses.map((expense) => expense.id)) + 1 : 1;

  const expense = {
    id: nextId,
    date: new Date().toISOString().slice(0, 10),
    description,
    amount,
  };

  expenses.push(expense);
  writeExpenses(expenses);

  console.log(`Expense added successfully (ID: ${expense.id})`);
}

function updateExpense(options) {
  const id = getExpenseId(options.id);
  const expenses = readExpenses();
  const expense = expenses.find((item) => item.id === id);

  if (!expense) {
    console.error(`Expense with ID ${id} not found.`);
    process.exit(1);
  }

  if (options.description !== undefined) {
    expense.description = getRequiredString(options.description, "Description");
  }

  if (options.amount !== undefined) {
    expense.amount = getPositiveAmount(options.amount);
  }

  if (options.description === undefined && options.amount === undefined) {
    console.error("Provide --description and/or --amount to update the expense.");
    process.exit(1);
  }

  writeExpenses(expenses);
  console.log("Expense updated successfully");
}

function deleteExpense(options) {
  const id = getExpenseId(options.id);
  const expenses = readExpenses();
  const filteredExpenses = expenses.filter((expense) => expense.id !== id);

  if (filteredExpenses.length === expenses.length) {
    console.error(`Expense with ID ${id} not found.`);
    process.exit(1);
  }

  writeExpenses(filteredExpenses);
  console.log("Expense deleted successfully");
}

function listExpenses() {
  const expenses = readExpenses();

  if (expenses.length === 0) {
    console.log("No expenses found.");
    return;
  }

  console.log(formatTable(expenses));
}

function summarizeExpenses(options) {
  const expenses = readExpenses();
  const monthValue = options.month;

  if (monthValue === undefined) {
    const total = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
    console.log(`Total expenses: ${formatAmount(total)}`);
    return;
  }

  const month = Number.parseInt(monthValue, 10);
  const currentYear = new Date().getFullYear();

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    console.error("Month must be a number between 1 and 12.");
    process.exit(1);
  }

  const monthlyExpenses = expenses.filter((expense) => {
    const expenseDate = new Date(expense.date);
    return expenseDate.getFullYear() === currentYear && expenseDate.getMonth() + 1 === month;
  });

  const total = monthlyExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const monthName = new Date(currentYear, month - 1, 1).toLocaleString("en-US", {
    month: "long",
  });

  console.log(`Total expenses for ${monthName}: ${formatAmount(total)}`);
}

function printHelp() {
  console.log(`Usage:
  expense-tracker add --description "Lunch" --amount 20
  expense-tracker update --id 1 --description "Team Lunch" --amount 25
  expense-tracker delete --id 1
  expense-tracker list
  expense-tracker summary
  expense-tracker summary --month 8`);
}

function main() {
  const { command, options } = parseArgs(process.argv);

  switch (command) {
    case "add":
      addExpense(options);
      break;
    case "update":
      updateExpense(options);
      break;
    case "delete":
      deleteExpense(options);
      break;
    case "list":
      listExpenses();
      break;
    case "summary":
      summarizeExpenses(options);
      break;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      printHelp();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main();
