/**
 * @fileoverview This file contains the "engine" for running scheduled tasks.
 * It reads tasks from the database and uses node-cron to schedule them.
 * This script should be run once when the server starts.
 */
'use server';

import cron from 'node-cron';
import { getAllScheduledTasks } from '@/modules/notifications/lib/db';
import { AVAILABLE_TASKS } from './task-registry';
import { logInfo, logError } from './logger';

// In-memory store for currently running cron jobs
const scheduledJobs = new Map<number, cron.ScheduledTask>();

/**
 * Reads tasks from the DB, stops existing jobs, and schedules new ones.
 */
export async function runScheduledTasks() {
  console.log('🔄 Initializing scheduled tasks runner...');

  // Stop any previously scheduled jobs to prevent duplicates during hot-reloads
  if (scheduledJobs.size > 0) {
    console.log(`- Stopping ${scheduledJobs.size} existing scheduled jobs...`);
    for (const job of scheduledJobs.values()) {
      job.stop();
    }
    scheduledJobs.clear();
  }

  try {
    const tasks = await getAllScheduledTasks();
    const activeTasks = tasks.filter(task => task.enabled);

    if (activeTasks.length === 0) {
        console.log('✅ No active scheduled tasks found. Cron runner is idle.');
        return;
    }

    console.log(`- Found ${activeTasks.length} active task(s) to schedule.`);

    for (const task of activeTasks) {
      if (cron.validate(task.schedule) && AVAILABLE_TASKS[task.taskId]) {
        const job = cron.schedule(task.schedule, async () => {
          console.log(`🏃‍♂️ Running scheduled task: ${task.name}`);
          await logInfo(`Scheduled task started: ${task.name}`, { taskId: task.taskId, schedule: task.schedule });
          try {
            const action = AVAILABLE_TASKS[task.taskId].action;
            await action();
            await logInfo(`Scheduled task finished successfully: ${task.name}`);
          } catch (error: any) {
            await logError(`Scheduled task failed: ${task.name}`, { taskId: task.taskId, error: error.message });
          }
        });
        scheduledJobs.set(task.id, job);
        console.log(`- ✅ Scheduled '${task.name}' with schedule '${task.schedule}'`);
      } else {
        await logError(`Invalid task configuration skipped: ${task.name}`, { taskId: task.taskId, schedule: task.schedule });
        console.error(`- ❌ Invalid cron schedule or unknown task ID for '${task.name}'. Skipping.`);
      }
    }
    
    console.log(`🚀 Cron runner initialization complete. ${scheduledJobs.size} jobs running.`);

  } catch (error: any) {
    console.error('❌ FATAL: Could not initialize scheduled tasks runner.', error);
    await logError('Cron runner initialization failed.', { error: error.message });
  }
}
