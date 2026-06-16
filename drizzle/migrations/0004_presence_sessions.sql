CREATE TABLE `presence_sessions` (
	`session_id` text PRIMARY KEY NOT NULL,
	`last_seen` integer NOT NULL,
	`path` text
);
--> statement-breakpoint
CREATE INDEX `presence_sessions_last_seen_idx` ON `presence_sessions` (`last_seen`);
