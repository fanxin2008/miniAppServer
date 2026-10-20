import { Router } from 'express';

const router = Router();

router.post('/login', (req, res) => {
  res.send('welcome');
});

export default router;
