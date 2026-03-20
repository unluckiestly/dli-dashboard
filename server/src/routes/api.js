import { Router } from 'express';
import { queryAll, queryOne } from '../db/schema.js';
import { runScrape, getLastScrape, testCost, getApiUsage } from '../services/scraper.js';

const router = Router();

const WEEK_FILTER = "created_at >= datetime('now', '-7 days')";

// GET /api/recap — all data for the weekly recap in one call
router.get('/recap', (req, res) => {
  const total = queryOne(`SELECT COUNT(*) as count FROM tweets WHERE ${WEEK_FILTER}`);
  const totalViews = queryOne(`SELECT COALESCE(SUM(views), 0) as views FROM tweets WHERE ${WEEK_FILTER}`);
  const totalLikes = queryOne(`SELECT COALESCE(SUM(likes), 0) as likes FROM tweets WHERE ${WEEK_FILTER}`);
  const totalRetweets = queryOne(`SELECT COALESCE(SUM(retweets), 0) as retweets FROM tweets WHERE ${WEEK_FILTER}`);
  const uniqueAuthors = queryOne(`SELECT COUNT(DISTINCT author_username) as count FROM tweets WHERE ${WEEK_FILTER}`);

  const engagement = queryOne(`
    SELECT
      CASE WHEN SUM(views) > 0
        THEN ROUND(CAST(SUM(likes + retweets + replies) AS REAL) / SUM(views) * 100, 2)
        ELSE 0
      END as rate
    FROM tweets WHERE ${WEEK_FILTER}
  `);

  const peakHour = queryOne(`
    SELECT CAST(strftime('%H', created_at) AS INTEGER) as hour, COUNT(*) as count
    FROM tweets WHERE ${WEEK_FILTER}
    GROUP BY hour ORDER BY count DESC LIMIT 1
  `);

  // All posts for the week, sorted by date (newest first)
  const allPosts = queryAll(`
    SELECT * FROM tweets WHERE ${WEEK_FILTER}
    ORDER BY created_at DESC
  `);

  // Top 5 by likes
  const topPosts = queryAll(`
    SELECT * FROM tweets WHERE ${WEEK_FILTER}
    ORDER BY likes DESC LIMIT 5
  `);

  // Top authors
  const topAuthors = queryAll(`
    SELECT author_username as username, author_display_name as display_name,
           COUNT(*) as total_mentions, SUM(likes) as total_likes_received,
           SUM(views) as total_views,
           MAX(avatar_url) as avatar_url
    FROM tweets WHERE ${WEEK_FILTER}
    GROUP BY author_username
    ORDER BY total_mentions DESC LIMIT 10
  `);

  // Activity by day
  const activity = queryAll(`
    SELECT DATE(created_at) as period, COUNT(*) as mentions, SUM(likes) as total_likes,
           CASE WHEN SUM(views) > 0
             THEN ROUND(CAST(SUM(likes + retweets + replies) AS REAL) / SUM(views) * 100, 2)
             ELSE 0
           END as engagement_rate
    FROM tweets WHERE ${WEEK_FILTER}
    GROUP BY period ORDER BY period ASC
  `);

  // Date range
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  res.json({
    dateRange: {
      from: weekAgo.toISOString().split('T')[0],
      to: now.toISOString().split('T')[0],
    },
    summary: {
      totalMentions: total?.count || 0,
      totalViews: totalViews?.views || 0,
      totalLikes: totalLikes?.likes || 0,
      totalRetweets: totalRetweets?.retweets || 0,
      uniqueAuthors: uniqueAuthors?.count || 0,
      engagementRate: engagement?.rate || 0,
      peakHour: peakHour || null,
    },
    allPosts,
    topPosts,
    topAuthors,
    activity,
    lastScrape: getLastScrape(),
  });
});

// POST /api/scrape
let scrapeInProgress = false;

router.post('/scrape', async (req, res) => {
  if (scrapeInProgress) {
    return res.status(409).json({ error: 'Scrape already in progress' });
  }
  scrapeInProgress = true;
  try {
    const result = await runScrape();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    scrapeInProgress = false;
  }
});

// GET /api/scrape/status
router.get('/scrape/status', (req, res) => {
  res.json({ inProgress: scrapeInProgress, lastScrape: getLastScrape() });
});

// POST /api/test-cost
router.post('/test-cost', async (req, res) => {
  try {
    const result = await testCost();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/usage
router.get('/usage', (req, res) => {
  try {
    const usage = getApiUsage();
    res.json(usage);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
