CREATE TABLE `playlist_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`source_url` text NOT NULL,
	`base_url` text,
	`last_refreshed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `playlist_sources_source_url_unique` ON `playlist_sources` (`source_url`);
--> statement-breakpoint
ALTER TABLE `streams` ADD `source_id` integer REFERENCES `playlist_sources`(`id`) ON DELETE cascade;
