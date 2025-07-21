<script lang="ts">
  import type { User } from '@nhost/nhost-js';

  export let user: User;

  // Placeholder data - replace with actual data from your backend
  const stats = {
    goodFaithRate: 88,
    sourceAccuracy: 95,
    reputationScore: 750
  };

  const recentDiscussions = [
    { id: 1, title: 'Is utilitarianism a complete ethical framework?', snippet: 'I argue that while useful, it fails to account for...', author: 'Alice', timestamp: '2h ago' },
    { id: 2, title: 'The role of AI in moderating online discourse', snippet: 'Can an algorithm truly understand context and intent? Let\'s explore...', author: 'Bob', timestamp: '5h ago' },
    { id: 3, title: 'Debating the merits of decentralized social media', snippet: 'Freedom from central control vs. the challenge of content moderation...', author: 'Charlie', timestamp: '1d ago' }
  ];

  const drafts = [
    { id: 1, title: 'A critique of pure reason, simplified' },
    { id: 2, title: 'Re: The role of AI in moderating' }
  ];

  const pinnedThreads = [
    { id: 1, title: 'Community Guidelines & Best Practices' }
  ];

  const leaderboard = [
    { rank: 1, name: 'Eve', score: 1250 },
    { rank: 2, name: 'Mallory', score: 1100 },
    { rank: 3, name: 'Trent', score: 980 },
    { rank: 4, name: 'Alice', score: 950 },
    { rank: 5, name: 'Bob', score: 890 }
  ];

  const currentUserRank = 12;

  const notifications = [
    { id: 1, type: 'mention', text: 'Dave mentioned you in "The Paradox of Tolerance"' },
    { id: 2, type: 'review', text: 'Your post "On the nature of evidence" is pending review' },
    { id: 3, type: 'alert', text: 'A source in your post needs verification' }
  ];
</script>

