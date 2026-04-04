import { useCallback, useEffect, useState } from 'react'
import {
  createDiscussionPost,
  createDiscussionReply,
  deleteDiscussionPost,
  deleteDiscussionReply,
  fetchDiscussions,
  fetchDiscussionThread,
  voteDiscussion,
} from '../api'
import type {
  AuthUser,
  DiscussionPost,
  DiscussionReply,
  VoteResponse,
} from '../types'

// ─── Helpers ────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diff = Math.max(0, now - then)

  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`

  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`

  const years = Math.floor(months / 12)
  return `${years}y ago`
}

function userInitial(username: string): string {
  return (username[0] ?? '?').toUpperCase()
}

const AVATAR_COLORS = [
  '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4',
  '#3b82f6', '#2563eb',
]

function avatarColor(userId: number): string {
  return AVATAR_COLORS[userId % AVATAR_COLORS.length]
}

// ─── Types ──────────────────────────────────────────────────────────

type SortMode = 'newest' | 'top'

type DiscussionSectionProps = {
  ticker: string
  user: AuthUser | null
  theme: 'light' | 'dark'
}

// ─── Main Component ─────────────────────────────────────────────────

export function DiscussionSection({ ticker, user, theme }: DiscussionSectionProps) {
  const [posts, setPosts] = useState<DiscussionPost[]>([])
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<SortMode>('newest')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  // Thread view
  const [activeThread, setActiveThread] = useState<DiscussionPost | null>(null)
  const [isLoadingThread, setIsLoadingThread] = useState(false)

  // Compose new post
  const [showCompose, setShowCompose] = useState(false)
  const [composeTitle, setComposeTitle] = useState('')
  const [composeBody, setComposeBody] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [composeError, setComposeError] = useState('')

  const loadPosts = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const data = await fetchDiscussions(ticker, page, sort)
      setPosts(data.posts)
      setTotalPages(data.totalPages)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load discussions.')
    } finally {
      setIsLoading(false)
    }
  }, [ticker, page, sort])

  useEffect(() => {
    loadPosts()
  }, [loadPosts])

  const openThread = useCallback(async (postId: number) => {
    setIsLoadingThread(true)
    try {
      const thread = await fetchDiscussionThread(ticker, postId)
      setActiveThread(thread)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load thread.')
    } finally {
      setIsLoadingThread(false)
    }
  }, [ticker])

  const handleCreatePost = useCallback(async () => {
    if (!composeTitle.trim() || !composeBody.trim()) {
      setComposeError('Title and body are required.')
      return
    }
    setIsSubmitting(true)
    setComposeError('')
    try {
      await createDiscussionPost(ticker, composeTitle, composeBody)
      setComposeTitle('')
      setComposeBody('')
      setShowCompose(false)
      setPage(1)
      setSort('newest')
      await loadPosts()
    } catch (err: unknown) {
      setComposeError(err instanceof Error ? err.message : 'Failed to create post.')
    } finally {
      setIsSubmitting(false)
    }
  }, [ticker, composeTitle, composeBody, loadPosts])

  const handleVotePost = useCallback(async (postId: number, value: 1 | -1) => {
    if (!user) return
    try {
      const result: VoteResponse = await voteDiscussion(postId, undefined, value)
      // Update in posts list
      setPosts(prev => prev.map(p =>
        p.id === postId
          ? { ...p, upvotes: result.upvotes, downvotes: result.downvotes, userVote: result.userVote }
          : p
      ))
      // Update in active thread
      if (activeThread?.id === postId) {
        setActiveThread(prev =>
          prev ? { ...prev, upvotes: result.upvotes, downvotes: result.downvotes, userVote: result.userVote } : prev
        )
      }
    } catch { /* silent */ }
  }, [user, activeThread])

  const handleDeletePost = useCallback(async (postId: number) => {
    if (!user) return
    try {
      await deleteDiscussionPost(ticker, postId)
      if (activeThread?.id === postId) {
        setActiveThread(null)
      }
      setPosts(prev => prev.filter(p => p.id !== postId))
    } catch { /* silent */ }
  }, [user, ticker, activeThread])

  const handleReplyCreated = useCallback(async () => {
    if (!activeThread) return
    // Reload full thread to get updated replies
    const thread = await fetchDiscussionThread(ticker, activeThread.id)
    setActiveThread(thread)
    // Also update reply count in list
    setPosts(prev => prev.map(p =>
      p.id === thread.id ? { ...p, replyCount: thread.replies?.length ?? p.replyCount } : p
    ))
  }, [activeThread, ticker])

  // ─── Thread Detail View ──────────────────────

  if (activeThread) {
    return (
      <div className={`disc-layout reveal theme-${theme}`}>
        <div className="disc-thread-header">
          <button
            type="button"
            className="disc-back-btn"
            onClick={() => setActiveThread(null)}
          >
            ← Back to Discussions
          </button>
        </div>

        {isLoadingThread ? (
          <div className="disc-loading">
            <div className="disc-spinner" />
            <p>Loading thread...</p>
          </div>
        ) : (
          <div className="disc-thread">
            <div className="disc-thread-post panel">
              <div className="disc-post-meta">
                <span
                  className="disc-avatar"
                  style={{ backgroundColor: avatarColor(activeThread.author.id) }}
                >
                  {userInitial(activeThread.author.username)}
                </span>
                <span className="disc-author">{activeThread.author.username}</span>
                <span className="disc-time">{relativeTime(activeThread.createdAt)}</span>
              </div>
              <h2 className="disc-thread-title">{activeThread.title}</h2>
              <p className="disc-thread-body">{activeThread.body}</p>
              <div className="disc-post-actions">
                <VoteButtons
                  upvotes={activeThread.upvotes}
                  downvotes={activeThread.downvotes}
                  userVote={activeThread.userVote}
                  onVote={(v) => handleVotePost(activeThread.id, v)}
                  disabled={!user}
                />
                {user?.id === activeThread.author.id && (
                  <button
                    type="button"
                    className="disc-delete-btn"
                    onClick={() => handleDeletePost(activeThread.id)}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>

            <div className="disc-replies-section">
              <h3 className="disc-replies-heading">
                {activeThread.replies?.length ?? 0} {(activeThread.replies?.length ?? 0) === 1 ? 'Reply' : 'Replies'}
              </h3>

              {user ? (
                <ReplyComposer
                  ticker={ticker}
                  postId={activeThread.id}
                  onReplyCreated={handleReplyCreated}
                />
              ) : (
                <p className="disc-login-prompt">
                  <a href="/login">Log in</a> to reply to this discussion.
                </p>
              )}

              {activeThread.replies && activeThread.replies.length > 0 ? (
                <div className="disc-reply-list">
                  {activeThread.replies.map((reply) => (
                    <ReplyNode
                      key={reply.id}
                      reply={reply}
                      ticker={ticker}
                      postId={activeThread.id}
                      user={user}
                      depth={0}
                      onReplyCreated={handleReplyCreated}
                    />
                  ))}
                </div>
              ) : (
                <p className="disc-no-replies">No replies yet. Be the first to respond!</p>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ─── Posts List View ─────────────────────────

  return (
    <div className={`disc-layout reveal theme-${theme}`}>
      <div className="disc-header panel">
        <div className="disc-header-top">
          <div>
            <h2 className="disc-section-title">
              <span className="disc-icon" aria-hidden="true">💬</span>
              Community Discussion
            </h2>
            <p className="disc-section-sub">
              Discuss {ticker} with fellow investors — share insights, analysis, and opinions.
            </p>
          </div>
          {user && (
            <button
              type="button"
              className="disc-new-post-btn"
              onClick={() => setShowCompose(true)}
            >
              + New Post
            </button>
          )}
        </div>

        {!user && (
          <div className="disc-login-banner">
            <span className="disc-login-icon" aria-hidden="true">🔒</span>
            <a href="/login">Log in</a> or <a href="/signup">create an account</a> to post, reply, and vote.
          </div>
        )}

        <div className="disc-sort-row">
          <button
            type="button"
            className={`disc-sort-btn ${sort === 'newest' ? 'active' : ''}`}
            onClick={() => { setSort('newest'); setPage(1) }}
          >
            🕐 Newest
          </button>
          <button
            type="button"
            className={`disc-sort-btn ${sort === 'top' ? 'active' : ''}`}
            onClick={() => { setSort('top'); setPage(1) }}
          >
            🔥 Top
          </button>
        </div>
      </div>

      {/* Compose Modal */}
      {showCompose && (
        <div className="disc-compose-overlay" onClick={() => setShowCompose(false)}>
          <div className="disc-compose-card panel" onClick={(e) => e.stopPropagation()}>
            <h3>Start a new discussion about {ticker}</h3>
            <div className="disc-compose-field">
              <input
                type="text"
                placeholder="Discussion title..."
                value={composeTitle}
                onChange={(e) => setComposeTitle(e.target.value)}
                maxLength={200}
                className="disc-compose-input"
                id="disc-compose-title"
              />
            </div>
            <div className="disc-compose-field">
              <textarea
                placeholder="Share your thoughts, analysis, or question..."
                value={composeBody}
                onChange={(e) => setComposeBody(e.target.value)}
                className="disc-compose-textarea"
                rows={6}
                id="disc-compose-body"
              />
            </div>
            {composeError && <p className="disc-compose-error">{composeError}</p>}
            <div className="disc-compose-actions">
              <button
                type="button"
                className="disc-compose-cancel"
                onClick={() => setShowCompose(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="disc-compose-submit"
                onClick={handleCreatePost}
                disabled={isSubmitting || !composeTitle.trim() || !composeBody.trim()}
              >
                {isSubmitting ? 'Posting...' : 'Post Discussion'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="disc-loading">
          <div className="disc-spinner" />
          <p>Loading discussions...</p>
        </div>
      )}

      {/* Error */}
      {!isLoading && error && (
        <div className="error-card reveal">
          <h2>Could not load discussions</h2>
          <p>{error}</p>
          <button type="button" onClick={loadPosts}>Retry</button>
        </div>
      )}

      {/* Posts */}
      {!isLoading && !error && posts.length === 0 && (
        <div className="disc-empty panel">
          <span className="disc-empty-icon" aria-hidden="true">📭</span>
          <h3>No discussions yet for {ticker}</h3>
          <p>Be the first to start a conversation!</p>
          {user && (
            <button
              type="button"
              className="disc-new-post-btn"
              onClick={() => setShowCompose(true)}
            >
              Start Discussion
            </button>
          )}
        </div>
      )}

      {!isLoading && !error && posts.length > 0 && (
        <div className="disc-posts-list">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              user={user}
              onOpen={() => openThread(post.id)}
              onVote={(v) => handleVotePost(post.id, v)}
              onDelete={() => handleDeletePost(post.id)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!isLoading && totalPages > 1 && (
        <div className="disc-pagination">
          <button
            type="button"
            className="disc-page-btn"
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
          >
            ← Prev
          </button>
          <span className="disc-page-info">Page {page} of {totalPages}</span>
          <button
            type="button"
            className="disc-page-btn"
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Sub-Components ─────────────────────────────────────────────────

function PostCard({
  post,
  user,
  onOpen,
  onVote,
  onDelete,
}: {
  post: DiscussionPost
  user: AuthUser | null
  onOpen: () => void
  onVote: (v: 1 | -1) => void
  onDelete: () => void
}) {
  return (
    <article className="disc-post-card panel" onClick={onOpen}>
      <div className="disc-post-left">
        <VoteButtons
          upvotes={post.upvotes}
          downvotes={post.downvotes}
          userVote={post.userVote}
          onVote={onVote}
          disabled={!user}
          compact
        />
      </div>
      <div className="disc-post-right">
        <div className="disc-post-meta">
          <span
            className="disc-avatar disc-avatar-sm"
            style={{ backgroundColor: avatarColor(post.author.id) }}
          >
            {userInitial(post.author.username)}
          </span>
          <span className="disc-author">{post.author.username}</span>
          <span className="disc-time">{relativeTime(post.createdAt)}</span>
        </div>
        <h3 className="disc-post-title">{post.title}</h3>
        <p className="disc-post-preview">
          {post.body.length > 180 ? post.body.slice(0, 180) + '…' : post.body}
        </p>
        <div className="disc-post-footer">
          <span className="disc-reply-count">
            💬 {post.replyCount} {post.replyCount === 1 ? 'reply' : 'replies'}
          </span>
          {user?.id === post.author.id && (
            <button
              type="button"
              className="disc-delete-btn"
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

function VoteButtons({
  upvotes,
  downvotes,
  userVote,
  onVote,
  disabled,
  compact,
}: {
  upvotes: number
  downvotes: number
  userVote: number
  onVote: (v: 1 | -1) => void
  disabled: boolean
  compact?: boolean
}) {
  const score = upvotes - downvotes

  return (
    <div className={`disc-vote ${compact ? 'disc-vote-compact' : ''}`} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className={`disc-vote-btn disc-vote-up ${userVote === 1 ? 'active' : ''}`}
        onClick={() => onVote(1)}
        disabled={disabled}
        aria-label="Upvote"
        title={disabled ? 'Log in to vote' : 'Upvote'}
      >
        ▲
      </button>
      <span className={`disc-vote-score ${score > 0 ? 'positive' : score < 0 ? 'negative' : ''}`}>
        {score}
      </span>
      <button
        type="button"
        className={`disc-vote-btn disc-vote-down ${userVote === -1 ? 'active' : ''}`}
        onClick={() => onVote(-1)}
        disabled={disabled}
        aria-label="Downvote"
        title={disabled ? 'Log in to vote' : 'Downvote'}
      >
        ▼
      </button>
    </div>
  )
}

function ReplyComposer({
  ticker,
  postId,
  parentReplyId,
  onReplyCreated,
  onCancel,
}: {
  ticker: string
  postId: number
  parentReplyId?: number
  onReplyCreated: () => void
  onCancel?: () => void
}) {
  const [body, setBody] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = useCallback(async () => {
    if (!body.trim()) return
    setIsSubmitting(true)
    setError('')
    try {
      await createDiscussionReply(ticker, postId, body, parentReplyId)
      setBody('')
      onReplyCreated()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to post reply.')
    } finally {
      setIsSubmitting(false)
    }
  }, [body, ticker, postId, parentReplyId, onReplyCreated])

  return (
    <div className="disc-reply-composer">
      <textarea
        placeholder="Write a reply..."
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="disc-reply-textarea"
        rows={3}
      />
      {error && <p className="disc-compose-error">{error}</p>}
      <div className="disc-reply-composer-actions">
        {onCancel && (
          <button type="button" className="disc-compose-cancel" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button
          type="button"
          className="disc-compose-submit disc-reply-submit"
          onClick={handleSubmit}
          disabled={isSubmitting || !body.trim()}
        >
          {isSubmitting ? 'Posting...' : 'Reply'}
        </button>
      </div>
    </div>
  )
}

function ReplyNode({
  reply,
  ticker,
  postId,
  user,
  depth,
  onReplyCreated,
}: {
  reply: DiscussionReply
  ticker: string
  postId: number
  user: AuthUser | null
  depth: number
  onReplyCreated: () => void
}) {
  const [showReplyBox, setShowReplyBox] = useState(false)
  const [voteState, setVoteState] = useState({
    upvotes: reply.upvotes,
    downvotes: reply.downvotes,
    userVote: reply.userVote,
  })

  const handleVote = useCallback(async (value: 1 | -1) => {
    if (!user) return
    try {
      const result = await voteDiscussion(undefined, reply.id, value)
      setVoteState({
        upvotes: result.upvotes,
        downvotes: result.downvotes,
        userVote: result.userVote,
      })
    } catch { /* silent */ }
  }, [user, reply.id])

  const handleDelete = useCallback(async () => {
    if (!user) return
    try {
      await deleteDiscussionReply(reply.id)
      onReplyCreated() // Reload thread
    } catch { /* silent */ }
  }, [user, reply.id, onReplyCreated])

  const maxDepthReached = depth >= 2

  return (
    <div className={`disc-reply-node ${depth > 0 ? 'disc-reply-nested' : ''}`}>
      <div className="disc-reply-card">
        <div className="disc-post-meta">
          <span
            className="disc-avatar disc-avatar-sm"
            style={{ backgroundColor: avatarColor(reply.author.id) }}
          >
            {userInitial(reply.author.username)}
          </span>
          <span className="disc-author">{reply.author.username}</span>
          <span className="disc-time">{relativeTime(reply.createdAt)}</span>
        </div>
        <p className="disc-reply-body">{reply.body}</p>
        <div className="disc-reply-actions">
          <VoteButtons
            upvotes={voteState.upvotes}
            downvotes={voteState.downvotes}
            userVote={voteState.userVote}
            onVote={handleVote}
            disabled={!user}
            compact
          />
          {user && !maxDepthReached && (
            <button
              type="button"
              className="disc-reply-btn"
              onClick={() => setShowReplyBox(!showReplyBox)}
            >
              Reply
            </button>
          )}
          {user?.id === reply.author.id && (
            <button
              type="button"
              className="disc-delete-btn"
              onClick={handleDelete}
            >
              Delete
            </button>
          )}
        </div>

        {showReplyBox && user && (
          <ReplyComposer
            ticker={ticker}
            postId={postId}
            parentReplyId={reply.id}
            onReplyCreated={() => {
              setShowReplyBox(false)
              onReplyCreated()
            }}
            onCancel={() => setShowReplyBox(false)}
          />
        )}
      </div>

      {reply.children && reply.children.length > 0 && (
        <div className="disc-reply-children">
          {reply.children.map((child) => (
            <ReplyNode
              key={child.id}
              reply={child}
              ticker={ticker}
              postId={postId}
              user={user}
              depth={depth + 1}
              onReplyCreated={onReplyCreated}
            />
          ))}
        </div>
      )}
    </div>
  )
}
