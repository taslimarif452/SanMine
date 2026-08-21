import crypto from 'crypto';
import { getNeonSql } from './neon.js';

export interface DbUser {
  id: string; // UUID
  firebaseUid: string;
  email?: string;
  displayName?: string;
  photoUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DbChat {
  id: string; // UUID
  userId: string; // UUID of DbUser
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface DbMessage {
  id: string; // UUID
  chatId: string; // UUID of DbChat
  role: 'user' | 'assistant';
  content: string;
  metadata?: any;
  createdAt: string;
}

export interface DbConversationSummary {
  id: string;
  chatId: string;
  userId: string;
  summary: string;
  lastMessageId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DbTaskCheckpoint {
  id: string;
  taskId: string;
  chatId?: string;
  userId: string;
  state: any;
  createdAt: string;
  updatedAt: string;
}

// In-memory fallback stores for test/isolated environments
const memoryUsers = new Map<string, DbUser>(); // key: firebaseUid
const memoryChats = new Map<string, DbChat>(); // key: chatId
const memoryMessages = new Map<string, DbMessage[]>(); // key: chatId -> messages[]
const memorySummaries = new Map<string, DbConversationSummary>(); // key: chatId -> summary
const memoryCheckpoints = new Map<string, DbTaskCheckpoint>(); // key: taskId -> checkpoint

let schemaInitialized = false;

/**
 * Ensures required PostgreSQL tables and indexes exist in Neon.
 */
export async function initializeChatSchema(): Promise<void> {
  if (schemaInitialized) return;

  const sql = getNeonSql();
  if (!sql) {
    schemaInitialized = true;
    return;
  }

  try {
    // 1. Users Table
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        firebase_uid VARCHAR(128) UNIQUE NOT NULL,
        email VARCHAR(320),
        display_name TEXT,
        photo_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid);
    `;

    // 2. Chats Table
    await sql`
      CREATE TABLE IF NOT EXISTS chats (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL DEFAULT 'New Chat',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_chats_user_updated ON chats(user_id, updated_at DESC);
    `;

    // 3. Messages Table
    await sql`
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL,
        content TEXT NOT NULL,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON messages(chat_id, created_at ASC);
    `;

    // 4. Conversation Summaries Table (for long context management)
    await sql`
      CREATE TABLE IF NOT EXISTS conversation_summaries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE UNIQUE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        summary TEXT NOT NULL,
        last_message_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_summaries_user_chat ON conversation_summaries(user_id, chat_id);
    `;

    // 5. Task Checkpoints Table (for agent failover & exact step continuation)
    await sql`
      CREATE TABLE IF NOT EXISTS task_checkpoints (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id VARCHAR(128) UNIQUE NOT NULL,
        chat_id UUID REFERENCES chats(id) ON DELETE SET NULL,
        user_id VARCHAR(128) NOT NULL,
        state JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_checkpoints_task_user ON task_checkpoints(task_id, user_id);
      CREATE INDEX IF NOT EXISTS idx_checkpoints_updated ON task_checkpoints(updated_at DESC);
    `;

    schemaInitialized = true;
    console.log('[Neon DB] Schema verified successfully (users, chats, messages, summaries, checkpoints, indexes).');
  } catch (error: any) {
    console.warn('[Neon DB] Schema initialization notice (will retry on demand):', error.message);
  }
}

/**
 * Upsert a user from verified Firebase ID token.
 */
export async function upsertUserByFirebaseUid(data: {
  firebaseUid: string;
  email?: string;
  displayName?: string;
  photoUrl?: string;
}): Promise<DbUser> {
  const sql = getNeonSql();

  if (sql) {
    try {
      await initializeChatSchema();

      const now = new Date();
      const rows = (await sql`
        INSERT INTO users (
          firebase_uid,
          email,
          display_name,
          photo_url,
          updated_at
        ) VALUES (
          ${data.firebaseUid},
          ${data.email || null},
          ${data.displayName || null},
          ${data.photoUrl || null},
          ${now}
        )
        ON CONFLICT (firebase_uid) DO UPDATE SET
          email = COALESCE(EXCLUDED.email, users.email),
          display_name = COALESCE(EXCLUDED.display_name, users.display_name),
          photo_url = COALESCE(EXCLUDED.photo_url, users.photo_url),
          updated_at = ${now}
        RETURNING
          id::text,
          firebase_uid as "firebaseUid",
          email,
          display_name as "displayName",
          photo_url as "photoUrl",
          created_at as "createdAt",
          updated_at as "updatedAt";
      `) as any[];

      if (rows && rows.length > 0) {
        const row = rows[0] as any;
        const user: DbUser = {
          id: row.id,
          firebaseUid: row.firebaseUid,
          email: row.email,
          displayName: row.displayName,
          photoUrl: row.photoUrl,
          createdAt: new Date(row.createdAt).toISOString(),
          updatedAt: new Date(row.updatedAt).toISOString(),
        };
        memoryUsers.set(data.firebaseUid, user);
        return user;
      }
    } catch (err: any) {
      console.error('[Neon DB] Error in upsertUserByFirebaseUid:', err.message);
      if (process.env.NODE_ENV === 'production' || !!process.env.VERCEL) {
        throw new Error(`Database error resolving user: ${err.message}`);
      }
    }
  }

  if (process.env.NODE_ENV === 'production' || !!process.env.VERCEL) {
    throw new Error('Database is required in production.');
  }

  // Memory fallback for development/testing only
  let existing = memoryUsers.get(data.firebaseUid);
  const nowStr = new Date().toISOString();
  if (existing) {
    existing = {
      ...existing,
      email: data.email || existing.email,
      displayName: data.displayName || existing.displayName,
      photoUrl: data.photoUrl || existing.photoUrl,
      updatedAt: nowStr,
    };
    memoryUsers.set(data.firebaseUid, existing);
    return existing;
  }

  const newUser: DbUser = {
    id: crypto.randomUUID(),
    firebaseUid: data.firebaseUid,
    email: data.email,
    displayName: data.displayName,
    photoUrl: data.photoUrl,
    createdAt: nowStr,
    updatedAt: nowStr,
  };
  memoryUsers.set(data.firebaseUid, newUser);
  return newUser;
}

/**
 * List all chats owned by a specific database user ID.
 */
export async function listUserChats(userId: string): Promise<DbChat[]> {
  const sql = getNeonSql();

  if (sql) {
    try {
      await initializeChatSchema();

      const rows = (await sql`
        SELECT 
          id::text,
          user_id::text as "userId",
          title,
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM chats
        WHERE user_id = ${userId}::uuid
        ORDER BY updated_at DESC;
      `) as any[];

      return (rows || []).map((r: any) => ({
        id: r.id,
        userId: r.userId,
        title: r.title,
        createdAt: new Date(r.createdAt).toISOString(),
        updatedAt: new Date(r.updatedAt).toISOString(),
      }));
    } catch (err: any) {
      console.error('[Neon DB] Error in listUserChats:', err.message);
    }
  }

  // Memory fallback
  return Array.from(memoryChats.values())
    .filter((c) => c.userId === userId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

/**
 * Get a specific chat by ID, verifying user ownership.
 */
export async function getChatById(chatId: string, userId: string): Promise<DbChat | null> {
  const sql = getNeonSql();

  if (sql) {
    try {
      await initializeChatSchema();

      const rows = (await sql`
        SELECT 
          id::text,
          user_id::text as "userId",
          title,
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM chats
        WHERE id = ${chatId}::uuid AND user_id = ${userId}::uuid
        LIMIT 1;
      `) as any[];

      if (rows && rows.length > 0) {
        const r = rows[0] as any;
        return {
          id: r.id,
          userId: r.userId,
          title: r.title,
          createdAt: new Date(r.createdAt).toISOString(),
          updatedAt: new Date(r.updatedAt).toISOString(),
        };
      }
      return null;
    } catch (err: any) {
      console.error('[Neon DB] Error in getChatById:', err.message);
      return null;
    }
  }

  // Memory fallback
  const chat = memoryChats.get(chatId);
  if (chat && chat.userId === userId) {
    return chat;
  }
  return null;
}

/**
 * Create a new chat for a verified user.
 */
export async function createChat(data: {
  userId: string;
  title?: string;
  id?: string;
}): Promise<DbChat> {
  const sql = getNeonSql();
  const title = (data.title || 'New Chat').trim() || 'New Chat';
  const customId = data.id && isValidUuid(data.id) ? data.id : undefined;

  if (sql) {
    try {
      await initializeChatSchema();

      let rows: any[];
      if (customId) {
        rows = (await sql`
          INSERT INTO chats (id, user_id, title)
          VALUES (${customId}::uuid, ${data.userId}::uuid, ${title})
          ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            updated_at = NOW()
          RETURNING
            id::text,
            user_id::text as "userId",
            title,
            created_at as "createdAt",
            updated_at as "updatedAt";
        `) as any[];
      } else {
        rows = (await sql`
          INSERT INTO chats (user_id, title)
          VALUES (${data.userId}::uuid, ${title})
          RETURNING
            id::text,
            user_id::text as "userId",
            title,
            created_at as "createdAt",
            updated_at as "updatedAt";
        `) as any[];
      }

      if (rows && rows.length > 0) {
        const r = rows[0] as any;
        const newChat: DbChat = {
          id: r.id,
          userId: r.userId,
          title: r.title,
          createdAt: new Date(r.createdAt).toISOString(),
          updatedAt: new Date(r.updatedAt).toISOString(),
        };
        memoryChats.set(newChat.id, newChat);
        return newChat;
      }
    } catch (err: any) {
      console.error('[Neon DB] Error in createChat:', err.message);
    }
  }

  // Memory fallback
  const id = customId || crypto.randomUUID();
  const now = new Date().toISOString();
  const newChat: DbChat = {
    id,
    userId: data.userId,
    title,
    createdAt: now,
    updatedAt: now,
  };
  memoryChats.set(id, newChat);
  return newChat;
}

/**
 * Update a chat's title, verifying user ownership.
 */
export async function updateChatTitle(
  chatId: string,
  userId: string,
  newTitle: string
): Promise<DbChat | null> {
  const sql = getNeonSql();
  const title = newTitle.trim() || 'New Chat';

  if (sql) {
    try {
      await initializeChatSchema();

      const rows = (await sql`
        UPDATE chats
        SET title = ${title}, updated_at = NOW()
        WHERE id = ${chatId}::uuid AND user_id = ${userId}::uuid
        RETURNING
          id::text,
          user_id::text as "userId",
          title,
          created_at as "createdAt",
          updated_at as "updatedAt";
      `) as any[];

      if (rows && rows.length > 0) {
        const r = rows[0] as any;
        const updated: DbChat = {
          id: r.id,
          userId: r.userId,
          title: r.title,
          createdAt: new Date(r.createdAt).toISOString(),
          updatedAt: new Date(r.updatedAt).toISOString(),
        };
        memoryChats.set(chatId, updated);
        return updated;
      }
      return null;
    } catch (err: any) {
      console.error('[Neon DB] Error in updateChatTitle:', err.message);
      return null;
    }
  }

  // Memory fallback
  const chat = memoryChats.get(chatId);
  if (chat && chat.userId === userId) {
    chat.title = title;
    chat.updatedAt = new Date().toISOString();
    return chat;
  }
  return null;
}

/**
 * Delete a chat, verifying user ownership (cascades to messages in Postgres).
 */
export async function deleteChat(chatId: string, userId: string): Promise<boolean> {
  const sql = getNeonSql();

  if (sql && isValidUuid(chatId) && isValidUuid(userId)) {
    try {
      await initializeChatSchema();

      // Clean up checkpoints & summaries associated with chat
      await sql`
        DELETE FROM task_checkpoints
        WHERE chat_id = ${chatId}::uuid OR (user_id = ${userId} AND (state->>'chatId' = ${chatId} OR state->>'conversationId' = ${chatId}));
      `.catch(() => {});

      await sql`
        DELETE FROM conversation_summaries
        WHERE chat_id = ${chatId}::uuid AND user_id = ${userId}::uuid;
      `.catch(() => {});

      const rows = (await sql`
        DELETE FROM chats
        WHERE id = ${chatId}::uuid AND user_id = ${userId}::uuid
        RETURNING id::text;
      `) as any[];

      if (rows && rows.length > 0) {
        memoryChats.delete(chatId);
        memoryMessages.delete(chatId);
        memorySummaries.delete(chatId);
        // Clear related checkpoints in memory
        for (const [tId, cp] of memoryCheckpoints.entries()) {
          if (cp.chatId === chatId || (cp.state && (cp.state.chatId === chatId || cp.state.conversationId === chatId))) {
            memoryCheckpoints.delete(tId);
          }
        }
        return true;
      }
      return false;
    } catch (err: any) {
      console.error('[Neon DB] Error in deleteChat:', err.message);
      return false;
    }
  }

  // Memory fallback
  const chat = memoryChats.get(chatId);
  if (chat && chat.userId === userId) {
    memoryChats.delete(chatId);
    memoryMessages.delete(chatId);
    memorySummaries.delete(chatId);
    for (const [tId, cp] of memoryCheckpoints.entries()) {
      if (cp.chatId === chatId || (cp.state && (cp.state.chatId === chatId || cp.state.conversationId === chatId))) {
        memoryCheckpoints.delete(tId);
      }
    }
    return true;
  }
  return false;
}

/**
 * List all messages in a chat, verifying chat ownership.
 */
export async function listChatMessages(chatId: string, userId: string): Promise<DbMessage[] | null> {
  // First verify user owns the chat
  const chat = await getChatById(chatId, userId);
  if (!chat) {
    return null; // Forbidden or Not Found
  }

  const sql = getNeonSql();
  if (sql) {
    try {
      await initializeChatSchema();

      const rows = (await sql`
        SELECT 
          id::text,
          chat_id::text as "chatId",
          role,
          content,
          metadata,
          created_at as "createdAt"
        FROM messages
        WHERE chat_id = ${chatId}::uuid
        ORDER BY created_at ASC;
      `) as any[];

      return (rows || []).map((r: any) => ({
        id: r.id,
        chatId: r.chatId,
        role: r.role,
        content: r.content,
        metadata: r.metadata || undefined,
        createdAt: new Date(r.createdAt).toISOString(),
      }));
    } catch (err: any) {
      console.error('[Neon DB] Error in listChatMessages:', err.message);
    }
  }

  // Memory fallback
  return memoryMessages.get(chatId) || [];
}

/**
 * Save a message into a chat, verifying chat ownership and updating chat's updated_at.
 */
export async function saveMessage(data: {
  chatId: string;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: any;
  id?: string;
}): Promise<DbMessage | null> {
  // First verify user owns the chat
  const chat = await getChatById(data.chatId, data.userId);
  if (!chat) {
    return null; // Forbidden or Not Found
  }

  // Sanitize metadata to strip any sensitive API keys or credentials
  const cleanMetadata = sanitizeMetadata(data.metadata);
  const customId = data.id && isValidUuid(data.id) ? data.id : undefined;
  const sql = getNeonSql();

  if (sql) {
    try {
      await initializeChatSchema();

      let rows: any[];
      if (customId) {
        rows = (await sql`
          INSERT INTO messages (id, chat_id, role, content, metadata)
          VALUES (
            ${customId}::uuid,
            ${data.chatId}::uuid,
            ${data.role},
            ${data.content},
            ${cleanMetadata ? JSON.stringify(cleanMetadata) : null}::jsonb
          )
          RETURNING
            id::text,
            chat_id::text as "chatId",
            role,
            content,
            metadata,
            created_at as "createdAt";
        `) as any[];
      } else {
        rows = (await sql`
          INSERT INTO messages (chat_id, role, content, metadata)
          VALUES (
            ${data.chatId}::uuid,
            ${data.role},
            ${data.content},
            ${cleanMetadata ? JSON.stringify(cleanMetadata) : null}::jsonb
          )
          RETURNING
            id::text,
            chat_id::text as "chatId",
            role,
            content,
            metadata,
            created_at as "createdAt";
        `) as any[];
      }

      // Touch chat's updated_at timestamp
      await sql`
        UPDATE chats
        SET updated_at = NOW()
        WHERE id = ${data.chatId}::uuid;
      `;

      if (rows && rows.length > 0) {
        const r = rows[0] as any;
        const msg: DbMessage = {
          id: r.id,
          chatId: r.chatId,
          role: r.role,
          content: r.content,
          metadata: r.metadata,
          createdAt: new Date(r.createdAt).toISOString(),
        };

        const existingList = memoryMessages.get(data.chatId) || [];
        existingList.push(msg);
        memoryMessages.set(data.chatId, existingList);
        return msg;
      }
    } catch (err: any) {
      console.error('[Neon DB] Error in saveMessage:', err.message);
    }
  }

  // Memory fallback
  const id = customId || crypto.randomUUID();
  const now = new Date().toISOString();
  const msg: DbMessage = {
    id,
    chatId: data.chatId,
    role: data.role,
    content: data.content,
    metadata: cleanMetadata,
    createdAt: now,
  };

  const existingList = memoryMessages.get(data.chatId) || [];
  existingList.push(msg);
  memoryMessages.set(data.chatId, existingList);

  chat.updatedAt = now;
  return msg;
}

/**
 * Sanitizes message metadata to prevent storing API keys or tokens.
 */
function sanitizeMetadata(metadata: any): any {
  if (!metadata || typeof metadata !== 'object') return metadata;
  try {
    const serialized = JSON.stringify(metadata);
    const parsed = JSON.parse(serialized);

    const scrub = (obj: any) => {
      if (!obj || typeof obj !== 'object') return;
      for (const key of Object.keys(obj)) {
        const lower = key.toLowerCase();
        if (
          lower.includes('secret') ||
          lower.includes('password') ||
          lower.includes('token') ||
          lower.includes('apikey') ||
          lower.includes('api_key')
        ) {
          delete obj[key];
        } else if (typeof obj[key] === 'object') {
          scrub(obj[key]);
        }
      }
    };

    scrub(parsed);
    return parsed;
  } catch {
    return undefined;
  }
}

function isValidUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Get conversation summary for long-context compression.
 */
export async function getConversationSummary(chatId: string, userId: string): Promise<DbConversationSummary | null> {
  const sql = getNeonSql();
  if (sql && isValidUuid(chatId)) {
    try {
      await initializeChatSchema();
      const rows = (await sql`
        SELECT 
          id::text,
          chat_id::text as "chatId",
          user_id::text as "userId",
          summary,
          last_message_id::text as "lastMessageId",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM conversation_summaries
        WHERE chat_id = ${chatId}::uuid AND user_id = ${userId}::uuid
        LIMIT 1;
      `) as any[];

      if (rows && rows.length > 0) {
        const r = rows[0] as any;
        return {
          id: r.id,
          chatId: r.chatId,
          userId: r.userId,
          summary: r.summary,
          lastMessageId: r.lastMessageId || undefined,
          createdAt: new Date(r.createdAt).toISOString(),
          updatedAt: new Date(r.updatedAt).toISOString(),
        };
      }
      return null;
    } catch (err: any) {
      console.error('[Neon DB] Error in getConversationSummary:', err.message);
    }
  }

  const sum = memorySummaries.get(chatId);
  if (sum && sum.userId === userId) {
    return sum;
  }
  return null;
}

/**
 * Save or update conversation summary.
 */
export async function saveConversationSummary(data: {
  chatId: string;
  userId: string;
  summary: string;
  lastMessageId?: string;
}): Promise<DbConversationSummary> {
  const sql = getNeonSql();
  const now = new Date();

  if (sql && isValidUuid(data.chatId)) {
    try {
      await initializeChatSchema();
      const rows = (await sql`
        INSERT INTO conversation_summaries (
          chat_id,
          user_id,
          summary,
          last_message_id,
          updated_at
        ) VALUES (
          ${data.chatId}::uuid,
          ${data.userId}::uuid,
          ${data.summary},
          ${data.lastMessageId && isValidUuid(data.lastMessageId) ? data.lastMessageId : null}::uuid,
          ${now}
        )
        ON CONFLICT (chat_id) DO UPDATE SET
          summary = EXCLUDED.summary,
          last_message_id = EXCLUDED.last_message_id,
          updated_at = ${now}
        RETURNING
          id::text,
          chat_id::text as "chatId",
          user_id::text as "userId",
          summary,
          last_message_id::text as "lastMessageId",
          created_at as "createdAt",
          updated_at as "updatedAt";
      `) as any[];

      if (rows && rows.length > 0) {
        const r = rows[0] as any;
        const sumRecord: DbConversationSummary = {
          id: r.id,
          chatId: r.chatId,
          userId: r.userId,
          summary: r.summary,
          lastMessageId: r.lastMessageId || undefined,
          createdAt: new Date(r.createdAt).toISOString(),
          updatedAt: new Date(r.updatedAt).toISOString(),
        };
        memorySummaries.set(data.chatId, sumRecord);
        return sumRecord;
      }
    } catch (err: any) {
      console.error('[Neon DB] Error in saveConversationSummary:', err.message);
    }
  }

  const nowStr = now.toISOString();
  const sumRecord: DbConversationSummary = {
    id: crypto.randomUUID(),
    chatId: data.chatId,
    userId: data.userId,
    summary: data.summary,
    lastMessageId: data.lastMessageId,
    createdAt: nowStr,
    updatedAt: nowStr,
  };
  memorySummaries.set(data.chatId, sumRecord);
  return sumRecord;
}

/**
 * Save an autonomous agent task checkpoint to durable storage.
 */
export async function saveTaskCheckpoint(data: {
  taskId: string;
  userId: string;
  chatId?: string;
  state: any;
}): Promise<DbTaskCheckpoint> {
  const sql = getNeonSql();
  const cleanState = sanitizeMetadata(data.state);
  const now = new Date();

  if (sql) {
    try {
      await initializeChatSchema();
      const rows = (await sql`
        INSERT INTO task_checkpoints (
          task_id,
          user_id,
          chat_id,
          state,
          updated_at
        ) VALUES (
          ${data.taskId},
          ${data.userId},
          ${data.chatId && isValidUuid(data.chatId) ? data.chatId : null}::uuid,
          ${JSON.stringify(cleanState)}::jsonb,
          ${now}
        )
        ON CONFLICT (task_id) DO UPDATE SET
          state = EXCLUDED.state,
          chat_id = COALESCE(EXCLUDED.chat_id, task_checkpoints.chat_id),
          updated_at = ${now}
        RETURNING
          id::text,
          task_id as "taskId",
          user_id as "userId",
          chat_id::text as "chatId",
          state,
          created_at as "createdAt",
          updated_at as "updatedAt";
      `) as any[];

      if (rows && rows.length > 0) {
        const r = rows[0] as any;
        const checkpoint: DbTaskCheckpoint = {
          id: r.id,
          taskId: r.taskId,
          userId: r.userId,
          chatId: r.chatId || undefined,
          state: r.state,
          createdAt: new Date(r.createdAt).toISOString(),
          updatedAt: new Date(r.updatedAt).toISOString(),
        };
        memoryCheckpoints.set(data.taskId, checkpoint);
        return checkpoint;
      }
    } catch (err: any) {
      console.error('[Neon DB] Error in saveTaskCheckpoint:', err.message);
    }
  }

  const nowStr = now.toISOString();
  const checkpoint: DbTaskCheckpoint = {
    id: crypto.randomUUID(),
    taskId: data.taskId,
    userId: data.userId,
    chatId: data.chatId,
    state: cleanState,
    createdAt: nowStr,
    updatedAt: nowStr,
  };
  memoryCheckpoints.set(data.taskId, checkpoint);
  return checkpoint;
}

/**
 * Retrieve an autonomous agent task checkpoint by taskId, scoped by userId.
 */
export async function getTaskCheckpoint(taskId: string, userId: string): Promise<DbTaskCheckpoint | null> {
  const sql = getNeonSql();

  if (sql) {
    try {
      await initializeChatSchema();
      const rows = (await sql`
        SELECT 
          id::text,
          task_id as "taskId",
          user_id as "userId",
          chat_id::text as "chatId",
          state,
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM task_checkpoints
        WHERE task_id = ${taskId} AND user_id = ${userId}
        LIMIT 1;
      `) as any[];

      if (rows && rows.length > 0) {
        const r = rows[0] as any;
        return {
          id: r.id,
          taskId: r.taskId,
          userId: r.userId,
          chatId: r.chatId || undefined,
          state: r.state,
          createdAt: new Date(r.createdAt).toISOString(),
          updatedAt: new Date(r.updatedAt).toISOString(),
        };
      }
      return null;
    } catch (err: any) {
      console.error('[Neon DB] Error in getTaskCheckpoint:', err.message);
    }
  }

  const cp = memoryCheckpoints.get(taskId);
  if (cp && cp.userId === userId) {
    return cp;
  }
  return null;
}

/**
 * Delete a completed task checkpoint.
 */
export async function deleteTaskCheckpoint(taskId: string, userId: string): Promise<boolean> {
  const sql = getNeonSql();

  if (sql) {
    try {
      await initializeChatSchema();
      await sql`
        DELETE FROM task_checkpoints
        WHERE task_id = ${taskId} AND user_id = ${userId};
      `;
      memoryCheckpoints.delete(taskId);
      return true;
    } catch (err: any) {
      console.error('[Neon DB] Error in deleteTaskCheckpoint:', err.message);
    }
  }

  const cp = memoryCheckpoints.get(taskId);
  if (cp && cp.userId === userId) {
    memoryCheckpoints.delete(taskId);
    return true;
  }
  return false;
}

/**
 * Clears all in-memory chat state for a user (chats, messages, summaries, checkpoints, users).
 */
export function clearUserChatMemory(userId: string, firebaseUid?: string): void {
  if (firebaseUid) {
    memoryUsers.delete(firebaseUid);
  }
  // Clear memory users by user id
  for (const [fUid, u] of memoryUsers.entries()) {
    if (u.id === userId || (firebaseUid && fUid === firebaseUid)) {
      memoryUsers.delete(fUid);
    }
  }

  // Clear chats, messages, and summaries
  for (const [cId, chat] of memoryChats.entries()) {
    if (chat.userId === userId) {
      memoryChats.delete(cId);
      memoryMessages.delete(cId);
      memorySummaries.delete(cId);
    }
  }

  // Clear checkpoints
  for (const [tId, cp] of memoryCheckpoints.entries()) {
    if (cp.userId === userId || (firebaseUid && cp.userId === firebaseUid)) {
      memoryCheckpoints.delete(tId);
    }
  }
}

