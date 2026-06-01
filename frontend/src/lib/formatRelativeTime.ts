/**
 * Format a timestamp as a human-readable relative time string.
 *
 * @param timestamp - ISO 8601 timestamp string, or undefined/null
 * @returns A relative time string like "5 minutes ago", "2 hours ago", "3 days ago",
 *          "Just now" for <60s, "Never" for undefined/null, or "Unknown" on parse error
 */
export function formatRelativeTime(timestamp?: string | null): string {
  if (!timestamp) {
    return 'Never';
  }

  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSeconds < 60) {
      return 'Just now';
    } else if (diffMinutes < 60) {
      return `${String(diffMinutes)} minute${diffMinutes !== 1 ? 's' : ''} ago`;
    } else if (diffHours < 24) {
      return `${String(diffHours)} hour${diffHours !== 1 ? 's' : ''} ago`;
    } else {
      return `${String(diffDays)} day${diffDays !== 1 ? 's' : ''} ago`;
    }
  } catch {
    return 'Unknown';
  }
}
