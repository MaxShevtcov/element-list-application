import { Router, Request, Response } from 'express';
import { store } from './store';
import { requestQueue } from './queue';

const router = Router();

// Initialize the add processor for the queue
requestQueue.setAddProcessor((ids: string[]) => store.addItems(ids));

/**
 * GET /api/items
 * Get unselected items with pagination and optional filter.
 * Query params: offset (default 0), limit (default 20), filter (optional)
 */
router.get('/items', async (req: Request, res: Response) => {
  const offset = parseInt(req.query.offset as string) || 0;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const filter = (req.query.filter as string) || undefined;

  try {
    const result = await requestQueue.enqueueOperation(() => 
      store.getUnselectedItems(offset, limit, filter)
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/selected
 * Get selected items with pagination and optional filter.
 * Maintains drag&drop sort order.
 */
router.get('/selected', async (req: Request, res: Response) => {
  const offset = parseInt(req.query.offset as string) || 0;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const filter = (req.query.filter as string) || undefined;

  try {
    const result = await requestQueue.enqueueOperation(() => 
      store.getSelectedItems(offset, limit, filter)
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/items/select
 * Select an item (move from left to right panel).
 * Body: { id: string }
 */
router.post('/items/select', async (req: Request, res: Response) => {
  const { id } = req.body;
  if (!id) {
    res.status(400).json({ error: 'id is required' });
    return;
  }

  try {
    const result = await requestQueue.enqueueOperation(() => {
      const success = store.selectItem(String(id));
      return { success, id: String(id) };
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/items/deselect
 * Deselect an item (move from right to left panel).
 * Body: { id: string }
 */
router.post('/items/deselect', async (req: Request, res: Response) => {
  const { id } = req.body;
  if (!id) {
    res.status(400).json({ error: 'id is required' });
    return;
  }

  try {
    const result = await requestQueue.enqueueOperation(() => {
      const success = store.deselectItem(String(id));
      return { success, id: String(id) };
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/items/add
 * Add a new item with a custom ID.
 * Body: { id: string }
 * Goes through the batched add queue (10 sec batching with deduplication).
 */
router.post('/items/add', async (req: Request, res: Response) => {
  const { id } = req.body;
  if (!id || String(id).trim() === '') {
    res.status(400).json({ error: 'id is required and cannot be empty' });
    return;
  }

  try {
    const result = await requestQueue.enqueueAdd(String(id).trim());
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/selected/reorder
 * Reorder a selected item via drag&drop.
 * Body: { itemId: string, newIndex: number, filter?: string }
 */
router.put('/selected/reorder', async (req: Request, res: Response) => {
  const { itemId, newIndex, filter } = req.body;
  if (!itemId || newIndex === undefined) {
    res.status(400).json({ error: 'itemId and newIndex are required' });
    return;
  }

  try {
    const result = await requestQueue.enqueueOperation(() => {
      const success = store.reorderSelected(String(itemId), Number(newIndex), filter || undefined);
      return { success };
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
