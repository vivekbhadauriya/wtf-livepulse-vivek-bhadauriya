# EXPLAIN ANALYZE Benchmark Results

---

### Q1: Live Occupancy
**Target:** `< 0.5ms`
**Actual:** `0.089 ms`
```text
Aggregate  (cost=8.14..8.15 rows=1 width=8) (actual time=0.015..0.016 rows=1 loops=1)
   ->  Index Only Scan using idx_checkins_open on checkins  (cost=0.12..8.14 rows=1 width=0) (actual time=0.012..0.012 rows=0 loops=1)
         Index Cond: (gym_id = 1)
         Heap Fetches: 0
 Planning Time: 0.944 ms
 Execution Time: 0.089 ms
```

---

### Q2: Today's Revenue
**Target:** `< 0.8ms`
**Actual:** `0.051 ms`
```text
Aggregate  (cost=8.18..8.19 rows=1 width=32) (actual time=0.011..0.012 rows=1 loops=1)
   ->  Index Scan using idx_payments_gym_time on payments  (cost=0.15..8.17 rows=1 width=16) (actual time=0.009..0.009 rows=0 loops=1)
         Index Cond: ((gym_id = 1) AND (paid_at >= CURRENT_DATE))
 Planning Time: 1.154 ms
 Execution Time: 0.051 ms
```

---

### Q3: Churn Risk Members
**Target:** `< 1ms`
**Actual:** `0.045 ms`
```text
Index Scan using idx_members_active on members  (cost=0.12..8.14 rows=1 width=422) (actual time=0.007..0.008 rows=0 loops=1)
   Index Cond: (gym_id = 1)
   Filter: churn_risk
 Planning Time: 1.049 ms
 Execution Time: 0.045 ms
```

---

### Q4: Peak Hour Heatmap (7d)
**Target:** `< 0.3ms`
**Actual:** `0.069 ms`
```text
Bitmap Heap Scan on hourly_checkin_heatmap  (cost=4.22..14.76 rows=9 width=12) (actual time=0.003..0.003 rows=0 loops=1)
   Recheck Cond: (gym_id = 1)
   ->  Bitmap Index Scan on idx_heatmap_unique  (cost=0.00..4.22 rows=9 width=0) (actual time=0.002..0.002 rows=0 loops=1)
         Index Cond: (gym_id = 1)
 Planning Time: 0.553 ms
 Execution Time: 0.069 ms
```

---

### Q5: Cross-Gym Revenue Comparison
**Target:** `< 2ms`
**Actual:** `0.211 ms`
```text
Sort  (cost=27.32..27.68 rows=143 width=36) (actual time=0.109..0.109 rows=0 loops=1)
   Sort Key: (sum(amount)) DESC
   Sort Method: quicksort  Memory: 25kB
   ->  HashAggregate  (cost=20.42..22.20 rows=143 width=36) (actual time=0.013..0.014 rows=0 loops=1)
         Group Key: gym_id
         Batches: 1  Memory Usage: 40kB
         ->  Bitmap Heap Scan on payments  (cost=5.76..19.38 rows=207 width=20) (actual time=0.011..0.011 rows=0 loops=1)
               Recheck Cond: (paid_at >= (now() - '30 days'::interval))
               ->  Bitmap Index Scan on idx_payments_date  (cost=0.00..5.71 rows=207 width=0) (actual time=0.008..0.008 rows=0 loops=1)
                     Index Cond: (paid_at >= (now() - '30 days'::interval))
 Planning Time: 1.458 ms
 Execution Time: 0.211 ms
```

---

### Q6: Active Anomalies - All Gyms
**Target:** `< 0.3ms`
**Actual:** `0.084 ms`
```text
Sort  (cost=8.15..8.15 rows=1 width=298) (actual time=0.044..0.045 rows=0 loops=1)
   Sort Key: detected_at DESC
   Sort Method: quicksort  Memory: 25kB
   ->  Index Scan using idx_anomalies_open on anomalies  (cost=0.12..8.14 rows=1 width=298) (actual time=0.006..0.006 rows=0 loops=1)
 Planning Time: 1.021 ms
 Execution Time: 0.084 ms
```
