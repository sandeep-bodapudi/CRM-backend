const fetch = require('node-fetch');

async function login() {
  const res = await fetch('http://127.0.0.1:3000/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employee_code: 'admin', password: 'admin' }) // Need to know admin password, let's try
  });
  const data = await res.json();
  console.log('Login response:', JSON.stringify(data, null, 2));
}

login().catch(console.error);
