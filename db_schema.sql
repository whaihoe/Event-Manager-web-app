
-- This makes sure that foreign_key constraints are observed and that errors will be thrown for violations
PRAGMA foreign_keys=ON;

BEGIN TRANSACTION;

-- Create your tables with SQL commands here (watch out for slight syntactical differences with SQLite vs MySQL)

CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_name TEXT NOT NULL,
    email_address TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'attendee' CHECK(role IN ('organiser', 'attendee')),
    password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wallets (
    wallet_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    balance REAL NOT NULL DEFAULT 0 CHECK(balance >= 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
    wallet_transaction_id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_id INTEGER NOT NULL,
    transaction_type TEXT NOT NULL CHECK(transaction_type IN ('top_up', 'ticket_payment', 'ticket_sale')),
    amount REAL NOT NULL CHECK(amount > 0),
    description TEXT NOT NULL,
    related_purchase_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (wallet_id) REFERENCES wallets(wallet_id),
    FOREIGN KEY (related_purchase_id) REFERENCES ticket_purchases(purchase_id)
);

CREATE TABLE IF NOT EXISTS events (
    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    event_date TEXT NOT NULL,
    location TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published')),
    published_at TEXT,
    updated_at TEXT,
    organiser_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organiser_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS site_settings (
    setting_id INTEGER PRIMARY KEY CHECK(setting_id = 1),
    site_name TEXT NOT NULL,
    site_description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event_tickets (
    ticket_id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    ticket_type TEXT NOT NULL,
    quantity_available INTEGER NOT NULL CHECK(quantity_available > 0),
    price REAL NOT NULL CHECK(price >= 0),
    UNIQUE (event_id, ticket_type),
    FOREIGN KEY (event_id) REFERENCES events(event_id)
);

CREATE TABLE IF NOT EXISTS ticket_purchases (
    purchase_id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    attendee_name TEXT NOT NULL,
    purchased_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(event_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS purchase_ticket_items (
    purchase_id INTEGER NOT NULL,
    ticket_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL CHECK(quantity > 0),
    price_at_purchase REAL NOT NULL CHECK(price_at_purchase >= 0),
    PRIMARY KEY (purchase_id, ticket_id),
    FOREIGN KEY (purchase_id) REFERENCES ticket_purchases(purchase_id),
    FOREIGN KEY (ticket_id) REFERENCES event_tickets(ticket_id)
);

INSERT OR IGNORE INTO site_settings (setting_id, site_name, site_description)
VALUES (1, 'Event Manager', 'Discover events and buy tickets online.');

COMMIT;
