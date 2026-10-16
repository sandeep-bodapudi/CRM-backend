import jwt from 'jsonwebtoken';
import http from 'http';

const token = jwt.sign({
  employeeId: 1,
  employeeCode: 'EMP1',
  companyId: 1,
  branchId: 1,
  roles: ['Admin (Technical)'],
  permissions: ['*'],
  tokenVersion: 1
}, 'dummy_secret');

console.log('Generated token:', token);

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/v1/internal/admin/cache/clear',
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  }
};

const req = http.request(options, res => {
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Body: ${data}`);
  });
});

req.on('error', error => {
  console.error(error);
});

req.end();
