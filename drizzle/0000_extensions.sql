-- Extensions required by the data model (docs/05 §1).
-- btree_gist: exclusion constraints for double-booking prevention
-- pg_trgm: typeahead / fuzzy search
-- citext: case-insensitive emails
-- pgcrypto: digest() for the audit hash chain
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS citext;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgcrypto;
