'use client';

import AppLayout from '@/components/AppLayout';
import MiniSplitKitsPanel from '@/components/MiniSplitKitsPanel';

export default function MiniSplitsPage() {
  return (
    <AppLayout>
      <main style={{ maxWidth: '1600px', margin: '0 auto', width: '100%' }}>
        <MiniSplitKitsPanel />
      </main>
    </AppLayout>
  );
}
