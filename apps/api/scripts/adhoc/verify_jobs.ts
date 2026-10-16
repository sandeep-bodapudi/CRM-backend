import { jobManager } from './src/jobs/index';
import './src/jobs/scheduler';

const verify = async () => {
  const jobsToTest = [
    'Lead Follow-Up Reminders',
    'Stale Lead Flagging',
    'Daily Attendance Rollup',
    'Expired Session Cleanup',
    'Commission Calculation Batch',
    'Backup Verification',
    'Report Generation',
  ];

  for (const jobName of jobsToTest) {
    console.log(`\n======================================`);
    console.log(`[TEST] Triggering ${jobName} - RUN 1`);
    console.log(`======================================`);
    await jobManager.trigger(jobName);

    console.log(`\n======================================`);
    console.log(`[TEST] Triggering ${jobName} - RUN 2 (Idempotency)`);
    console.log(`======================================`);
    await jobManager.trigger(jobName);
  }

  console.log(`\n======================================`);
  console.log(`[TEST] Triggering Failing Test Job`);
  console.log(`======================================`);
  try {
    await jobManager.trigger('Failing Test Job');
  } catch (e: any) {
    console.log(`[TEST] Successfully caught intentional failure: ${e.message}`);
  }
};

verify()
  .then(() => console.log('\nVerification complete.'))
  .catch(console.error);
