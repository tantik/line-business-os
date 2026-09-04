import { Cron } from 'croner';
import { serverEnv } from '@line-os/config/env';
import { sendBookingReminders } from './jobs/booking-reminders.js';
import { runAutoScheduleMonthly } from './jobs/auto-schedule-monthly.js';

/**
 * Worker entrypoint: scheduled jobs, LINE reminders, async processing.
 *
 * Jobs run with a service-role client but MUST stay tenant-scoped: iterate
 * tenants explicitly and never join across tenant boundaries.
 */
function main() {
  serverEnv(); // fail fast on bad config

  // Every 5 minutes: send due booking reminders via LINE.
  new Cron('*/5 * * * *', { name: 'booking-reminders' }, async () => {
    try {
      const count = await sendBookingReminders();
      if (count > 0) console.log(`booking-reminders: sent ${count}`);
    } catch (err) {
      console.error('booking-reminders failed:', err);
    }
  });

  // Once an hour: check every opted-in location's scheduled monthly
  // auto-create (Manager ON/OFF + day-of-month, `workforce.schedule_settings`).
  // Hourly (not daily) so a location is picked up promptly even if the
  // worker was down at the exact trigger moment on its configured day; the
  // job itself is idempotent per (location, target month), so repeat ticks
  // on the same day are safe no-ops once a location has already generated.
  new Cron('0 * * * *', { name: 'auto-schedule-monthly' }, async () => {
    try {
      const summaries = await runAutoScheduleMonthly();
      for (const summary of summaries) {
        console.log(
          `auto-schedule-monthly: location ${summary.locationId} (tenant ${summary.tenantId}) -> ${summary.targetMonth}: ` +
            `${summary.created} draft shifts, ${summary.shortages} shortages, ${summary.unplaced} unplaced, ` +
            `${summary.assignedWithoutPreference} assigned without preference`,
        );
      }
    } catch (err) {
      console.error('auto-schedule-monthly failed:', err);
    }
  });

  console.log('Worker started. Scheduled jobs registered.');
}

main();
