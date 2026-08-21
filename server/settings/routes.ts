import { Router, Request, Response } from 'express';
import { requireAuth } from '../auth/firebase.js';
import {
  getUserPreferences,
  saveUserPreferences,
  getUserOutreachHistory,
} from '../db/outreach.js';
import { deleteUserAccount } from '../db/account.js';

export const settingsRouter = Router();

/**
 * GET /api/settings/preferences
 * Returns user preferences (including Outreach Automation toggle and active AI selection).
 */
settingsRouter.get('/preferences', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const preferences = await getUserPreferences(userId);
    return res.json({
      ok: true,
      success: true,
      preferences,
    });
  } catch (error: any) {
    console.error('[Settings API] Error fetching user preferences:', error.message);
    return res.status(500).json({
      ok: false,
      success: false,
      error: error.message || 'Failed to retrieve user preferences.',
    });
  }
});

/**
 * POST /api/settings/preferences
 * Updates user preferences (such as Outreach Mode or active model).
 */
settingsRouter.post('/preferences', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { autoSendProposals, userDisplayName, activeProvider, activeModel } = req.body || {};

    const preferences = await saveUserPreferences(userId, {
      autoSendProposals: typeof autoSendProposals === 'boolean' ? autoSendProposals : undefined,
      userDisplayName: typeof userDisplayName === 'string' ? userDisplayName.trim() : undefined,
      activeProvider: typeof activeProvider === 'string' ? activeProvider.trim() : undefined,
      activeModel: typeof activeModel === 'string' ? activeModel.trim() : undefined,
    });

    return res.json({
      ok: true,
      success: true,
      preferences,
    });
  } catch (error: any) {
    console.error('[Settings API] Error saving user preferences:', error.message);
    return res.status(500).json({
      ok: false,
      success: false,
      error: error.message || 'Failed to save user preferences.',
    });
  }
});

/**
 * GET /api/settings/outreach-history
 * Returns recent outreach delivery log entries for the authenticated user.
 */
settingsRouter.get('/outreach-history', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const history = await getUserOutreachHistory(userId, 50);
    return res.json({
      ok: true,
      success: true,
      history,
    });
  } catch (error: any) {
    console.error('[Settings API] Error fetching outreach history:', error.message);
    return res.status(500).json({
      ok: false,
      success: false,
      error: error.message || 'Failed to retrieve outreach history.',
    });
  }
});

/**
 * DELETE /api/settings/account
 * POST /api/settings/account/delete
 * Permanently deletes all user-owned data (chats, messages, checkpoints, keys, preferences, logs, tokens, sessions).
 * IDOR Protected: User identity is strictly derived from the authenticated session token.
 */
const handleAccountDeletion = async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const userId = user.id;
    const firebaseUid = req.firebaseUid || user.firebaseUid;

    // Safe diagnostic log required by audit
    console.log(`[ACCOUNT DELETION] userId=${userId} firebaseUid=${firebaseUid}`);

    await deleteUserAccount({ userId, firebaseUid });

    return res.json({
      ok: true,
      success: true,
      message: 'Account and all associated personal data permanently deleted.',
    });
  } catch (error: any) {
    console.error('[Settings API] Error during account deletion:', error.message);
    return res.status(500).json({
      ok: false,
      success: false,
      error: error.message || 'Failed to delete account.',
    });
  }
};

settingsRouter.delete('/account', requireAuth, handleAccountDeletion);
settingsRouter.post('/account/delete', requireAuth, handleAccountDeletion);

