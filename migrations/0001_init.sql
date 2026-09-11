CREATE TABLE ig_accounts (
  id SERIAL PRIMARY KEY,
  ig_user_id TEXT UNIQUE NOT NULL,
  ig_username TEXT,
  page_id TEXT,
  page_name TEXT,
  access_token_encrypted TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  long_lived_token_obtained_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE account_insights_daily (
  id SERIAL PRIMARY KEY,
  ig_account_id INT NOT NULL REFERENCES ig_accounts(id),
  metric_date DATE NOT NULL,
  impressions INT,
  reach INT,
  profile_views INT,
  website_clicks INT,
  follower_count INT,
  email_contacts INT,
  phone_call_clicks INT,
  text_message_clicks INT,
  get_directions_clicks INT,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ig_account_id, metric_date)
);

CREATE TABLE media_items (
  id SERIAL PRIMARY KEY,
  ig_account_id INT NOT NULL REFERENCES ig_accounts(id),
  ig_media_id TEXT UNIQUE NOT NULL,
  media_type TEXT,
  media_product_type TEXT,
  caption TEXT,
  permalink TEXT,
  media_url TEXT,
  thumbnail_url TEXT,
  posted_at TIMESTAMPTZ,
  insights_unavailable BOOLEAN NOT NULL DEFAULT false,
  insights_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE media_insights_daily (
  id SERIAL PRIMARY KEY,
  media_item_id INT NOT NULL REFERENCES media_items(id),
  snapshot_date DATE NOT NULL,
  impressions INT,
  reach INT,
  likes INT,
  comments INT,
  saved INT,
  shares INT,
  plays INT,
  video_views INT,
  total_interactions INT,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (media_item_id, snapshot_date)
);

CREATE TABLE metric_backfill_status (
  id SERIAL PRIMARY KEY,
  ig_account_id INT NOT NULL REFERENCES ig_accounts(id),
  metric_name TEXT NOT NULL,
  earliest_available_date DATE,
  status TEXT NOT NULL,
  last_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  UNIQUE (ig_account_id, metric_name)
);

CREATE INDEX ON account_insights_daily (ig_account_id, metric_date);
CREATE INDEX ON media_insights_daily (media_item_id, snapshot_date);
