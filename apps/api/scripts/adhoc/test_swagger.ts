import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import { setupSwagger } from './src/utils/swagger';
import http from 'http';

const app = express();
setupSwagger(app);

const server = app.listen(3002, () => {
  http.get('http://localhost:3002/api-docs', (res) => {
    console.log(`Status Code for /api-docs (No Auth): ${res.statusCode}`);
    server.close();
  });
});
