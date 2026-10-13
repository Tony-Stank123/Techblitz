// api/_lib/realtime.js
// Supabase Realtime Broadcast Event Dispatcher
import { supabase } from './db.js';

export async function broadcastEvent(channelName, eventName, payload) {
  if (!supabase) {
    console.warn(`[REALTIME MOCK] (${channelName}) -> ${eventName}:`, payload);
    return;
  }

  try {
    const broadcastPromise = new Promise(async resolve => {
      try {
        const channel = supabase.channel(channelName);
        channel.subscribe(status => {
          if (status === 'SUBSCRIBED') {
            channel.send({
              type: 'broadcast',
              event: eventName,
              payload
            }).catch(() => {}).finally(() => {
              supabase.removeChannel(channel).catch(() => {});
              resolve();
            });
          }
        });
      } catch {
        resolve();
      }
    });

    await Promise.race([
      broadcastPromise,
      new Promise(resolve => setTimeout(resolve, 800))
    ]);
  } catch (err) {
    console.warn(`[REALTIME NON-BLOCKING] Broadcast ${eventName} on ${channelName}:`, err.message);
  }
}
