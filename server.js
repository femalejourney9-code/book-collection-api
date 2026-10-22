'use strict';

const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------- middleware

// Only accept requests that actually carry a JSON body. Requests with no body
// at all (GET/DELETE) are unaffected; a write with a non-JSON Content-Type is
// rejected with 415 before any route logic runs.
app.use((req, res, next) => {
  const hasBody = req.headers['content-length'] !== undefined ||
                  req.headers['transfer-encoding'] !== undefined;
  if (!hasBody) return next();

  const type = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') {
    return res.status(415).json({
      error: `Unsupported Media Type: expected application/json, got ${type || '(none)'}`,
    });
  }
  next();
});

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

const WRITABLE_FIELDS = ['title', 'author', 'year', 'rating'];

// Rejects any key that is not a writable field. Returns an error string, or
// null when the shape is legal. Explicit nulls are legal here and are handled
// per-field below: null clears year/rating, and is a type error on title/author.
function checkShape(body) {
  const unknown = Object.keys(body).filter((k) => !WRITABLE_FIELDS.includes(k));
  if (unknown.length > 0) {
    return `Unknown field(s): ${unknown.join(', ')}. Allowed: ${WRITABLE_FIELDS.join(', ')}`;
  }
  return null;
}

// Returns { error } on failure, or { value } with the cleaned fields.
// mode: 'create'  -> title + author required, absent year/rating stored as null
//       'replace' -> same as create; absent year/rating are reset to null
//       'patch'   -> every field optional; only supplied fields are returned
function validate(body, mode = 'create') {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object' };
  }

  const shapeError = checkShape(body);
  if (shapeError) return { error: shapeError };

  const optional = mode === 'patch';
  const value = {};
  const errors = [];

  for (const field of ['title', 'author']) {
    if (body[field] === undefined) {
      if (!optional) errors.push(`${field} is required`);
      continue;
    }
    if (typeof body[field] !== 'string' || body[field].trim() === '') {
      errors.push(`${field} must be a non-empty string`);
      continue;
    }
    value[field] = body[field].trim();
  }

  if (body.year !== undefined) {
    if (body.year === null) {
      value.year = null; // explicit null clears the field
    } else if (typeof body.year !== 'number' || !Number.isInteger(body.year) || body.year <= 0) {
      errors.push('year must be an integer greater than 0, or null');
    } else {
      value.year = body.year;
    }
  }

  if (body.rating !== undefined) {
    if (body.rating === null) {
      value.rating = null; // explicit null clears the field
    } else if (typeof body.rating !== 'number' || !Number.isInteger(body.rating) ||
        body.rating < 1 || body.rating > 5) {
      errors.push('rating must be an integer between 1 and 5, or null');
    } else {
      value.rating = body.rating;
    }
  }

  if (errors.length > 0) return { error: errors.join('; ') };

  if (optional && Object.keys(value).length === 0) {
    return { error: 'No updatable fields provided' };
  }

  return { value };
}

function findBook(id) {
  return books.find((b) => b.id === id);
}

// Resolves :id to a book, or sends 404 and returns undefined.
function requireBook(req, res) {
  const id = Number(req.params.id);
  const book = Number.isInteger(id) ? findBook(id) : undefined;
  if (!book) {
    res.status(404).json({ error: `Book ${req.params.id} not found` });
    return undefined;
  }
  return book;
}

// ---------------------------------------------------------------- routes

app.get('/books', (req, res) => {
  res.json(books);
});

app.get('/books/:id', (req, res) => {
  const book = requireBook(req, res);
  if (!book) return;
  res.json(book);
});

app.post('/books', (req, res) => {
  const { error, value } = validate(req.body, 'create');
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

// PUT = full replace. title and author are required; year and rating omitted
// from the body are reset to null. Use PATCH to change only some fields.
app.put('/books/:id', (req, res) => {
  const book = requireBook(req, res);
  if (!book) return;

  const { error, value } = validate(req.body, 'replace');
  if (error) return res.status(400).json({ error });

  book.title = value.title;
  book.author = value.author;
  book.year = value.year ?? null;
  book.rating = value.rating ?? null;

  res.json(book);
});

// PATCH = partial update. Only supplied fields change; everything else is
// left as-is. An empty body is a 400, not a no-op.
app.patch('/books/:id', (req, res) => {
  const book = requireBook(req, res);
  if (!book) return;

  const { error, value } = validate(req.body, 'patch');
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

// JSON 404 catch-all for unmatched routes.
app.use((req, res) => {
  res.status(404).json({ error: `Cannot ${req.method} ${req.path}` });
});

// Global error handler: every failure leaves as JSON, never an HTML stack.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large' });
  }

  console.error(err);
  res.status(err.status || 500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Book Collection API listening on http://localhost:${PORT}`);
});

module.exports = app;
