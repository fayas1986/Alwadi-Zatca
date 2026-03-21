fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'superadmin@tech-solutions.sa', password: 'Zatca#Secure!2026@Connect' })
}).then(res => Promise.all([res.status, res.json()])).then(console.log).catch(console.error);
