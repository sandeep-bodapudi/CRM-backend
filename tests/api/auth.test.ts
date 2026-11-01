import request from 'supertest';
import app from '../../apps/api/src/server';
import { prisma } from '../../apps/api/src/lib/prisma';

describe('Phase 1 - Authentication & Session Security', () => {
  const testIp1 = '192.168.1.100';
  const testIp2 = '192.168.1.101';
  let validRefreshTokenCookie = '';

  let validTestUserId: number;

  beforeAll(async () => {
    // Ensure test environment vars are set if not handled by setup.ts
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-secret-access';
    process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-secret-refresh';

    // Create a syntactically valid test user specifically for auth tests
    // so we don't modify the Phase 0 fixture or production data.
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('Radhareal@123', 12);

    // Check if test company exists
    let testCompany = await prisma.company.findUnique({ where: { code: 'TEST_COMP_01' } });
    if (!testCompany) {
      testCompany = await prisma.company.create({
        data: { name: 'Test Company', code: 'TEST_COMP_01' },
      });
    }

    const testUser = await prisma.employee.upsert({
      where: { employee_code: 'RRH-ADMIN-001' },
      update: {},
      create: {
        employee_code: 'RRH-ADMIN-001',
        full_name: 'Auth Test User',
        email: 'authtest@example.com',
        phone: '+919999999999',
        password_hash: hash,
        department: 'IT',
        job_title: 'Admin',
        company: { connect: { id: testCompany.id } },
        roles: {
          create: {
            role: {
              connectOrCreate: { where: { name: 'ADMIN' }, create: { name: 'ADMIN' } },
            },
          },
        },
      },
    });
    validTestUserId = testUser.id;
  });

  afterAll(async () => {
    // Cleanup any lingering test data specific to auth (like sessions)
    await prisma.authSession.deleteMany({
      where: { employee_id: validTestUserId },
    });
    await prisma.kioskCredential.deleteMany({
      where: { created_by_id: validTestUserId },
    });
    await prisma.employeeRole.deleteMany({
      where: { employee_id: validTestUserId },
    });
    await prisma.employee.delete({
      where: { id: validTestUserId },
    });
    await prisma.$disconnect();
  });

  // 1. Generic Login Failure & 10. No enumeration
  it('should return generic error for invalid username', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', testIp1)
      .send({ employee_code: 'RRH-XXX-999', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('should return generic error for invalid password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', testIp1)
      .send({ employee_code: 'RRH-ADMIN-001', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  // 3. Rate limiting and 4. Limiter reset
  it('should rate limit after 5 failed attempts and reset on success', async () => {
    // This test now explicitly fails 5 times independently to prevent reliance on previous tests
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', testIp1)
        .set('x-strict-rate-limit', 'true')
        .send({ employee_code: 'RRH-ADMIN-001', password: 'wrongpassword' });
    }

    // 6th attempt should hit rate limit
    const rateLimitedRes = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', testIp1)
      .set('x-strict-rate-limit', 'true')
      .send({ employee_code: 'RRH-ADMIN-001', password: 'wrongpassword' });

    expect(rateLimitedRes.status).toBe(429);
    expect(rateLimitedRes.body.error).toMatch(/Too many login attempts/);

    // Another IP should NOT be rate limited
    const otherIpRes = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', testIp2)
      .set('x-strict-rate-limit', 'true')
      .send({ employee_code: 'RRH-ADMIN-001', password: 'wrongpassword' });

    expect(otherIpRes.status).toBe(401);

    // Wait, we can't reset it manually via API, but successful login resets it.
    // BUT we are currently rate-limited on testIp1. A successful login WILL be blocked by the rate limiter!
    // Ah, if we are rate limited, we can't even try to login.
    // The requirement "successful-login limiter reset" means if we have 4 failures, 1 success resets it back to 0.
    // Let's test this on testIp2.
  });

  it('should reset rate limit on successful login', async () => {
    // Fail 4 times on testIp2
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', testIp2)
        .set('x-strict-rate-limit', 'true')
        .send({ employee_code: 'RRH-ADMIN-001', password: 'wrongpassword' });
    }

    // 1 Success on testIp2 (resets counter)
    const successRes = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', testIp2)
      .set('x-strict-rate-limit', 'true')
      .send({ employee_code: 'RRH-ADMIN-001', password: 'Radhareal@123' }); // default password

    expect(successRes.status).toBe(200);
    expect(successRes.body.accessToken).toBeDefined();

    // Save cookie for later tests
    const cookies = Array.isArray(successRes.headers['set-cookie'])
      ? successRes.headers['set-cookie']
      : [successRes.headers['set-cookie']];
    expect(cookies[0]).toBeDefined();
    const refreshTokenCookie = cookies.find((c: string) => c?.startsWith('refreshToken='));
    expect(refreshTokenCookie).toBeDefined();
    validRefreshTokenCookie = refreshTokenCookie;

    // Fail 2 times on testIp2
    await request(app)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', testIp2)
      .set('x-strict-rate-limit', 'true')
      .send({ employee_code: 'RRH-XXX-999', password: 'wrongpassword' });
    const checkRes = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', testIp2)
      .set('x-strict-rate-limit', 'true')
      .send({ employee_code: 'RRH-XXX-999', password: 'wrongpassword' });

    // If reset didn't work, we'd be at 6 failures and this would be 429. Since it worked, it's 401.
    expect(checkRes.status).toBe(401);
  });

  // 12. Missing/invalid refresh token
  it('should reject refresh with missing token', async () => {
    const res = await request(app).post('/api/v1/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('should reject refresh with invalid token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', ['refreshToken=invalid-token-string']);
    expect(res.status).toBe(401);
  });

  // 5. Refresh success and 6. Refresh rotation
  let rotatedRefreshTokenCookie = '';
  it('should rotate refresh token successfully', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [validRefreshTokenCookie]);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();

    const cookies = Array.isArray(res.headers['set-cookie'])
      ? res.headers['set-cookie']
      : [res.headers['set-cookie']];
    rotatedRefreshTokenCookie = cookies.find((c: string) => c?.startsWith('refreshToken='));

    expect(rotatedRefreshTokenCookie).toBeDefined();
    expect(rotatedRefreshTokenCookie).not.toEqual(validRefreshTokenCookie);
  });

  // 7. Old-token rejection and 8. Refresh-token reuse detection and 9. Entire-family revocation
  it('should detect reuse of consumed token and revoke entire family', async () => {
    // A reuse within 30 s of the first use is treated as two tabs refreshing
    // together (see the next test); age the used key past that window so
    // this reuse counts as a stolen key.
    await prisma.authSession.updateMany({
      where: { consumed: true, updated_at: { gt: new Date(Date.now() - 60 * 1000) } },
      data: { updated_at: new Date(Date.now() - 60 * 1000) },
    });
    // Reuse the OLD consumed token
    const reuseRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [validRefreshTokenCookie]);

    // Should return 401 Compromised
    expect(reuseRes.status).toBe(401);
    expect(reuseRes.body.error).toBe('Session compromised');

    // Now try to use the NEW (legitimate) rotated token - it should ALSO fail because the family was revoked
    const legitRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [rotatedRefreshTokenCookie]);

    expect(legitRes.status).toBe(401);
    expect(legitRes.body.error).toBe('Session revoked');
  });

  // 10. Concurrent refresh/reuse behavior
  it('should handle concurrent refresh safely', async () => {
    // Generate a fresh session
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '192.168.1.103')
      .send({ employee_code: 'RRH-ADMIN-001', password: 'Radhareal@123' });

    const rawCookie1 = loginRes.headers['set-cookie'];
    const cookies1 = Array.isArray(rawCookie1) ? rawCookie1 : [rawCookie1];
    const tokenCookie = cookies1.find((c: string) => c?.startsWith('refreshToken='));

    // Fire two requests concurrently
    const [res1, res2] = await Promise.all([
      request(app).post('/api/v1/auth/refresh').set('Cookie', [tokenCookie]),
      request(app).post('/api/v1/auth/refresh').set('Cookie', [tokenCookie]),
    ]);

    // Two tabs refreshing together with the same key both get a new one
    // (this used to revoke the whole sign-in and log the person out).
    expect([res1.status, res2.status]).toEqual([200, 200]);
  });

  // 11. Logout revocation
  it('should revoke session on logout', async () => {
    // Login again
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '192.168.1.104')
      .send({ employee_code: 'RRH-ADMIN-001', password: 'Radhareal@123' });

    const rawCookie2 = loginRes.headers['set-cookie'];
    const cookies2 = Array.isArray(rawCookie2) ? rawCookie2 : [rawCookie2];
    const tokenCookie = cookies2.find((c: string) => c?.startsWith('refreshToken='));

    // Logout
    const logoutRes = await request(app).post('/api/v1/auth/logout').set('Cookie', [tokenCookie]);

    expect(logoutRes.status).toBe(200);

    // Try to refresh with revoked token
    const refreshRes = await request(app).post('/api/v1/auth/refresh').set('Cookie', [tokenCookie]);

    expect(refreshRes.status).toBe(401);
  });
});
