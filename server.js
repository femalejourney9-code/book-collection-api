'use strict';

const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ---------------------------------------------------------------- data store

let nextId = 1;
const books = [];

function seed(title, author, year, rating) {
  books.push({ id: nextId++, title, author, year, rating });
}

seed('The Hobbit', 'J.R.R. Tolkien', 1937, 5);
seed('Dune', 'Frank Herbert', 1965, 5);
seed('Neuromancer', 'William Gibson', 1984, 4);

// ---------------------------------------------------------------- validation

// Returns { error } on failure, or { value } with the cleaned fields.
function validate(body, { partial = false } = {}) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object' };
  }

  const value = {};
  const errors = [];

  for (const field of ['title', 'author']) {
    if (body[field] === undefined) {
      if (!partial) errors.push(`${field} is required`);
      continue;
    }
    if (typeof body[field] !== 'string' || body[field].trim() === '') {
      errors.push(`${field} must be a non-empty string`);
      continue;
    }
    value[field] = body[field].trim();
  }

  if (body.year !== undefined) {
    if (typeof body.year !== 'number' || !Number.isInteger(body.year) || body.year <= 0) {
      errors.push('year must be an integer greater than 0');
    } else {
      value.year = body.year;
    }
  }

  if (body.rating !== undefined) {
    if (typeof body.rating !== 'number' || !Number.isInteger(body.rating) ||
        body.rating < 1 || body.rating > 5) {
      errors.push('rating must be an integer between 1 and 5');
    } else {
      value.rating = body.rating;
    }
  }

  if (errors.length > 0) return { error: errors.join('; ') };

  if (partial && Object.keys(value).length === 0) {
    return { error: 'No valid updatable fields provided' };
  }

  return { value };
}

function findBook(id) {
  return books.find((b) => b.id === id);
}

// ---------------------------------------------------------------- routes

app.get('/books', (req, res) => {
  res.json(books);
});

app.get('/books/:id', (req, res) => {
  const id = Number(req.params.id);
  const book = Number.isInteger(id) ? findBook(id) : undefined;
  if (!book) return res.status(404).json({ error: `Book ${req.params.id} not found` });
  res.json(book);
});

app.post('/books', (req, res) => {
  const { error, value } = validate(req.body);
  if (error) return res.status(400).json({ error });

  const book = {
    id: nextId++,
    title: value.title,
    author: value.author,
    year: value.year ?? null,
    rating: value.rating ?? null,
  };
  books.push(book);
  res.status(201).json(book);
});

app.put('/books/:id', (req, res) => {
  const id = Number(req.params.id);
  const book = Number.isInteger(id) ? findBook(id) : undefined;
  if (!book) return res.status(404).json({ error: `Book ${req.params.id} not found` });

  const { error, value } = validate(req.body, { partial: true });
  if (error) return res.status(400).json({ error });

  Object.assign(book, value);
  res.json(book);
});

app.delete('/books/:id', (req, res) => {
  const id = Number(req.params.id);
  const index = Number.isInteger(id) ? books.findIndex((b) => b.id === id) : -1;
  if (index === -1) return res.status(404).json({ error: `Book ${req.params.id} not found` });

  const [removed] = books.splice(index, 1);
  res.json({ deleted: removed });
});

// ---------------------------------------------------------------- errors

app.use((req, res) => {
  res.status(404).json({ error: `Cannot ${req.method} ${req.path}` });
});

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Book Collection API listening on http://localhost:${PORT}`);
});

module.exports = app;
