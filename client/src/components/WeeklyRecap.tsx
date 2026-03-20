import { useEffect, useState, useCallback, useMemo } from 'react';
import { api, RecapData } from '../api.ts';
import { AreaChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import styles from '../styles/WeeklyRecap.module.css';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function formatHour(hour: number) {
  const h = hour % 12 || 12;
  return `${h}:00 ${hour < 12 ? 'AM' : 'PM'}`;
}

function formatNumber(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function WeeklyRecap() {
  const [data, setData] = useState<RecapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.getRecap());
    } catch (err) {
      console.error('Failed to load recap:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredPosts = useMemo(() => {
    if (!data) return [];
    if (!search.trim()) return data.allPosts;
    const q = search.toLowerCase().trim();
    return data.allPosts.filter(
      (t) =>
        t.author_username.toLowerCase().includes(q) ||
        t.author_display_name.toLowerCase().includes(q) ||
        t.text.toLowerCase().includes(q)
    );
  }, [data, search]);

  if (loading && !data) {
    return <div className={styles.loading}>Loading recap...</div>;
  }

  if (!data) return null;

  const { summary, topPosts, topAuthors, activity, dateRange } = data;

  return (
    <div className={styles.recap}>
      {/* Date Range Header */}
      <div className={styles.dateRange}>
        <span className={styles.dateLabel}>Weekly Recap</span>
        <span className={styles.datePeriod}>
          {formatDate(dateRange.from)} — {formatDate(dateRange.to)}
        </span>
      </div>

      {/* Summary Cards */}
      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <div className={styles.summaryValue}>{summary.totalMentions}</div>
          <div className={styles.summaryLabel}>Posts</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryValue}>{formatNumber(summary.totalViews)}</div>
          <div className={styles.summaryLabel}>Total Views</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryValue}>{formatNumber(summary.totalLikes)}</div>
          <div className={styles.summaryLabel}>Total Likes</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryValue}>{summary.engagementRate}%</div>
          <div className={styles.summaryLabel}>Engagement Rate</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryValue}>{summary.uniqueAuthors}</div>
          <div className={styles.summaryLabel}>Unique Authors</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryValue}>
            {summary.peakHour ? formatHour(summary.peakHour.hour) : '—'}
          </div>
          <div className={styles.summaryLabel}>
            Peak Hour{summary.peakHour ? ` (${summary.peakHour.count} posts)` : ''}
          </div>
        </div>
      </div>

      {/* Activity Chart */}
      {activity.length > 0 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Daily Activity</h2>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={activity} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradMentions" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3B4CFF" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#3B4CFF" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1e1e2e" strokeDasharray="3 3" />
              <XAxis
                dataKey="period"
                tick={{ fill: '#8888a0', fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: '#1e1e2e' }}
                tickFormatter={(v) => formatDate(v)}
              />
              <YAxis
                yAxisId="left"
                tick={{ fill: '#8888a0', fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fill: '#8888a0', fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                contentStyle={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '8px', fontSize: '13px' }}
                labelStyle={{ color: '#8888a0' }}
                labelFormatter={(v) => formatDate(v as string)}
                formatter={(value: number, name: string) => {
                  if (name === 'engagement_rate') return [`${value}%`, 'Engagement'];
                  return [value, 'Posts'];
                }}
              />
              <Area yAxisId="left" type="monotone" dataKey="mentions" stroke="#3B4CFF" strokeWidth={2} fill="url(#gradMentions)" />
              <Line yAxisId="right" type="monotone" dataKey="engagement_rate" stroke="#22c55e" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top Posts */}
      {topPosts.length > 0 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Top Posts</h2>
          <div className={styles.postList}>
            {topPosts.map((t, i) => (
              <div key={t.id} className={styles.postCard}>
                <div className={styles.postRank}>#{i + 1}</div>
                <div className={styles.postContent}>
                  <div className={styles.postMeta}>
                    <span className={styles.postAuthorGroup}>
                      {t.avatar_url && (
                        <img src={t.avatar_url} alt="" className={styles.postAvatar} />
                      )}
                      <a
                        href={`https://x.com/${t.author_username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.postAuthor}
                      >
                        @{t.author_username}
                      </a>
                    </span>
                    <span className={styles.postDate}>{formatDateTime(t.created_at)}</span>
                  </div>
                  <p className={styles.postText}>{t.text}</p>
                  {t.media_url && (
                    <img
                      src={t.media_url}
                      alt=""
                      className={styles.postImage}
                      loading="lazy"
                    />
                  )}
                  <div className={styles.postStats}>
                    <span>{formatNumber(t.views)} views</span>
                    <span>{formatNumber(t.likes)} likes</span>
                    <span>{formatNumber(t.retweets)} RT</span>
                    <span>{t.replies} replies</span>
                    <a
                      href={`https://x.com/${t.author_username}/status/${t.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.postLink}
                    >
                      View
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Authors */}
      {topAuthors.length > 0 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Top Authors</h2>
          <div className={styles.authorList}>
            {topAuthors.map((a, i) => (
              <div key={a.username} className={styles.authorRow}>
                <div className={styles.authorRank}>{i + 1}</div>
                {a.avatar_url ? (
                  <img src={a.avatar_url} alt="" className={styles.authorAvatarImg} />
                ) : (
                  <div className={styles.authorAvatar}>
                    {(a.display_name || a.username).charAt(0).toUpperCase()}
                  </div>
                )}
                <div className={styles.authorInfo}>
                  <div className={styles.authorName}>{a.display_name || a.username}</div>
                  <a
                    href={`https://x.com/${a.username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.authorHandle}
                  >
                    @{a.username}
                  </a>
                </div>
                <div className={styles.authorStats}>
                  <span className={styles.authorCount}>{a.total_mentions}</span>
                  <span className={styles.authorLabel}>posts</span>
                </div>
                <div className={styles.authorStats}>
                  <span className={styles.authorCount}>{formatNumber(a.total_likes_received)}</span>
                  <span className={styles.authorLabel}>likes</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Posts */}
      <div className={styles.section}>
        <div className={styles.allPostsHeader}>
          <h2 className={styles.sectionTitle}>
            All Posts
            <span className={styles.sectionCount}>
              {search.trim() ? `${filteredPosts.length} / ${data.allPosts.length}` : data.allPosts.length}
            </span>
          </h2>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search by @handle or text..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {filteredPosts.length === 0 ? (
          <div className={styles.empty}>
            {search.trim() ? 'No posts match your search' : 'No posts this week'}
          </div>
        ) : (
          <div className={styles.allPostsList}>
            {filteredPosts.map((t) => (
              <div key={t.id} className={styles.allPostCard}>
                <div className={styles.postMeta}>
                  <span className={styles.postAuthorGroup}>
                    {t.avatar_url && (
                      <img src={t.avatar_url} alt="" className={styles.postAvatar} />
                    )}
                    <a
                      href={`https://x.com/${t.author_username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.postAuthor}
                    >
                      @{t.author_username}
                    </a>
                  </span>
                  <span className={styles.postDate}>{formatDateTime(t.created_at)}</span>
                </div>
                <p className={styles.allPostText}>{t.text}</p>
                <div className={styles.postStats}>
                  <span>{formatNumber(t.views)} views</span>
                  <span>{formatNumber(t.likes)} likes</span>
                  <span>{formatNumber(t.retweets)} RT</span>
                  <a
                    href={`https://x.com/${t.author_username}/status/${t.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.postLink}
                  >
                    View
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
