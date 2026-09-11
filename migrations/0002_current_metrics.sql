-- Meta removed these metrics from the Instagram API; requesting any of them
-- fails the whole insights call, so the columns are dead weight.
ALTER TABLE account_insights_daily
  DROP COLUMN impressions,
  DROP COLUMN email_contacts,
  DROP COLUMN phone_call_clicks,
  DROP COLUMN text_message_clicks,
  DROP COLUMN get_directions_clicks;

-- reach/follower_count/online_followers come back as daily time series;
-- the rest are total_value metrics fetched one day at a time.
ALTER TABLE account_insights_daily
  ADD COLUMN online_followers INT,
  ADD COLUMN views BIGINT,
  ADD COLUMN likes BIGINT,
  ADD COLUMN comments INT,
  ADD COLUMN shares BIGINT,
  ADD COLUMN saves BIGINT,
  ADD COLUMN replies INT,
  ADD COLUMN profile_links_taps INT,
  ADD COLUMN accounts_engaged BIGINT,
  ADD COLUMN total_interactions BIGINT;

ALTER TABLE media_insights_daily
  DROP COLUMN impressions,
  DROP COLUMN plays,
  DROP COLUMN video_views;

-- ig_reels_video_view_total_time is milliseconds summed across all viewers,
-- which overflows INT on a reel with any real reach.
ALTER TABLE media_insights_daily
  ADD COLUMN views BIGINT,
  ADD COLUMN profile_visits INT,
  ADD COLUMN follows INT,
  ADD COLUMN ig_reels_video_view_total_time BIGINT,
  ADD COLUMN ig_reels_avg_watch_time INT;

ALTER TABLE media_insights_daily
  ALTER COLUMN likes TYPE BIGINT,
  ALTER COLUMN shares TYPE BIGINT,
  ALTER COLUMN saved TYPE BIGINT,
  ALTER COLUMN reach TYPE BIGINT,
  ALTER COLUMN total_interactions TYPE BIGINT;

ALTER TABLE account_insights_daily
  ALTER COLUMN reach TYPE BIGINT;
