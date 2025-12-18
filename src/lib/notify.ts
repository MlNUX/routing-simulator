export async function notify(message: string): Promise<void> {
  const text = String(message ?? '');

  if (typeof window === 'undefined') {
    console.log(`[notify] ${text}`);
    return;
  }

  console.log(`[notify] ${text}`);
}

