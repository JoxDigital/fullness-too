CREATE DATABASE fullness;

\c fullness;

-- Create users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(250) NOT NULL,
  email VARCHAR(250) UNIQUE NOT NULL,
  password VARCHAR(250) NOT NULL
);

-- Create income_sources table
CREATE TABLE income_sources (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL
);

-- Create incomes table
CREATE TABLE incomes (
  id SERIAL PRIMARY KEY,
  title VARCHAR(50) NOT NULL,
  date DATE NOT NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  user_id INTEGER NOT NULL REFERENCES users(id),
  income_source_id INTEGER NOT NULL REFERENCES income_sources(id)
);

-- Create expense_types table
CREATE TABLE expense_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL
);

-- Create expenses table
CREATE TABLE expenses (
  id SERIAL PRIMARY KEY,
  title VARCHAR(50) NOT NULL,
  date DATE NOT NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  user_id INTEGER NOT NULL REFERENCES users(id),
  expense_type_id INTEGER NOT NULL REFERENCES expense_types(id)
);

-- Create savings_goals table
CREATE TABLE savings_goals (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  target_amount NUMERIC(10,2) NOT NULL CHECK (target_amount > 0),
  target_date DATE NOT NULL CHECK (target_date > CURRENT_DATE),
  description TEXT,
  user_id INTEGER NOT NULL REFERENCES users(id)
);

CREATE TABLE todo(
    todo_id SERIAL PRIMARY KEY,
    description VARCHAR(255)
);