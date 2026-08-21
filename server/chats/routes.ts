import { Router, Request, Response } from 'express';
import { requireAuth } from '../auth/firebase.js';
import {
  listUserChats,
  getChatById,
  createChat,
  updateChatTitle,
  deleteChat,
  listChatMessages,
  saveMessage,
} from '../db/chats.js';

export const chatsRouter = Router();

// Apply requireAuth to all chat routes
chatsRouter.use(requireAuth);

/**
 * GET /api/chats
 * Returns all chats owned by the authenticated user, ordered by updatedAt descending.
 */
chatsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const chats = await listUserChats(user.id);

    return res.json({
      chats: chats.map((c) => ({
        id: c.id,
        title: c.title,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
    });
  } catch (error: any) {
    console.error('[Chats API] Error listing chats:', error.message);
    return res.status(500).json({ error: 'Failed to retrieve chats' });
  }
});

/**
 * POST /api/chats
 * Creates a new chat for the authenticated user.
 */
chatsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { title, id } = req.body || {};

    const chat = await createChat({
      userId: user.id,
      title: typeof title === 'string' ? title : 'New Chat',
      id: typeof id === 'string' ? id : undefined,
    });

    // Safe diagnostic log required by audit
    console.log(`[CHAT CREATED] chatId=${chat.id}`);

    return res.status(201).json({
      chat: {
        id: chat.id,
        title: chat.title,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
      },
    });
  } catch (error: any) {
    console.error('[Chats API] Error creating chat:', error.message);
    return res.status(500).json({ error: 'Failed to create chat' });
  }
});

/**
 * GET /api/chats/:chatId
 * Retrieves a single chat, ensuring the authenticated user owns it.
 */
chatsRouter.get('/:chatId', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { chatId } = req.params;

    const chat = await getChatById(chatId, user.id);
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found or access denied' });
    }

    // Safe diagnostic log required by audit
    console.log(`[CHAT LOADED] chatId=${chat.id}`);

    return res.json({
      chat: {
        id: chat.id,
        title: chat.title,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
      },
    });
  } catch (error: any) {
    console.error('[Chats API] Error getting chat:', error.message);
    return res.status(500).json({ error: 'Failed to retrieve chat' });
  }
});

/**
 * PATCH /api/chats/:chatId
 * Renames a chat, ensuring user ownership.
 */
chatsRouter.patch('/:chatId', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { chatId } = req.params;
    const { title } = req.body || {};

    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'Valid title string is required' });
    }

    const updated = await updateChatTitle(chatId, user.id, title);
    if (!updated) {
      return res.status(404).json({ error: 'Chat not found or access denied' });
    }

    return res.json({
      chat: {
        id: updated.id,
        title: updated.title,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (error: any) {
    console.error('[Chats API] Error updating chat:', error.message);
    return res.status(500).json({ error: 'Failed to update chat' });
  }
});

/**
 * DELETE /api/chats/:chatId
 * Deletes a chat (and cascades messages), ensuring user ownership.
 */
chatsRouter.delete('/:chatId', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { chatId } = req.params;

    const success = await deleteChat(chatId, user.id);
    if (!success) {
      return res.status(404).json({ error: 'Chat not found or access denied' });
    }

    return res.json({ success: true, chatId });
  } catch (error: any) {
    console.error('[Chats API] Error deleting chat:', error.message);
    return res.status(500).json({ error: 'Failed to delete chat' });
  }
});

/**
 * GET /api/chats/:chatId/messages
 * Retrieves all messages in a chat, verifying ownership.
 */
chatsRouter.get('/:chatId/messages', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { chatId } = req.params;

    const messages = await listChatMessages(chatId, user.id);
    if (messages === null) {
      return res.status(404).json({ error: 'Chat not found or access denied' });
    }

    return res.json({
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        metadata: m.metadata,
        createdAt: m.createdAt,
      })),
    });
  } catch (error: any) {
    console.error('[Chats API] Error loading messages:', error.message);
    return res.status(500).json({ error: 'Failed to retrieve messages' });
  }
});

/**
 * POST /api/chats/:chatId/messages
 * Appends a message to a chat, verifying ownership.
 */
chatsRouter.post('/:chatId/messages', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { chatId } = req.params;
    const { role, content, metadata, id } = req.body || {};

    if (!role || !['user', 'assistant'].includes(role)) {
      return res.status(400).json({ error: 'Role must be "user" or "assistant"' });
    }

    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'Content string is required' });
    }

    const message = await saveMessage({
      chatId,
      userId: user.id,
      role,
      content,
      metadata,
      id: typeof id === 'string' ? id : undefined,
    });

    if (!message) {
      return res.status(404).json({ error: 'Chat not found or access denied' });
    }

    // Safe diagnostic log required by audit
    console.log(`[MESSAGE SAVED] chatId=${chatId} role=${role}`);

    return res.status(201).json({
      message: {
        id: message.id,
        role: message.role,
        content: message.content,
        metadata: message.metadata,
        createdAt: message.createdAt,
      },
    });
  } catch (error: any) {
    console.error('[Chats API] Error saving message:', error.message);
    return res.status(500).json({ error: 'Failed to save message' });
  }
});

/**
 * POST /api/chats/migrate-local
 * One-time migration endpoint for legacy localStorage chats.
 */
chatsRouter.post('/migrate-local', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { chats } = req.body || {};

    if (!Array.isArray(chats) || chats.length === 0) {
      return res.json({ success: true, migratedCount: 0 });
    }

    let count = 0;
    for (const item of chats) {
      if (!item || !item.title) continue;

      const created = await createChat({
        userId: user.id,
        title: item.title,
        id: item.id,
      });

      if (Array.isArray(item.messages)) {
        for (const msg of item.messages) {
          if (msg && msg.role && msg.content) {
            await saveMessage({
              chatId: created.id,
              userId: user.id,
              role: msg.role === 'assistant' ? 'assistant' : 'user',
              content: msg.content,
              metadata: msg.metadata || (msg.execution ? { execution: msg.execution } : undefined),
              id: msg.id,
            });
          }
        }
      }
      count++;
    }

    return res.json({ success: true, migratedCount: count });
  } catch (error: any) {
    console.error('[Chats Migration Error]:', error.message);
    return res.status(500).json({ error: 'Failed to migrate localStorage chats' });
  }
});
