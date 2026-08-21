import { BrowserProvider, BrowserSession, BrowserSessionConfig, BrowserSessionState } from './types.js';
import { getBrowserProvider } from './provider.js';

export interface SessionManagerOptions {
  maxSessionsPerUser?: number;
  sessionTimeoutMs?: number;
  provider?: BrowserProvider;
}

export class BrowserSessionManager {
  private sessions: Map<string, BrowserSession> = new Map();
  private maxSessionsPerUser: number;
  private sessionTimeoutMs: number;
  private provider: BrowserProvider;

  constructor(options?: SessionManagerOptions) {
    this.maxSessionsPerUser = options?.maxSessionsPerUser || 5;
    this.sessionTimeoutMs = options?.sessionTimeoutMs || 10 * 60 * 1000; // 10 minutes
    this.provider = options?.provider || getBrowserProvider();
  }

  public async getOrCreateSession(
    userId: string,
    sessionId?: string,
    config?: BrowserSessionConfig
  ): Promise<BrowserSession> {
    const effectiveUserId = userId || 'anonymous';
    this.cleanupStaleSessions();

    if (sessionId && this.sessions.has(sessionId)) {
      const existing = this.sessions.get(sessionId)!;
      if (existing.userId === effectiveUserId || existing.userId === 'anonymous') {
        return existing;
      }
      // Session ID belongs to another tenant: do not allow hijacking or silent slot overwrite
      throw new Error(`Unauthorized: browser session '${sessionId}' is owned by another user.`);
    }

    // Check user session limits
    const userSessions = this.listUserSessions(effectiveUserId);
    if (userSessions.length >= this.maxSessionsPerUser) {
      // Close oldest session
      const oldest = userSessions.sort((a, b) => a.lastActiveAt - b.lastActiveAt)[0];
      if (oldest) {
        await this.closeSession(oldest.id, effectiveUserId);
      }
    }

    const session = await this.provider.createSession({
      ...config,
      sessionId,
      userId: effectiveUserId,
    });

    this.sessions.set(session.id, session);
    return session;
  }

  public getSession(sessionId: string, userId?: string): BrowserSession | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    if (userId && session.userId !== userId && session.userId !== 'anonymous') {
      return undefined;
    }
    return session;
  }

  public async closeSession(sessionId: string, userId?: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    if (userId && session.userId !== userId && session.userId !== 'anonymous') {
      return false;
    }

    await session.close();
    this.sessions.delete(sessionId);
    return true;
  }

  public async closeAllUserSessions(userId: string): Promise<number> {
    let closedCount = 0;
    for (const [id, session] of this.sessions.entries()) {
      if (session.userId === userId) {
        await session.close();
        this.sessions.delete(id);
        closedCount++;
      }
    }
    return closedCount;
  }

  public listUserSessions(userId: string): BrowserSessionState[] {
    const states: BrowserSessionState[] = [];
    for (const session of this.sessions.values()) {
      if (session.userId === userId || userId === 'anonymous') {
        states.push(session.getState());
      }
    }
    return states;
  }

  public cleanupStaleSessions(maxIdleAgeMs?: number): number {
    const timeout = maxIdleAgeMs || this.sessionTimeoutMs;
    const now = Date.now();
    let cleaned = 0;

    for (const [id, session] of this.sessions.entries()) {
      const state = session.getState();
      const isIdle = now - state.lastActiveAt > timeout;
      const isClosed = state.status === 'closed';
      const isFailed = state.status === 'error' && now - state.lastActiveAt > 60000; // 1 min grace for errors
      const isExpired = now - state.createdAt > 2 * 60 * 60 * 1000; // 2 hour absolute expiration

      if (isIdle || isClosed || isFailed || isExpired) {
        session.close().catch(() => {});
        this.sessions.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }

  public getActiveCount(): number {
    return this.sessions.size;
  }
}

export const browserSessionManager = new BrowserSessionManager();
