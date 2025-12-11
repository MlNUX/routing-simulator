// src/lib/notify.ts
export async function notify(message: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    console.warn('Notifications not supported in this environment');
    return;
  }

  let permission = Notification.permission;

  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }

  if (permission === 'granted') {
    new Notification(message);
  } else {
    console.log('Notification:', message);
  }
}