<div class="dashboard-container">
  <!-- 1. Welcome & At-a-Glance Metrics -->
  <section class="welcome-card">
    <div class="welcome-card-content">
        <h1 class="welcome-title">
          Welcome back, {user.displayName}!
        </h1>
        <div class="stats-container">
          <div class="stat-item">
            <h3 class="stat-title">Good-Faith Rate</h3>
            <p class="stat-value">{stats.goodFaithRate}%</p>
          </div>
          <div class="stat-item">
            <h3 class="stat-title">Source Accuracy</h3>
            <p class="stat-value">{stats.sourceAccuracy}%</p>
          </div>
          <div class="stat-item">
            <h3 class="stat-title">Reputation Score</h3>
            <p class="stat-value">{stats.reputationScore}</p>
          </div>
        </div>
    </div>
  </section>

  <!-- Main Content Grid -->
  <div class="dashboard-grid">
    <!-- 3. Recent & Pinned Discussions (Left Column) -->
    <main class="main-content">
      <h2 class="section-title">Recent Discussions</h2>
      <div class="discussions-list">
        {#each recentDiscussions as discussion}
          <div class="discussion-card">
            <h3 class="discussion-title">{discussion.title}</h3>
            <p class="discussion-snippet">{discussion.snippet}</p>
            <p class="discussion-meta">by {discussion.author} &middot; {discussion.timestamp}</p>
          </div>
        {/each}
      </div>
      <button class="btn-secondary load-more">Load More</button>
    </main>

    <!-- Sidebar (Right Column) -->
    <aside class="sidebar">
      <!-- Quick Actions -->
      <section class="card">
        <h2 class="section-title">Quick Actions</h2>
        <div class="quick-actions">
          <button class="btn-primary">
            <svg xmlns="http://www.w3.org/2000/svg" class="btn-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" /></svg>
            New Discussion
          </button>
          <button class="btn-secondary">
            <svg xmlns="http://www.w3.org/2000/svg" class="btn-icon" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg>
            New Reply
          </button>
          <button class="btn-secondary">
            <svg xmlns="http://www.w3.org/2000/svg" class="btn-icon" viewBox="0 0 20 20" fill="currentColor"><path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 11a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1v-1z" /></svg>
            Invite Collaborator
          </button>
        </div>
      </section>

      <!-- Your Drafts -->
      <section class="card">
        <h2 class="section-title">Your Drafts</h2>
        <ul class="list">
          {#each drafts as draft}
            <li class="list-item">{draft.title}</li>
          {/each}
        </ul>
      </section>

      <!-- Pinned Threads -->
      <section class="card">
        <h2 class="section-title">Pinned Threads</h2>
        <ul class="list">
          {#each pinnedThreads as thread}
            <li class="list-item">{thread.title}</li>
          {/each}
        </ul>
      </section>

      <!-- 4. Leaderboard -->
      <section class="card">
        <h2 class="section-title">Top Contributors</h2>
        <ul class="list">
          {#each leaderboard as contributor}
            <li class="leaderboard-item">
              <span>{contributor.rank}. {contributor.name}</span>
              <span class="leaderboard-score">{contributor.score} pts</span>
            </li>
          {/each}
        </ul>
        <p class="current-rank">You're #{currentUserRank} this week!</p>
      </section>

      <!-- 5. Notifications -->
      <section class="card">
        <h2 class="section-title">Notifications</h2>
        <ul class="list">
          {#each notifications as notification}
            <li class="notification-item">
              <span class="notification-icon">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>
              </span>
              <p>{notification.text}</p>
            </li>
          {/each}
        </ul>
      </section>
    </aside>
  </div>

  <!-- 6. Learning & Resources -->
  <footer class="dashboard-footer">
    <h2 class="section-title">Learning & Resources</h2>
    <div class="footer-links">
      <a href="#">How to Craft Good-Faith Arguments</a>
      <a href="#">Citation Best Practices</a>
      <a href="#">Community Guidelines</a>
    </div>
  </footer>
</div>

<style>
  .dashboard-container {
    padding: 1rem;
    max-width: 1280px;
    margin: 0 auto;
  }
  @media (min-width: 640px) {
    .dashboard-container {
      padding: 1.5rem;
    }
  }
  @media (min-width: 1024px) {
    .dashboard-container {
      padding: 2rem;
    }
  }

  /* Welcome Card */
  .welcome-card {
    background-color: var(--color-surface);
    padding: 1.25rem;
    border-radius: var(--border-radius-md);
    border: 1px solid var(--color-border);
    box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
    margin-bottom: 2rem;
  }
  .welcome-card-content {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .welcome-title {
    font-size: 1.5rem;
    font-weight: 700;
    font-family: var(--font-family-display);
    color: var(--color-text-primary);
  }
  .stats-container {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .stat-item {
    padding: 0.75rem;
    border-radius: var(--border-radius-md);
    transition: background-color 150ms ease-in-out;
  }
  .stat-item:hover {
    background-color: var(--color-surface-alt);
  }
  .stat-title {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--color-text-secondary);
  }
  .stat-value {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  /* Grid */
  .dashboard-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 2rem;
  }
  @media (min-width: 1024px) {
    .dashboard-grid {
      grid-template-columns: repeat(3, 1fr);
    }
    .main-content {
      grid-column: span 2 / span 2;
    }
    .sidebar {
      grid-column: span 1 / span 1;
    }
  }
  .main-content {
    margin-bottom: 2rem;
  }
  @media (min-width: 1024px) {
    .main-content {
      margin-bottom: 0;
    }
  }
  .sidebar {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  /* Cards */
  .card {
    background-color: var(--color-surface);
    padding: 1.25rem;
    border-radius: var(--border-radius-md);
    border: 1px solid var(--color-border);
    box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  }
  .section-title {
    font-size: 1.25rem;
    font-weight: 600;
    margin-bottom: 1rem;
    font-family: var(--font-family-display);
    color: var(--color-text-primary);
  }

  /* Discussion List */
  .discussions-list {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  .discussion-card {
    background-color: var(--color-surface);
    padding: 1.25rem;
    border-radius: var(--border-radius-md);
    border: 1px solid var(--color-border);
    box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
    transition: box-shadow 150ms ease-in-out;
    cursor: pointer;
  }
  .discussion-card:hover {
    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  }
  .discussion-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-primary);
  }
  .discussion-snippet {
    color: var(--color-text-secondary);
    font-size: 0.875rem;
    margin: 0.25rem 0;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .discussion-meta {
    font-size: 0.75rem;
    color: var(--color-text-secondary);
  }
  .load-more {
    margin-top: 1.5rem;
    width: 100%;
  }

  /* Sidebar Lists */
  .list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    list-style: none;
    padding: 0;
  }
  .list-item {
    color: var(--color-primary);
    cursor: pointer;
  }
  .list-item:hover {
    text-decoration: underline;
  }
  .leaderboard-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .leaderboard-score {
    font-size: 0.875rem;
    color: var(--color-text-secondary);
  }
  .current-rank {
    margin-top: 1rem;
    text-align: center;
    background-color: var(--color-surface-alt);
    padding: 0.5rem;
    border-radius: var(--border-radius-md);
    font-size: 0.875rem;
  }
  .notification-item {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    font-size: 0.875rem;
  }
  .notification-icon {
    margin-top: 0.25rem;
    color: var(--color-accent);
  }
  .notification-icon svg {
      width: 1.25rem;
      height: 1.25rem;
  }

  /* Quick Actions */
  .quick-actions {
    display: inline-flex;
    flex-direction: column;
    gap: 1rem;
  }

  /* Buttons */
  .btn-primary, .btn-secondary {
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    padding: 0.5rem 1rem;
    border-radius: var(--border-radius-md);
    transition: all 150ms ease-in-out;
    cursor: pointer;
  }
  .btn-primary {
    background-color: var(--color-primary);
    color: var(--color-surface);
    box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  }
  .btn-primary:hover {
    opacity: 0.9;
  }
  .btn-secondary {
    background-color: var(--color-surface);
    color: var(--color-text-primary);
    border: 1px solid var(--color-border);
    box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  }
  .btn-secondary:hover {
    background-color: var(--color-surface-alt);
  }
  .btn-primary:focus, .btn-secondary:focus {
    outline: none;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 20%, transparent);
  }
  .btn-icon {
    width: 1.25rem;
    height: 1.25rem;
    margin-right: 0.5rem;
  }

  /* Footer */
  .dashboard-footer {
    margin-top: 3rem;
    padding-top: 2rem;
    border-top: 1px solid var(--color-border);
  }
  .footer-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.5rem;
  }
  .footer-links a {
    color: var(--color-primary);
  }
  .footer-links a:hover {
    text-decoration: underline;
  }
</style>
