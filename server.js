import express from "express";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const { Pool } = pg;
const port = process.env.PORT || 3000;

const db = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PW,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT),
  ssl: {
    rejectUnauthorized: false,
  },
});

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// Global State
let users = [];
let currentUserId = 1;
let currentUserInfo = {};

// Utility Functions
const updateCurrentUserInfo = async (userId) => {
  currentUserInfo = users.find((user) => user.id === userId) || {};
  currentUserInfo.countryCodes = await getUserVisitedCountryCodes(userId);
  currentUserInfo.countries = await getUserVisitedCountries(userId);
  currentUserInfo.color = currentUserInfo.color || "teal";
};

const getUsers = async () => {
  const results = await db.query("SELECT * FROM users ORDER BY id ASC");
  users = results.rows;
};

const getUserVisitedCountryCodes = async (userId) => {
  const result = await db.query(
    `SELECT country_code 
     FROM country_visited 
     WHERE user_id = $1`,
    [userId]
  );
  return result.rows.map((row) => row.country_code);
};

const getUserVisitedCountries = async (userId) => {
  const result = await db.query(
    `SELECT countries.country_name 
     FROM country_visited 
     JOIN countries 
     ON country_visited.country_code = countries.country_code 
     WHERE user_id = $1`,
    [userId]
  );
  return result.rows.map((row) => row.country_name);
};

const addOrUpdateUser = async (name, color = "teal") => {
  const result = await db.query(
    "INSERT INTO users (name, color) VALUES ($1, $2) RETURNING *",
    [name, color]
  );
  return result.rows[0];
};

// Routes
app.get("/", async (req, res) => {
  await getUsers();
  await updateCurrentUserInfo(currentUserId);

  res.render("index.ejs", {
    countryCode: currentUserInfo.countryCodes,
    countries: currentUserInfo.countries,
    total: currentUserInfo.countryCodes?.length || 0,
    users,
    color: currentUserInfo.color,
  });
});

app.get("/api/getData", (req, res) => {
  res.json({
    color: currentUserInfo.color,
    countryCode: currentUserInfo.countryCodes,
  });
});

app.get("/api/countries", async (req, res) => {
  const searchTerm = req.query.q?.toLowerCase() || "";
  if (!searchTerm) return res.json([]);

  try {
    const result = await db.query(
      `SELECT country_name 
       FROM countries 
       WHERE LOWER(country_name) LIKE $1 
       LIMIT 10`,
      [`${searchTerm}%`]
    );
    const countryNames = result.rows.map((row) => row.country_name);
    res.json(countryNames);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/action-handler", async (req, res) => {
  const { action, country } = req.body;

  try {
    const result = await db.query(
      "SELECT country_code FROM countries WHERE LOWER(country_name) LIKE $1",
      [country.toLowerCase()]
    );

    if (!result.rows.length) {
      return renderError(res, "Invalid country name.");
    }

    const countryCode = result.rows[0].country_code;
    const isVisited = currentUserInfo.countryCodes.includes(countryCode);

    if (action === "add" && isVisited) {
      return renderError(res, "Country already added.");
    }

    if (action === "remove" && !isVisited) {
      return renderError(res, "Country not visited.");
    }

    if (action === "add") {
      await db.query(
        "INSERT INTO country_visited (country_code, user_id) VALUES ($1, $2)",
        [countryCode, currentUserId]
      );
    } else if (action === "remove") {
      await db.query(
        "DELETE FROM country_visited WHERE country_code = $1 AND user_id = $2",
        [countryCode, currentUserId]
      );
    }

    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/user", async (req, res) => {
  if (req.body.manageFamily === "addRemoveEdit") {
    return res.render("new.ejs", { users, error: null });
  }
  currentUserId = parseInt(req.body.user);
  res.redirect("/");
});

app.get("/new", (req, res) => {
  res.render("new.ejs", { users, error: null });
});

app.post("/new", async (req, res) => {
  const { name, color } = req.body;

  if (users.some((user) => user.name === name)) {
    return res.render("new.ejs", {
      error: "Name already in use. Please provide a new name.",
    });
  }

  const newUser = await addOrUpdateUser(name, color);
  currentUserId = newUser.id;
  res.redirect("/");
});

app.post("/remove", async (req, res) => {
  const userId = parseInt(req.body.user);

  try {
    await db.query("DELETE FROM users WHERE id = $1", [userId]);
    currentUserId = users[0]?.id || 1;
    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/edit", (req, res) => {
  const userId = parseInt(req.body.user);
  const user = users.find((user) => user.id === userId);
  res.render("edit.ejs", { user, error: null });
});

app.post("/edit/:id", async (req, res) => {
  const userId = parseInt(req.params.id);
  try {
    await db.query("UPDATE users SET name = $1, color = $2 WHERE id = $3", [
      req.body.name,
      req.body.color,
      userId,
    ]);
    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Error Rendering
const renderError = (res, message) => {
  res.render("index.ejs", {
    countryCode: currentUserInfo.countryCodes,
    countries: currentUserInfo.countries,
    total: currentUserInfo.countryCodes?.length || 0,
    users,
    color: currentUserInfo.color,
    error: message,
  });
};

// Start Server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
