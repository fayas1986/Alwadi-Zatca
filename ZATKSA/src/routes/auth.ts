import { Router } from 'express';

const router = Router();

const USERS = [
  { email: 'admin@tech-solutions.sa', password: 'password', role: 'IT_ADMIN', name: 'IT Admin' },
  { email: 'finance@tech-solutions.sa', password: 'password', role: 'FINANCE_ADMIN', name: 'Finance Manager' },
  { email: 'tax@tech-solutions.sa', password: 'password', role: 'TAX_OFFICER', name: 'Tax Officer' },
  { email: 'superadmin@tech-solutions.sa', password: 'password', role: 'SUPER_ADMIN', name: 'Super Admin' },
];

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  
  const user = USERS.find(u => u.email === email);
  
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  
  const { password: _, ...userWithoutPassword } = user;
  res.json(userWithoutPassword);
});

export default router;
