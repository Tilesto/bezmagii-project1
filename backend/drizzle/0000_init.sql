CREATE TABLE `daily_stats` (
	`day` text NOT NULL,
	`metric` text NOT NULL,
	`value` integer NOT NULL,
	PRIMARY KEY(`day`, `metric`)
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` integer NOT NULL,
	`client_ts` integer,
	`day` text NOT NULL,
	`type` text NOT NULL,
	`name` text,
	`path` text,
	`visitor_id` text,
	`session_id` text,
	`ip_hash` text,
	`device` text,
	`os` text,
	`browser` text,
	`inapp` text,
	`is_bot` integer DEFAULT false NOT NULL,
	`req_id` text,
	`data` text
);
--> statement-breakpoint
CREATE INDEX `events_ts_idx` ON `events` (`ts`);--> statement-breakpoint
CREATE INDEX `events_day_type_idx` ON `events` (`day`,`type`);--> statement-breakpoint
CREATE INDEX `events_session_idx` ON `events` (`session_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`visitor_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`last_seen` integer NOT NULL,
	`day` text NOT NULL,
	`events` integer DEFAULT 0 NOT NULL,
	`visible_ms` integer DEFAULT 0 NOT NULL,
	`entry_path` text,
	`referrer` text
);
--> statement-breakpoint
CREATE INDEX `sessions_day_idx` ON `sessions` (`day`);--> statement-breakpoint
CREATE TABLE `visitors` (
	`id` text PRIMARY KEY NOT NULL,
	`first_seen` integer NOT NULL,
	`last_seen` integer NOT NULL,
	`first_day` text NOT NULL,
	`device` text,
	`os` text,
	`browser` text,
	`inapp` text,
	`referrer` text
);
