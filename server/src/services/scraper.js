import { TwitterApi } from 'twitter-api-v2';
import { queryAll, queryOne, execute } from '../db/schema.js';

const SEARCH_QUERY = '@DlicomApp -is:reply';

// Twitter API v2 Basic tier: $100/month for 10,000 tweet reads
const COST_PER_TWEET = 0.01; // $0.01 per tweet read

// Cache: minimum minutes between scrapes
const CACHE_MIN_MINUTES = 30;

function getClient() {
  const token = process.env.TWITTER_BEARER_TOKEN;
  if (!token) {
    throw new Error('TWITTER_BEARER_TOKEN is not set in .env');
  }
  return new TwitterApi(token).readOnly.v2;
}

function getStartTime() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString();
}

function processTweets(tweetsData, includes) {
  const users = new Map();
  if (includes?.users) {
    for (const u of includes.users) {
      users.set(u.id, u);
    }
  }

  const media = new Map();
  if (includes?.media) {
    for (const m of includes.media) {
      media.set(m.media_key, m);
    }
  }

  const tweets = [];
  for (const t of tweetsData) {
    const author = users.get(t.author_id) || {};

    // Get first photo/image attachment
    let mediaUrl = null;
    if (t.attachments?.media_keys) {
      for (const key of t.attachments.media_keys) {
        const m = media.get(key);
        if (m && m.type === 'photo' && m.url) {
          mediaUrl = m.url;
          break;
        }
      }
    }

    tweets.push({
      id: t.id,
      text: t.text || '',
      username: author.username || 'unknown',
      name: author.name || '',
      avatar_url: author.profile_image_url || null,
      likes: t.public_metrics?.like_count || 0,
      retweets: t.public_metrics?.retweet_count || 0,
      replies: t.public_metrics?.reply_count || 0,
      views: t.public_metrics?.impression_count || 0,
      created_at: t.created_at
        ? new Date(t.created_at).toISOString()
        : new Date().toISOString(),
      media_url: mediaUrl,
    });
  }
  return tweets;
}

/**
 * Check if we scraped recently (within CACHE_MIN_MINUTES).
 * Returns the cached scrape log entry if fresh, null otherwise.
 */
function getCachedScrape() {
  const last = queryOne(`
    SELECT * FROM scrape_log
    WHERE status = 'done'
      AND finished_at >= datetime('now', '-${CACHE_MIN_MINUTES} minutes')
    ORDER BY id DESC LIMIT 1
  `);
  return last || null;
}

/**
 * Test run: fetch 10 recent tweets and return cost estimate without saving to DB.
 */
export async function testCost() {
  const client = getClient();

  const result = await client.search(SEARCH_QUERY, {
    max_results: 10,
    start_time: getStartTime(),
    'tweet.fields': 'created_at,public_metrics,author_id,attachments',
    'user.fields': 'username,name,profile_image_url',
    'media.fields': 'url,type',
    expansions: 'author_id,attachments.media_keys',
  });

  const rawTweets = result.data?.data || [];
  const includes = result.data?.includes || {};
  const tweets = processTweets(rawTweets, includes);
  const tweetCount = tweets.length;

  // Track API usage
  execute(
    `INSERT INTO api_usage_log (endpoint, tweets_requested, tweets_returned, estimated_cost)
     VALUES (?, ?, ?, ?)`,
    ['test-cost', 10, tweetCount, tweetCount * COST_PER_TWEET]
  );

  return {
    tweets,
    tweetCount,
    costPerTweet: COST_PER_TWEET,
    estimatedCost: tweetCount * COST_PER_TWEET,
    monthlyCapBasic: 10000,
    monthlyCostBasic: 100,
    projectedMonthlyCost: null,
  };
}

/**
 * Full scrape: paginate through recent tweets mentioning @DlicomApp (last 7 days).
 * Uses caching to avoid redundant API calls.
 */
