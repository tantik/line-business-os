import { Cron } from 'croner';
import { serverEnv } from '@line-os/config/env';
import { sendBookingReminders } from './jobs/booking-reminders.js';

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

  console.log('Worker started. Scheduled jobs registered.');
}

main();
