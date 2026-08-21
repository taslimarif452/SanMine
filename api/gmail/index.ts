import express from 'express';
import { gmailRouter } from '../../server/gmail/routes.js';

/**
 * Dedicated, isolated Vercel Serverless Function entrypoint for Gmail.
 * This handler is completely isolated from the main application graph
 * (no AI, search, research, agent, chat, or settings dependencies).
 */
const app = express();

app.use(express.json());

// Mount the Gmail router across all rewrite and direct path variations
app.use('/api/gmail', gmailRouter);
app.use('/gmail', gmailRouter);
app.use('/', gmailRouter);

// Top-level JSON error boundary guaranteeing non-HTML, non-crashing responses
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Gmail Serverless Handler Error]:', err?.message || err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({
    ok: false,
    code: 'GMAIL_INTERNAL_ERROR',
    error: 'Gmail service temporarily unavailable.',
  });
});

export default app;
