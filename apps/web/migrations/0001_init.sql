CREATE TABLE reading_sessions (
	user_id TEXT NOT NULL,
	pdf_path TEXT NOT NULL,
	pdf_name TEXT NOT NULL,
	current_page INTEGER NOT NULL,
	word_index INTEGER NOT NULL,
	voice TEXT,
	rate TEXT,
	updated_at TEXT NOT NULL,
	PRIMARY KEY (user_id, pdf_path)
);

CREATE TABLE pdf_notes (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL,
	pdf_path TEXT NOT NULL,
	page_number INTEGER NOT NULL,
	note_text TEXT NOT NULL,
	line_y INTEGER NOT NULL,
	word_index INTEGER NOT NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_pdf_notes_lookup ON pdf_notes (user_id, pdf_path, page_number, line_y);
