const BASE = '/api';

async function fetchJson<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, opts);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export interface Tweet {
  id: string;
  author_username: string;
  author_display_name: string;
  text: string;
  likes: number;
  retweets: number;
  replies: number;
  views: number;
  created_at: string;
  media_url: string | null;
  avatar_url: string | null;
}

export interface RecapSummary {
  totalMentions: number;
  totalViews: number;
  totalLikes: number;
  totalRetweets: number;
  uniqueAuthors: number;
  engagementRate: number;
  peakHour: { hour: number; count: number } | null;
}

export interface RecapAuthor {
  username: string;
  display_name: string;
  total_mentions: number;
  total_likes_received: number;
  total_views: number;
  avatar_url: string | null;
}

export interface ActivityPoint {
  period: string;
  mentions: number;
  total_likes: number;
  engagement_rate: number;
}

export interface ScrapeLog {
  id: number;
  started_at: string;
  finished_at: string | null;
  tweets_found: number;
  status: string;
}

export interface RecapData {
  dateRange: { from: string; to: string };
  summary: RecapSummary;
  allPosts: Tweet[];
  topPosts: Tweet[];
  topAuthors: RecapAuthor[];
  activity: ActivityPoint[];
  lastScrape: ScrapeLog | null;
}

export interface ScrapeResult {
  status: string;
  newTweets: number;
  apiTweetsRead: number;
  estimatedCost: number;
  cachedMinutesAgo?: number;
}

export interface TestCostResult {
  tweets: Tweet[];
  tweetCount: number;
  costPerTweet: number;
  estimatedCost: number;
  monthlyCapBasic: number;
  monthlyCostBasic: number;
}

export interface ApiUsage {
  totalTweetsRead: number;
  totalCost: number;
  todayTweets: number;
  todayCost: number;
  recentRequests: Array<{
    id: number;
    created_at: string;
    endpoint: string;
    tweets_requested: number;
    tweets_returned: number;
    estimated_cost: number;
  }>;
  monthlyCapBasic: number;
  monthlyCostBasic: number;
  costPerTweet: number;
}

export const api = {
  getRecap: () => fetchJson<RecapData>('/recap'),
  startScrape: () => fetchJson<ScrapeResult>('/scrape', { method: 'POST' }),
  getScrapeStatus: () => fetchJson<{ inProgress: boolean; lastScrape: ScrapeLog | null }>('/scrape/status'),
  testCost: () => fetchJson<TestCostResult>('/test-cost', { method: 'POST' }),
  getApiUsage: () => fetchJson<ApiUsage>('/usage'),
};
