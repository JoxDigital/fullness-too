// server/index.js
const express = require("express");
const app = express();
const cors = require("cors");
const pool = require("./db");
const bcrypt = require("bcrypt");
const moment = require("moment");
const logger = require("./logger");
const jwt_decode = require("jwt-decode");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const secretKey = process.env.JWT_SECRET;

// Import the authentication middleware function
const authMiddleware = (requiredRole) => (req, res, next) => {
  const token = req.header("x-auth-token"); // Assuming you send the token in the header
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    let decoded = jwt_decode(token); // Decoding the token
    req.user = decoded; // Attach user data to the request

    if (req.user.role !== requiredRole) {
      return res.status(403).json({ error: "Forbidden" });
    }

    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
};

const rateLimit = require("express-rate-limit");

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
});

// Protected admin route example
app.get("/admin/dashboard", authMiddleware("administrator"), (req, res) => {
  // This route is protected and can only be accessed by administrators
  // Add your admin-specific functionality here
});

// Create a limiter for the login route
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 25, // Limit each IP to 5 requests per windowMs for the login route
});

// Serve static files from the 'public' directory
app.use(express.static("build"));

// middleware
app.use(cors());
app.use(express.json()); // req.body

// ROUTES //

// ------------ User Authentication Routes

// POST /login: User login
app.post("/login", loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if the user with the provided email exists
    const user = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (user.rows.length === 0) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Verify the password
    const isPasswordValid = await bcrypt.compare(
      password,
      user.rows[0].password
    );

    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Generate a JWT token for the user
    const token = jwt.sign({ id: user.rows[0].id, role_id: user.rows[0].role_id }, secretKey);

    // const token = jwt.sign({ id: user.rows[0].id }, secretKey); // Implement 'generateToken' function
    // Log the token
    // console.log("Token: %d", token);
    logger.info("Token: " + token);
    logger.info("Token: " + secretKey);

    // Log the user's id and name
    logger.info("User ID: " + user.rows[0].id);
    logger.info("User Name: " + user.rows[0].name); // Assuming 'name' is a field in your 'users' table
    logger.info("User ID: " + user.rows[0].role_id);

    res.json({ token });
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});
// POST /register: Register a new user.
app.post("/register", async (req, res) => {
  try {
    const { name, email, password, role_id } = req.body;

    // Check if the user with the same email already exists
    const userExists = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (userExists.rows.length > 0) {
      return res
        .status(400)
        .json({ error: "User with this email already exists" });
    }

    // Hash the password
    const saltRounds = 10; // You can adjust the number of salt rounds as needed
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insert the new user into the database
    const newUser = await pool.query(
      "INSERT INTO users (name, email, password, role_id) VALUES ($1, $2, $3, $4) RETURNING id, name, email",
      [name, email, hashedPassword, role_id]
    );

    res.status(201).json({ user: newUser.rows[0] });
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// -------- USERS ROUTES

// GET /users
app.get("/users", async (req, res) => {
  try {
    console.log("START: Fetching ALL Users");
    const users = await pool.query("SELECT * FROM users");
    res.json(users.rows);
    console.log("FINISH: Fetched ALL Users");
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /users/:id: Fetch a specific user by ID
app.get("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const user = await pool.query("SELECT * FROM users WHERE id = $1", [id]);

    if (user.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user.rows[0]);
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /users: Create a new user.
app.post("/users", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const newUser = await pool.query(
      "INSERT INTO users (name, email, password) VALUES($1, $2, $3) RETURNING *",
      [name, email, password]
    );

    res.json(newUser.rows[0]);
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /users/:id: Update an existing user by ID
app.put("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password } = req.body;

    const updatedUser = await pool.query(
      "UPDATE users SET name = $1, email = $2, password = $3 WHERE id = $4 RETURNING *",
      [name, email, password, id]
    );

    if (updatedUser.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(updatedUser.rows[0]);
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /users/:id: Delete a user by ID
app.delete("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Delete the user by ID
    await pool.query("DELETE FROM users WHERE id = $1", [id]);

    res.json({ message: "User deleted" });
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// -------------- INCOME SOURCES
// GET /income-sources: Fetch all income sources from the database
app.get("/income-sources", async (req, res) => {
  try {
    const incomeSources = await pool.query("SELECT * FROM income_sources");
    res.json(incomeSources.rows);
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /income-sources/:id: Fetch a specific income source by ID
app.get("/income-sources/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const incomeSource = await pool.query(
      "SELECT * FROM income_sources WHERE id = $1",
      [id]
    );

    if (incomeSource.rows.length === 0) {
      return res.status(404).json({ error: "Income source not found" });
    }

    res.json(incomeSource.rows[0]);
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /income-sources: Create a new income source
app.post("/income-sources", async (req, res) => {
  try {
    const { name } = req.body;
    const newIncomeSource = await pool.query(
      "INSERT INTO income_sources (name) VALUES($1) RETURNING *",
      [name]
    );

    res.json(newIncomeSource.rows[0]);
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /income-sources/:id: Update an existing income source by ID.
app.put("/income-sources/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    const updatedIncomeSource = await pool.query(
      "UPDATE income_sources SET name = $1 WHERE id = $2 RETURNING *",
      [name, id]
    );

    if (updatedIncomeSource.rows.length === 0) {
      return res.status(404).json({ error: "Income source not found" });
    }

    res.json(updatedIncomeSource.rows[0]);
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /income-sources/:id: Delete an income source by ID.
app.delete("/income-sources/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Delete the income source by ID
    await pool.query("DELETE FROM income_sources WHERE id = $1", [id]);

    res.json({ message: "Income source deleted" });
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// -------------------- income routes

// GET /incomes: Fetch all income entries from the database
app.get("/incomes", async (req, res) => {
  try {
    const incomes = await pool.query("SELECT * FROM incomes");
    res.json(incomes.rows);
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /incomes/:id: Fetch a specific income entry by ID
app.get("/incomes/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const income = await pool.query("SELECT * FROM incomes WHERE id = $1", [
      id,
    ]);

    if (income.rows.length === 0) {
      return res.status(404).json({ error: "Income entry not found" });
    }

    res.json(income.rows[0]);
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /incomes-by-month/:userId
app.get("/incomes-by-month/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    // Calculate the date twelve months ago from today
    const twelveMonthsAgo = moment()
      .subtract(12, "months")
      .format("YYYY-MM-DD");

    // Query to fetch income data for the specific user for the last twelve months
    const query = `
      SELECT
        users.name AS user_name,
        income_sources.name AS income_source_name,
        incomes.id AS income_id,
        incomes.title AS income_title,
        incomes.date,
        incomes.amount
      FROM incomes
      INNER JOIN income_sources ON incomes.income_source_id = income_sources.id
      INNER JOIN users ON incomes.user_id = users.id
      WHERE incomes.user_id = $1
        AND incomes.date >= $2
      ORDER BY incomes.date;
    `;

    const { rows } = await pool.query(query, [userId, twelveMonthsAgo]);

    res.json(rows);
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /incomes-by-date/:userId/:startDate/:endDate
app.get("/incomes-by-date/:userId/:startDate/:endDate", async (req, res) => {
  try {
    const { userId, startDate, endDate } = req.params;

    // Query to fetch income data for the specific user within the date range
    const query = `
      SELECT
        users.name AS user_name,
        income_sources.name AS income_source_name,
        incomes.id AS income_id,
        incomes.title AS income_title,
        incomes.date,
        incomes.amount
      FROM incomes
      INNER JOIN income_sources ON incomes.income_source_id = income_sources.id
      INNER JOIN users ON incomes.user_id = users.id
      WHERE incomes.user_id = $1
        AND incomes.date >= $2
        AND incomes.date <= $3
      ORDER BY incomes.date;
    `;

    const { rows } = await pool.query(query, [userId, startDate, endDate]);

    // Log the tabular data result using Winston
    logger.info("Tabular data result:", rows);

    res.json(rows);
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /incomes: Create a new income entry
app.post("/incomes", async (req, res) => {
  try {
    const { title, date, amount, user_id, income_source_id } = req.body;
    const newIncome = await pool.query(
      "INSERT INTO incomes (title, date, amount, user_id, income_source_id) VALUES($1, $2, $3, $4, $5) RETURNING *",
      [title, date, amount, user_id, income_source_id]
    );

    res.json(newIncome.rows[0]);
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /incomes/:id: Update an existing income entry by ID
app.put("/incomes/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, date, amount, user_id, income_source_id } = req.body;

    const updatedIncome = await pool.query(
      "UPDATE incomes SET title = $1, date = $2, amount = $3, user_id = $4, income_source_id = $5 WHERE id = $6 RETURNING *",
      [title, date, amount, user_id, income_source_id, id]
    );

    if (updatedIncome.rows.length === 0) {
      return res.status(404).json({ error: "Income entry not found" });
    }

    res.json(updatedIncome.rows[0]);
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /incomes/:id: Delete an income entry by ID
app.delete("/incomes/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Delete the income entry by ID
    await pool.query("DELETE FROM incomes WHERE id = $1", [id]);

    res.json({ message: "Income entry deleted" });
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /current-income/:userId
app.get("/current-income/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    // Write a query to fetch the current income amount for the specified user
    const query = `
      SELECT SUM(amount) AS amount
      FROM incomes
      WHERE user_id = $1
        AND date >= CURRENT_DATE - INTERVAL '1' MONTH
        AND date <= CURRENT_DATE;
    `;
    const { rows } = await pool.query(query, [userId]);
    res.json(rows[0]);
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /previous-income/:userId
app.get("/previous-income/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    // Write a query to fetch the previous month's income amount for the specified user
    const query = `
      SELECT SUM(amount) AS amount
      FROM incomes
      WHERE user_id = $1
        AND date >= CURRENT_DATE - INTERVAL '2' MONTH
        AND date < CURRENT_DATE - INTERVAL '1' MONTH;
    `;
    const { rows } = await pool.query(query, [userId]);
    res.json(rows[0]);
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------------- expense types
// GET /expense-types: Fetch all expense types from the database
app.get("/expense-types", async (req, res) => {
  try {
    const expenseTypes = await pool.query("SELECT * FROM expense_types");
    res.json(expenseTypes.rows);
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /expense-types/:id: Fetch a specific expense type by ID
app.get("/expense-types/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const expenseType = await pool.query(
      "SELECT * FROM expense_types WHERE id = $1",
      [id]
    );

    if (expenseType.rows.length === 0) {
      return res.status(404).json({ error: "Expense type not found" });
    }

    res.json(expenseType.rows[0]);
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /expense-types: Create a new expense type
app.post("/expense-types", async (req, res) => {
  try {
    const { name } = req.body;
    const newExpenseType = await pool.query(
      "INSERT INTO expense_types (name) VALUES($1) RETURNING *",
      [name]
    );

    res.json(newExpenseType.rows[0]);
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /expense-types/:id: Update an existing expense type by ID
app.put("/expense-types/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    const updatedExpenseType = await pool.query(
      "UPDATE expense_types SET name = $1 WHERE id = $2 RETURNING *",
      [name, id]
    );

    if (updatedExpenseType.rows.length === 0) {
      return res.status(404).json({ error: "Expense type not found" });
    }

    res.json(updatedExpenseType.rows[0]);
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /expense-types/:id: Delete an expense type by ID
app.delete("/expense-types/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Delete the expense type by ID
    await pool.query("DELETE FROM expense_types WHERE id = $1", [id]);

    res.json({ message: "Expense type deleted" });
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ------------------ EXPENSES ROUTES
// GET /expenses: Fetch all expense entries from the database
app.get("/expenses", async (req, res) => {
  try {
    const expenses = await pool.query("SELECT * FROM expenses");
    res.json(expenses.rows);
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /expenses/:id: Fetch a specific expense entry by ID
app.get("/expenses/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const expense = await pool.query("SELECT * FROM expenses WHERE id = $1", [
      id,
    ]);

    if (expense.rows.length === 0) {
      return res.status(404).json({ error: "Expense entry not found" });
    }

    res.json(expense.rows[0]);
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /expenses: Create a new expense entry
app.post("/expenses", async (req, res) => {
  try {
    const { title, date, amount, user_id, expense_type_id } = req.body;
    const newExpense = await pool.query(
      "INSERT INTO expenses (title, date, amount, user_id, expense_type_id) VALUES($1, $2, $3, $4, $5) RETURNING *",
      [title, date, amount, user_id, expense_type_id]
    );

    res.json(newExpense.rows[0]);
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /expenses/:id: Update an existing expense entry by ID
app.put("/expenses/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, date, amount, user_id, expense_type_id } = req.body;

    const updatedExpense = await pool.query(
      "UPDATE expenses SET title = $1, date = $2, amount = $3, user_id = $4, expense_type_id = $5 WHERE id = $6 RETURNING *",
      [title, date, amount, user_id, expense_type_id, id]
    );

    if (updatedExpense.rows.length === 0) {
      return res.status(404).json({ error: "Expense entry not found" });
    }

    res.json(updatedExpense.rows[0]);
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /expenses/:id: Delete an expense entry by ID
app.delete("/expenses/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Delete the expense entry by ID
    await pool.query("DELETE FROM expenses WHERE id = $1", [id]);

    res.json({ message: "Expense entry deleted" });
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// --------------------Savings Goals Routes
//   GET /savings-goals: Fetch all savings goals.
app.get("/savings-goals", async (req, res) => {
  try {
    const savingsGoals = await pool.query("SELECT * FROM savings_goals");
    res.json(savingsGoals.rows);
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

//   GET /savings-goals/:id: Fetch a specific savings goal by ID.
app.get("/savings-goals/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const savingsGoal = await pool.query(
      "SELECT * FROM savings_goals WHERE id = $1",
      [id]
    );

    if (savingsGoal.rows.length === 0) {
      return res.status(404).json({ error: "Savings goal not found" });
    }

    res.json(savingsGoal.rows[0]);
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

//   POST /savings-goals: Create a new savings goal.
app.post("/savings-goals", async (req, res) => {
  try {
    const { name, target_amount, target_date, description, user_id } = req.body;
    const newSavingsGoal = await pool.query(
      "INSERT INTO savings_goals (name, target_amount, target_date, description, user_id) VALUES($1, $2, $3, $4, $5) RETURNING *",
      [name, target_amount, target_date, description, user_id]
    );

    res.json(newSavingsGoal.rows[0]);
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

//   PUT /savings-goals/:id: Update an existing savings goal by ID.
app.put("/savings-goals/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, target_amount, target_date, description, user_id } = req.body;

    const updatedSavingsGoal = await pool.query(
      "UPDATE savings_goals SET name = $1, target_amount = $2, target_date = $3, description = $4, user_id = $5 WHERE id = $6 RETURNING *",
      [name, target_amount, target_date, description, user_id, id]
    );

    if (updatedSavingsGoal.rows.length === 0) {
      return res.status(404).json({ error: "Savings goal not found" });
    }

    res.json(updatedSavingsGoal.rows[0]);
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

//   DELETE /savings-goals/:id: Delete a savings goal by ID.
app.delete("/savings-goals/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Delete the savings goal by ID
    await pool.query("DELETE FROM savings_goals WHERE id = $1", [id]);

    res.json({ message: "Savings goal deleted" });
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// Start the server on

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server has started on Port ${PORT}`));

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("Shutting down gracefully");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

const path = require("path");
app.get("*", (req, res) => {
  res.sendFile(path.resolve(__dirname, "build", "index.html"));
});
