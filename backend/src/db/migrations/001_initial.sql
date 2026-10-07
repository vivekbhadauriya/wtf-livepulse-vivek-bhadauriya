-- ============================================================
-- WTF LivePulse - Database Schema Migration
-- PostgreSQL 15 | TZ: Asia/Kolkata
-- ============================================================

SET timezone = 'Asia/Kolkata';

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS gyms (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL UNIQUE,
  city          VARCHAR(100) NOT NULL,
  capacity      INTEGER NOT NULL CHECK (capacity > 0),
  opens_at      TIME NOT NULL DEFAULT '06:00',
  closes_at     TIME NOT NULL DEFAULT '22:00',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS members (
  id            SERIAL PRIMARY KEY,
  gym_id        INTEGER NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  full_name     VARCHAR(200) NOT NULL,
  email         VARCHAR(200) NOT NULL UNIQUE,
  phone         VARCHAR(20),
  plan_type     VARCHAR(20) NOT NULL CHECK (plan_type IN ('monthly', 'quarterly', 'annual')),
  joined_at     TIMESTAMPTZ NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  churn_risk    BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS checkins (
  id              SERIAL PRIMARY KEY,
  member_id       INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  gym_id          INTEGER NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  checked_in_at   TIMESTAMPTZ NOT NULL,
  checked_out_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id            SERIAL PRIMARY KEY,
  member_id     INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  gym_id        INTEGER NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  amount        NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  plan_type     VARCHAR(20) NOT NULL CHECK (plan_type IN ('monthly', 'quarterly', 'annual')),
  paid_at       TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS anomalies (
  id            SERIAL PRIMARY KEY,
  gym_id        INTEGER NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  type          VARCHAR(50) NOT NULL CHECK (type IN ('zero_checkins', 'capacity_breach', 'revenue_drop')),
  description   TEXT NOT NULL,
  severity      VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status        VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'acknowledged')),
  detected_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

-- BRIN indexes for time-series columns (append-only, huge tables)
CREATE INDEX IF NOT EXISTS idx_checkins_checked_in_at_brin   ON checkins   USING BRIN (checked_in_at);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at_brin         ON payments   USING BRIN (paid_at);

-- B-tree composite indexes for hot query paths
CREATE INDEX IF NOT EXISTS idx_checkins_gym_time             ON checkins   (gym_id, checked_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkins_member_time          ON checkins   (member_id, checked_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_gym_plan             ON payments   (gym_id, plan_type);
CREATE INDEX IF NOT EXISTS idx_payments_gym_time             ON payments   (gym_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_date                 ON payments   (paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_members_gym_plan              ON members    (gym_id, plan_type);
CREATE INDEX IF NOT EXISTS idx_anomalies_gym_status          ON anomalies  (gym_id, status);
CREATE INDEX IF NOT EXISTS idx_anomalies_detected            ON anomalies  (detected_at DESC);

-- Partial indexes for targeted queries (no seq scans!)
CREATE INDEX IF NOT EXISTS idx_checkins_open                 ON checkins   (gym_id) WHERE checked_out_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_members_churn_risk            ON members    (gym_id) WHERE churn_risk = true;
CREATE INDEX IF NOT EXISTS idx_members_active                ON members    (gym_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_anomalies_open                ON anomalies  (gym_id) WHERE status = 'open';

-- ============================================================
-- MATERIALIZED VIEW: Hourly Check-in Heatmap
-- ============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS hourly_checkin_heatmap AS
SELECT
  gym_id,
  EXTRACT(ISODOW FROM checked_in_at AT TIME ZONE 'Asia/Kolkata')::INTEGER AS day_of_week,
  EXTRACT(HOUR FROM checked_in_at AT TIME ZONE 'Asia/Kolkata')::INTEGER   AS hour_of_day,
  COUNT(*)::INTEGER                                                        AS checkin_count
FROM checkins
GROUP BY gym_id, day_of_week, hour_of_day
ORDER BY gym_id, day_of_week, hour_of_day;

CREATE UNIQUE INDEX IF NOT EXISTS idx_heatmap_unique ON hourly_checkin_heatmap (gym_id, day_of_week, hour_of_day);