export async function runScrape() {
  // Check cache first
  const cached = getCachedScrape();
  if (cached) {
    const minutesAgo = Math.round(
      (Date.now() - new Date(cached.finished_at + 'Z').getTime()) / 60000
    );
    console.log(`[scraper] cached result from ${minutesAgo}m ago, skipping API call`);
    return {
      status: 'cached',
      newTweets: 0,
      apiTweetsRead: 0,
      estimatedCost: 0,
      cachedMinutesAgo: minutesAgo,
    };
  }

  const client = getClient();

  execute("INSERT INTO scrape_log (started_at, status) VALUES (datetime('now'), 'running')");
  const logId = queryOne("SELECT last_insert_rowid() as id").id;

  let totalApiTweets = 0;
  let count = 0;

  try {
    const paginator = await client.search(SEARCH_QUERY, {
      max_results: 100,
      start_time: getStartTime(),
      'tweet.fields': 'created_at,public_metrics,author_id',
      'user.fields': 'username,name,profile_image_url',
      expansions: 'author_id',
    });

    // Process first page
    const firstPage = paginator.data;
    const rawTweets = firstPage?.data || [];
    const includes = firstPage?.includes || {};
    const allTweets = processTweets(rawTweets, includes);
    totalApiTweets += allTweets.length;

    // Fetch up to 4 more pages (500 tweets max total)
    let pagesLeft = 4;
    let nextToken = firstPage?.meta?.next_token;

    while (nextToken && pagesLeft > 0) {
      const nextPage = await client.search(SEARCH_QUERY, {
        max_results: 100,
        start_time: getStartTime(),
        'tweet.fields': 'created_at,public_metrics,author_id',
        'user.fields': 'username,name,profile_image_url',
        expansions: 'author_id',
        next_token: nextToken,
      });

      const pageData = nextPage.data;
      const pageTweets = processTweets(pageData?.data || [], pageData?.includes || {});
      allTweets.push(...pageTweets);
      totalApiTweets += pageTweets.length;
      nextToken = pageData?.meta?.next_token;
      pagesLeft--;
    }

    // Store tweets in DB
    for (const tweet of allTweets) {
      if (!tweet.id || !tweet.text) continue;

      const existing = queryOne("SELECT id FROM tweets WHERE id = ?", [tweet.id]);
      if (existing) continue;

      execute(
        `INSERT OR IGNORE INTO tweets (id, author_username, author_display_name, text, likes, retweets, replies, views, created_at, scraped_at, media_url, avatar_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)`,
        [tweet.id, tweet.username, tweet.name, tweet.text, tweet.likes, tweet.retweets, tweet.replies, tweet.views, tweet.created_at, tweet.media_url, tweet.avatar_url]
      );

      const authorExists = queryOne("SELECT username FROM authors WHERE username = ?", [tweet.username]);
      if (authorExists) {
        execute(
          `UPDATE authors SET
            display_name = CASE WHEN ? != '' THEN ? ELSE display_name END,
            total_mentions = total_mentions + 1,
            total_likes_received = total_likes_received + ?,
            last_seen = MAX(last_seen, ?)
          WHERE username = ?`,
          [tweet.name, tweet.name, tweet.likes, tweet.created_at, tweet.username]
        );
      } else {
        execute(
          `INSERT INTO authors (username, display_name, total_mentions, total_likes_received, first_seen, last_seen)
           VALUES (?, ?, 1, ?, ?, ?)`,
          [tweet.username, tweet.name, tweet.likes, tweet.created_at, tweet.created_at]
        );
      }

      count++;
    }

    // Track API usage
    execute(
      `INSERT INTO api_usage_log (endpoint, tweets_requested, tweets_returned, estimated_cost)
       VALUES (?, ?, ?, ?)`,
      ['scrape', 500, totalApiTweets, totalApiTweets * COST_PER_TWEET]
    );

    execute(
      "UPDATE scrape_log SET finished_at = datetime('now'), tweets_found = ?, status = 'done' WHERE id = ?",
      [count, logId]
    );

    console.log(`[scraper] finished, ${count} new tweets from ${totalApiTweets} total API results`);
    return { status: 'done', newTweets: count, apiTweetsRead: totalApiTweets, estimatedCost: totalApiTweets * COST_PER_TWEET };
  } catch (err) {
    execute(
      "UPDATE scrape_log SET finished_at = datetime('now'), status = 'error' WHERE id = ?",
      [logId]
    );
    console.error('[scraper] error:', err.message);
    throw err;
  }
}

export function getLastScrape() {
  return queryOne('SELECT * FROM scrape_log ORDER BY id DESC LIMIT 1');
}

export function getApiUsage() {
  const total = queryOne('SELECT SUM(tweets_returned) as total_tweets, SUM(estimated_cost) as total_cost FROM api_usage_log');
  const today = queryOne(`
    SELECT SUM(tweets_returned) as tweets, SUM(estimated_cost) as cost
    FROM api_usage_log WHERE DATE(created_at) = DATE('now')
  `);
  const recent = queryAll('SELECT * FROM api_usage_log ORDER BY id DESC LIMIT 10');
  return {
    totalTweetsRead: total?.total_tweets || 0,
    totalCost: total?.total_cost || 0,
    todayTweets: today?.tweets || 0,
    todayCost: today?.cost || 0,
    recentRequests: recent,
    monthlyCapBasic: 10000,
    monthlyCostBasic: 100,
    costPerTweet: COST_PER_TWEET,
  };
}
