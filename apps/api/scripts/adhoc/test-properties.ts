require('dotenv').config({ path: '../../.env' });
const { generateAccessToken } = require('./src/utils/jwt.ts');
const token = generateAccessToken({ employeeId: 1, companyId: 1, branchId: 1, username: 'admin', roles: ['ADMIN'], permissions: ['properties.read'] });

fetch('http://127.0.0.1:3000/api/v1/properties', {
  headers: {
    Authorization: `Bearer ${token}`
  }
}).then(res => res.json()).then(data => {
  console.log(JSON.stringify(data, null, 2));
}).catch(console.error);
