import { Router } from 'express';
import {
  claimCupStickerJob,
  completeCupStickerJob,
  cupStickerAgentSecret,
  touchCupStickerAgent,
} from '../lib/cupStickerJobs';

const router = Router();

function authorizeAgent(req: { header(name: string): string | undefined }, res: {
  status(code: number): { json(body: unknown): void };
}, next: () => void) {
  const secret = cupStickerAgentSecret();
  const provided =
    req.header('x-cup-sticker-secret') ||
    req.header('authorization')?.replace(/^Bearer\s+/i, '') ||
    '';
  if (!provided || provided !== secret) {
    res.status(401).json({ success: false, message: 'Invalid cup sticker agent secret' });
    return;
  }
  next();
}

router.use(authorizeAgent);

/** Local agent polls this to pull the next print job. */
router.get('/claim', (req, res) => {
  touchCupStickerAgent();
  const storeId = typeof req.query.storeId === 'string' ? req.query.storeId : null;
  const job = claimCupStickerJob(storeId);
  if (!job) {
    res.json({ success: true, data: null });
    return;
  }
  res.json({
    success: true,
    data: {
      id: job.id,
      printerName: job.printerName,
      stickers: job.stickers,
      storeId: job.storeId,
    },
  });
});

router.post('/jobs/:id/complete', (req, res) => {
  const ok = Boolean(req.body?.ok);
  const job = completeCupStickerJob(req.params.id, {
    ok,
    error: typeof req.body?.error === 'string' ? req.body.error : undefined,
    printed: typeof req.body?.printed === 'number' ? req.body.printed : undefined,
  });
  if (!job) {
    res.status(404).json({ success: false, message: 'Job not found' });
    return;
  }
  res.json({ success: true, data: { id: job.id, status: job.status } });
});

export default router;
