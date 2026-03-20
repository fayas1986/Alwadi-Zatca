import express from 'express';
const app = express();
const port = 3005;

app.get('/', (req, res) => res.json({ status: 'ok' }));

app.listen(port, () => {
  console.log(`Test server listening at http://localhost:${port}`);
  process.exit(0); // Exit immediately after starting to confirm it works
});
