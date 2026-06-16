CREATE TABLE `streams` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`status` text DEFAULT 'offline' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
