import app from './app.js';

const port = Number(process.env.PORT) || 5000;

app.listen(port, () => {
  console.log(`Stock manager API listening on http://localhost:${port}`);
});
