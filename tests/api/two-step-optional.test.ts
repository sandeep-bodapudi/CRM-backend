import '../../apps/api/src/server';
import { needsTwoStep, twoStepRecommended } from '../../apps/api/src/middleware/auth';
import { Roles } from '@rrh-ems/shared';

// 2026-11-02 (owner): 2-step login is optional. MD/Admin/Finance are reminded,
// never blocked, unless the server sets TWO_STEP_REQUIRED=true.
describe('2-step login is optional', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env.TWO_STEP_REQUIRED = saved.TWO_STEP_REQUIRED;
    process.env.TWO_STEP_DISABLED = saved.TWO_STEP_DISABLED;
  });

  it('is recommended for MD, Admin and Finance only', () => {
    expect(twoStepRecommended([Roles.MD])).toBe(true);
    expect(twoStepRecommended([Roles.FINANCE])).toBe(true);
    expect(twoStepRecommended([Roles.TELECALLER])).toBe(false);
  });

  it('never blocks anyone by default', () => {
    delete process.env.TWO_STEP_REQUIRED;
    delete process.env.TWO_STEP_DISABLED;
    expect(needsTwoStep([Roles.MD])).toBe(false);
    expect(needsTwoStep([Roles.ADMIN])).toBe(false);
  });

  it('can be made compulsory again with TWO_STEP_REQUIRED', () => {
    process.env.TWO_STEP_REQUIRED = 'true';
    delete process.env.TWO_STEP_DISABLED;
    expect(needsTwoStep([Roles.MD])).toBe(true);
    expect(needsTwoStep([Roles.TELECALLER])).toBe(false);
  });
});
