import cron from 'node-cron';
import { logger } from '../utils/logger';

const JOB_FAILED_TYPE = 'JOB_FAILED';

// A failing job used to only write a log line nobody reads. Tell each active
// MD/Admin in the app instead, at most once a day per job.
async function alertJobFailure(jobName: string, error: unknown) {
  const { prisma } = await import('../lib/prisma');
  const { notifyEmployee } = await import('../utils/notifyEmployee');
  const { Roles } = await import('../shared');
  const people = await prisma.employee.findMany({
    where: {
      status: 'ACTIVE',
      roles: {
        some: { role: { name: { in: [Roles.MD, Roles.ADMIN, Roles.TECHNICAL_MANAGER] } } },
      },
    },
    select: { id: true },
  });
  const since = new Date(Date.now() - 20 * 3600 * 1000);
  const title = `Background job failed: ${jobName}`;
  const reason = String((error as any)?.message || error).slice(0, 300);
  for (const person of people) {
    const recent = await prisma.notification.count({
      where: { employee_id: person.id, type: JOB_FAILED_TYPE, title, created_at: { gt: since } },
    });
    if (recent > 0) continue;
    await notifyEmployee(person.id, {
      type: JOB_FAILED_TYPE,
      title,
      message: `The scheduled job "${jobName}" stopped with an error: ${reason}. It will try again at its next run; tell the technical team if this repeats.`,
    });
  }
}

// Job functions will be registered here.
export type JobFn = () => Promise<void>;

interface JobConfig {
  name: string;
  schedule: string;
  handler: JobFn;
  envDisableKey: string;
}

export class JobManager {
  private jobs: JobConfig[] = [];

  register(config: JobConfig) {
    this.jobs.push(config);
  }

  startAll() {
    this.jobs.forEach((job) => {
      if (process.env[job.envDisableKey] === 'true') {
        logger.info(`[Jobs] Skipping ${job.name} (Disabled via ${job.envDisableKey})`);
        return;
      }

      logger.info(`[Jobs] Scheduling ${job.name} at ${job.schedule} (Asia/Kolkata)`);
      // Explicit timezone -- without this, node-cron falls back to the
      // process's local timezone, which on this server only happens to be
      // IST because .env sets TZ=Asia/Kolkata. That's an environment
      // dependency, not a guarantee; a deploy target that doesn't load .env
      // (or overrides TZ) would silently shift every job's fire time, the
      // same bug class already found and fixed elsewhere for attendance.
      cron.schedule(
        job.schedule,
        async () => {
          try {
            logger.info(`[Jobs] Starting ${job.name}...`);
            const start = performance.now();
            await job.handler();
            const duration = Math.round(performance.now() - start);
            logger.info(`[Jobs] Completed ${job.name} successfully in ${duration}ms.`);
          } catch (error) {
            logger.error({ err: error }, `[Jobs] FAILURE in ${job.name}: Alerting system!`);
            alertJobFailure(job.name, error).catch((err) =>
              logger.error({ err }, `[Jobs] Could not send the failure alert for ${job.name}`),
            );
          }
        },
        { timezone: 'Asia/Kolkata' },
      );
    });
  }

  // Used for manual execution & testing idempotency
  async trigger(name: string) {
    const job = this.jobs.find((j) => j.name === name);
    if (!job) throw new Error(`Job ${name} not found`);
    logger.info(`[Jobs] Manually triggering ${job.name}...`);
    try {
      const start = performance.now();
      await job.handler();
      const duration = Math.round(performance.now() - start);
      logger.info(
        `[Jobs] Manual execution of ${job.name} completed successfully in ${duration}ms.`,
      );
    } catch (error) {
      logger.error(
        { err: error },
        `[Jobs] FAILURE in manual execution of ${job.name}: Alerting system!`,
      );
      throw error;
    }
  }
}

export const jobManager = new JobManager();
