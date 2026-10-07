# WTF LivePulse

A real-time gym operations dashboard for WTF Gyms, monitoring occupancy, revenue, anomalies, and allowing event simulation across 10 locations.

## 1. Setup Instructions
To run the full stack (Database, Backend, Frontend):

1. **Start the stack** (from the root directory):
   ```bash
   docker compose up --build
   ```
2. **Access the Application**:
   - Frontend: [http://localhost:5173](http://localhost:5173)
   - Backend API: [http://localhost:3001/api](http://localhost:3001/api)
3. **Cold Start**: The system automatically runs database migrations and seeds the database (~270k check-ins, members, etc.) on the first startup. Please wait up to 60 seconds for the initial seed to complete. 
4. **Shutdown and Reset**:
   ```bash
   docker compose down -v
   ```

*Note: Database credentials are provided via `.env` defaults for local development. Do not use these in production.*

## 2. Architecture Decisions
- **Real-time Push (No Polling)**: The system utilizes standard WebSockets. The background Simulator and Anomaly Detector push events directly to connected clients, completely eliminating HTTP polling overhead.
- **Batch Processing**: The data seed script uses PostgreSQL's `COPY` command to bulk insert ~270,000 check-ins in seconds, maintaining high performance.
- **Materialized Views**: The heatmap data (which aggregates hundreds of thousands of rows) is stored in a `MATERIALIZED VIEW` to make the complex analytical queries O(1) fast on reads.
- **Micro-Animations & Premium UI**: The React frontend is built completely from scratch using vanilla CSS, a glassmorphism dark theme, mesh gradients, and micro-animations to ensure a vibrant and premium look that aligns with the WTF Gyms brand, avoiding heavy UI libraries like Tailwind/MUI for precise aesthetic control.

## 3. Indexing Strategy
To avoid sequential scans on massive tables (`checkins` and `payments`), we implemented a targeted indexing strategy:
- **BRIN Indexes**: Time-series tables (`checkins.checked_in_at` and `payments.paid_at`) use Block Range Indexes (BRIN) since data is append-only and naturally sorted. This provides extreme space efficiency and speeds up range queries.
- **Partial B-Tree Indexes**: For the anomaly engine, we index only open check-ins (`WHERE checked_out_at IS NULL`) and open anomalies (`WHERE status = 'open'`). This makes occupancy counting instantaneous.
- **Composite Indexes**: We index `(gym_id, plan_type)` and `(gym_id, paid_at DESC)` to drastically reduce lookup times for our analytical aggregates (revenue by plan).

## 4. Known Limitations / Spec Contradictions Resolved
- **Joined_at Date Spread**: The spec mandated 90 days for join dates but requested ~270,000 check-ins. To realistically support that check-in volume with 5,000 members, the `joined_at` distribution was extended up to 180 days with a quadratic skew to prevent massive revenue overshoots in the last 30 days.
- **Validation Query V5 vs Scenarios**: The spec capped total open check-ins at 350 for V5, but the Bandra West scenario alone requires 275+ open check-ins to breach capacity. The total open check-in count might slightly exceed 350 to satisfy the anomaly scenario.
- **Velachery Scenario A vs Tier Table**: Scenario A requires zero open check-ins for Velachery, but the tier table suggested 8-15 open check-ins. Scenario A's mandate of 0 was strictly followed.
- **Scenario A Time Dependency**: The anomaly detector respects standard operating hours (6 AM to 10 PM IST). If a reviewer runs the stack at 11 PM, the detector correctly ignores it. However, 3 anomalies are pre-seeded to ensure they are visible on startup regardless of time.

## 5. Execution Strategy (AI-Native)
As requested by the assignment ("AI-Native Execution Required"), I utilized AI tooling to accelerate boilerplate generation. Specifically, AI was used for:
- Bootstrapping the initial project setup and database migration schema.
- Assisting with the baseline mock data generation scripts and unit testing frameworks.

My direct engineering and architectural contributions included:
- **Database Optimization:** Resolving complex $O(N^2)$ correlated subqueries into high-performance CTEs and window functions so the 270,000+ row membership data loads instantly (sub-100ms).
- **Architecture & System Design:** Architecting the real-time WebSocket infrastructure, designing the Anomaly Engine logic, and deciding the strict schema constraints and partial indexing strategy.
- **UI/UX Polish:** Custom styling the interface, ensuring CSS glassmorphism, Recharts theming, and premium dark-mode aesthetics matched real-world SaaS standards.
- **Manual Verification:** Running strict manual verifications on every component to ensure all simulated scenarios and anomaly resolutions precisely adhere to the business rules and constraints defined in the assignment specifications.

## 6. Query Benchmarks

*(Note: Raw text outputs from `EXPLAIN ANALYZE` are provided in the `/benchmarks` directory, and the execution times below match the provided screenshots in `/benchmarks/screenshots`.)*

| # | Query Name | Execution Time | Index Used |
|---|---|---|---|
| 1 | Live Occupancy — Single Gym | 0.089 ms | `idx_checkins_open` (partial) |
| 2 | Today's Revenue — Single Gym | 0.051 ms | `idx_payments_gym_time` (composite) |
| 3 | Churn Risk Members | 0.045 ms | `idx_members_active` (partial) |
| 4 | Peak Hour Heatmap (7d) | 0.069 ms | `idx_heatmap_unique` (materialized view) |
| 5 | Cross-Gym Revenue Comparison | 0.211 ms | `idx_payments_date` (B-Tree) |
| 6 | Active Anomalies — All Gyms | 0.084 ms | `idx_anomalies_open` (partial) |
