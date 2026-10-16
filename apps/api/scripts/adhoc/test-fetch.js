
const http = require('http');
fetch('http://localhost:3000/api/v1/attendance/calendar?year=2026&month=9&employeeId=4', { headers: { 'Authorization': 'Bearer test' } })
  .then(r => r.text())
  .then(t => console.log(t))
  .catch(e => console.error(e));

